import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import type { BatchItem } from "drizzle-orm/batch";
import type { DB } from "@/db";
import { auditLogs } from "@/db/schema";

/**
 * 監査ログ (Postgres のトリガー private.audit_row を置き換える)。
 *
 * D1 は対話的なトランザクションを持たないため、保存処理と同じ db.batch() に監査ログの INSERT を入れて
 * 1 つのトランザクションにする。楽観的ロック付きの更新のように「更新できた場合だけ」記録したいときは
 * auditIfChanged() を更新文の直後に置く (SQLite の changes() = 直前の文で変更された行数)。
 */

export type AuditTarget = "applications" | "selection_steps" | "events" | "student_memberships";

/** 変更履歴に残さない列 (自動更新される列と秘密情報) */
const IGNORED = new Set([
  "updated_at",
  "version",
  "created_by",
  "updated_by",
  "ended_by",
  "company_name_normalized",
  "token_hash",
  "join_code_hash",
]);

type Values = Record<string, unknown>;

/** UPDATE の差分 (変更された列のみ)。実質的な変更が無ければ null */
export function diffValues(before: Values, after: Values): { old: Values; new: Values } | null {
  const oldDiff: Values = {};
  const newDiff: Values = {};
  for (const [key, value] of Object.entries(after)) {
    if (IGNORED.has(key) || value === undefined) continue;
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(value ?? null)) {
      oldDiff[key] = before[key] ?? null;
      newDiff[key] = value ?? null;
    }
  }
  return Object.keys(newDiff).length ? { old: oldDiff, new: newDiff } : null;
}

/** INSERT / DELETE 時の値 (無視する列と null を除く) */
export function snapshot(row: Values): Values {
  return Object.fromEntries(Object.entries(row).filter(([k, v]) => !IGNORED.has(k) && v !== null && v !== undefined));
}

export type AuditEntry = {
  actorId: string | null;
  targetType: AuditTarget;
  targetId: string;
  applicationId: string | null;
  studentId: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  oldValues: Values | null;
  newValues: Values | null;
};

/** 無条件に記録する (batch 内で使う) */
export function auditInsert(db: DB, e: AuditEntry) {
  return db.insert(auditLogs).values({
    actor_id: e.actorId,
    target_type: e.targetType,
    target_id: e.targetId,
    application_id: e.applicationId,
    student_id: e.studentId,
    action: e.action,
    old_values: e.oldValues,
    new_values: e.newValues,
  });
}

const dialect = new SQLiteAsyncDialect();

/**
 * 生の SQL を db.batch() に入れるためのラッパー。
 * drizzle の db.run() はパラメーター付きだと D1 の batch で使えない (prepare 済みの文を持たない) ため、
 * D1 の文を自前で prepare して渡す。結果は D1 の生の結果 (meta.changes など) になる。
 */
export function rawStatement(db: DB, query: SQL): BatchItem<"sqlite"> {
  const built = dialect.sqlToQuery(query);
  return {
    _prepare: () => ({
      getQuery: () => built,
      stmt: db.$client.prepare(built.sql),
      mapResult: (result: unknown) => result,
    }),
  } as unknown as BatchItem<"sqlite">;
}

/** 直前の文で 1 行以上変更された場合だけ記録する (batch 内で、対象の更新文の直後に置く) */
export function auditIfChanged(db: DB, e: AuditEntry) {
  return rawStatement(db, sql`insert into audit_logs (actor_id, target_type, target_id, application_id, student_id, action, old_values, new_values)
    select ${e.actorId}, ${e.targetType}, ${e.targetId}, ${e.applicationId}, ${e.studentId}, ${e.action},
           ${e.oldValues ? JSON.stringify(e.oldValues) : null}, ${e.newValues ? JSON.stringify(e.newValues) : null}
    where changes() > 0`);
}

/** 条件付き INSERT: guard が真のときだけ行を追加する (batch 内で後続の更新と原子的に揃えるため) */
export function insertWhere(db: DB, table: string, row: Values, guard: SQL) {
  const entries = Object.entries(row).filter(([, v]) => v !== undefined);
  const cols = sql.raw(entries.map(([k]) => `"${k}"`).join(", "));
  const vals = sql.join(
    entries.map(([, v]) => sql`${typeof v === "boolean" ? (v ? 1 : 0) : v}`),
    sql`, `,
  );
  return rawStatement(db, sql`insert into ${sql.identifier(table)} (${cols}) select ${vals} where ${guard}`);
}
