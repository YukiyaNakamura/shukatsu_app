import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { applications, auditLogs, selectionSteps } from "@/db/schema";
import type { DB } from "@/db";
import { auditIfChanged, insertWhere } from "@/lib/server/audit";
import { createTestDb, createUser } from "./harness";

/** サービス層が前提にしている D1 (SQLite) の挙動 */
let db: DB;
let dispose: () => Promise<void>;
let studentId: string;

beforeAll(async () => {
  ({ db, dispose } = await createTestDb());
  studentId = (await createUser(db, { role: "STUDENT" })).actor.id;
});
afterAll(() => dispose());

/** drizzle は D1 のエラーを "Failed query" で包むため、原因 (cause) のメッセージで判定する */
const cause = (re: RegExp) => (e: unknown) => re.test(String((e as { cause?: Error }).cause?.message ?? e));

async function newApp() {
  const id = crypto.randomUUID();
  await db.insert(applications).values({ id, student_id: studentId, company_name: "A社", selection_type: "FULL_TIME" });
  return id;
}

describe("D1 の前提", () => {
  it("batch 内の changes() で、更新できたときだけ監査ログが記録される", async () => {
    const id = await newApp();
    const entry = { actorId: studentId, targetType: "applications" as const, targetId: id, applicationId: id, studentId, action: "UPDATE" as const, oldValues: { status: "PLANNED" }, newValues: { status: "ACCEPTED" } };
    // version 不一致 → 0 行 → 記録されない
    const [miss] = await db.batch([
      db.update(applications).set({ status: "ACCEPTED" }).where(and(eq(applications.id, id), eq(applications.version, 99))).returning(),
      auditIfChanged(db, entry),
    ]);
    expect(miss).toHaveLength(0);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.target_id, id))).toHaveLength(0);
    // version 一致 → 1 行 → 記録される
    const [hit] = await db.batch([
      db.update(applications).set({ status: "ACCEPTED", version: sql`${applications.version} + 1` }).where(and(eq(applications.id, id), eq(applications.version, 1))).returning(),
      auditIfChanged(db, entry),
    ]);
    expect(hit).toHaveLength(1);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.target_id, id));
    expect(logs).toHaveLength(1);
    expect(logs[0].new_values).toEqual({ status: "ACCEPTED" });
  });

  it("batch はエラー時にすべてロールバックされる", async () => {
    const id = await newApp();
    await expect(
      db.batch([
        db.update(applications).set({ memo: "途中" }).where(eq(applications.id, id)),
        db.update(applications).set({ priority: 9 }).where(eq(applications.id, id)), // CHECK 違反
      ]),
    ).rejects.toThrow();
    const row = await db.select().from(applications).where(eq(applications.id, id)).get();
    expect(row?.memo).toBeNull();
  });

  it("CHECK 制約・外部キー・複合外部キーが有効", async () => {
    const id = await newApp();
    await expect(db.update(applications).set({ is_early_selection: true, selection_type: "INTERNSHIP" }).where(eq(applications.id, id))).rejects.toSatisfy(cause(/CHECK/));
    await expect(db.update(applications).set({ company_url: "javascript:alert(1)" }).where(eq(applications.id, id))).rejects.toSatisfy(cause(/CHECK/));
    await expect(db.insert(applications).values({ id: crypto.randomUUID(), student_id: crypto.randomUUID(), company_name: "X", selection_type: "FULL_TIME" })).rejects.toSatisfy(cause(/FOREIGN KEY/));
    // 別の応募のステップは現在段階にできない
    const other = await newApp();
    const stepId = crypto.randomUUID();
    await db.insert(selectionSteps).values({ id: stepId, application_id: other, step_type: "DOCUMENT", display_name: "ES", position: 0 });
    await expect(db.update(applications).set({ current_step_id: stepId }).where(eq(applications.id, id))).rejects.toSatisfy(cause(/FOREIGN KEY/));
    await db.update(applications).set({ current_step_id: stepId }).where(eq(applications.id, other));
  });

  it("insertWhere は条件が偽なら行を追加しない", async () => {
    const id = await newApp();
    const row = { id: crypto.randomUUID(), application_id: id, step_type: "OTHER", display_name: "x", position: 0 };
    await db.batch([insertWhere(db, "selection_steps", row, sql`1 = 0`)]);
    expect(await db.select().from(selectionSteps).where(eq(selectionSteps.application_id, id))).toHaveLength(0);
    await db.batch([insertWhere(db, "selection_steps", row, sql`1 = 1`)]);
    expect(await db.select().from(selectionSteps).where(eq(selectionSteps.application_id, id))).toHaveLength(1);
  });
});
