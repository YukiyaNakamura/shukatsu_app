import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { applications, auditLogs, invitations, organizationMembers, organizations, selectionSteps, studentMemberships, user } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import type { DataContext } from "@/lib/server/context";
import {
  createApplication,
  getApplication,
  getApplicationHistory,
  getApplicationOverview,
  listApplications,
  listSteps,
  reorderSteps,
  setApplicationDeleted,
  setCurrentStage,
  setCurrentStep,
  updateApplicationWithVersion,
} from "@/lib/data/applications";
import { createStep, deleteStep, updateStepWithVersion } from "@/lib/data/steps";
import { createEvent, listCalendarItems, updateEvent } from "@/lib/data/calendar";
import {
  acceptInvitation,
  cancelJoinRequest,
  createInvitation,
  createOrganization,
  endMembership,
  getInvitation,
  getOrganization,
  getStudentMembership,
  listInvitations,
  listOrgStudents,
  regenerateJoinCode,
  removeOrgMember,
  requestJoin,
  reviewJoinRequest,
  revokeInvitation,
} from "@/lib/data/organization";
import { cancelAccountDeletion, getProfile, processAccountDeletion, requestAccountDeletion, updateProfile } from "@/lib/data/account";
import { CONSENT_VERSION } from "@/lib/constants";
import { createTestDb, createUser } from "./harness";

let db: DB;
let dispose: () => Promise<void>;
beforeAll(async () => {
  ({ db, dispose } = await createTestDb());
});
afterAll(() => dispose());

/** ApiError のコードで失敗することを確認する */
async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected ${code}`).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
}

const student = () => createUser(db, { role: "STUDENT" });
const admin = () => createUser(db, { role: "ADMIN" });
const newApp = (ctx: DataContext, name = "テスト株式会社", type: "FULL_TIME" | "INTERNSHIP" = "FULL_TIME") =>
  createApplication(ctx, { companyName: name, selectionType: type, useTemplate: true });

/** 管理者が組織を作成し、学生を招待リンクで所属させる */
async function orgWithStudent() {
  const owner = await admin();
  const org = await createOrganization(owner, "テスト組織");
  const s = await student();
  const { token } = await createInvitation(owner, { email: null, role: "STUDENT" });
  await acceptInvitation(s, token, CONSENT_VERSION);
  return { owner, org, s };
}

describe("プロフィールと権限昇格対策", () => {
  it("学生は氏名・大学名を更新できるが、ロールは変わらない", async () => {
    const s = await student();
    const p = await updateProfile(s, { fullName: " 山田 太郎 ", universityName: "東京大学" });
    expect(p).toMatchObject({ full_name: "山田 太郎", university_name: "東京大学", role: "STUDENT" });
  });

  it("学生は大学名を空にできない (DB の CHECK 制約)", async () => {
    const s = await student();
    await expect(db.update(user).set({ universityName: null }).where(eq(user.id, s.actor.id))).rejects.toThrow();
  });

  it("学生は組織を作成できない", async () => {
    await expectCode(createOrganization(await student(), "X"), "NOT_ADMIN_ACCOUNT");
  });

  it("管理者は 2 つ目の組織を作れない", async () => {
    const a = await admin();
    await createOrganization(a, "A");
    await expectCode(createOrganization(a, "B"), "ALREADY_IN_ORGANIZATION");
  });

  it("組織情報に組織コードのハッシュは含まれない", async () => {
    const a = await admin();
    const org = await createOrganization(a, "A");
    await regenerateJoinCode(a);
    expect(await getOrganization(a, org.id)).not.toHaveProperty("join_code_hash");
  });

  it("無関係なユーザーは組織情報を取得できない", async () => {
    const a = await admin();
    const org = await createOrganization(a, "A");
    await expectCode(getOrganization(await student(), org.id), "NOT_FOUND");
    await expectCode(getOrganization(await admin(), org.id), "NOT_FOUND");
  });
});

describe("応募と選考ステップ", () => {
  it("本選考はテンプレート 5 ステップ、インターンは 3 ステップで作成され、現在段階は先頭", async () => {
    const s = await student();
    const full = await newApp(s);
    const intern = await newApp(s, "B社", "INTERNSHIP");
    const fullSteps = await listSteps(s, full.id);
    expect(fullSteps.map((x) => x.display_name)).toEqual(["ES", "適性検査", "一次面接", "二次面接", "最終面接"]);
    expect(await listSteps(s, intern.id)).toHaveLength(3);
    expect(full.current_step_id).toBe(fullSteps[0].id);
    expect(full.current_step_name).toBe("ES");
    expect(full.version).toBe(1);
  });

  it("同じ企業に何度でも応募でき、企業名は正規化される", async () => {
    const s = await student();
    const a = await newApp(s, "株式会社ＡＢＣ　ホールディングス");
    const b = await newApp(s, "ABCホールディングス(株)");
    expect(a.company_name_normalized).toBe("abcホールディングス");
    expect(b.company_name_normalized).toBe("abcホールディングス");
  });

  it("他人の student_id で応募を作成できない", async () => {
    const other = await student();
    await expectCode(
      createApplication(await student(), { companyName: "X", selectionType: "FULL_TIME", studentId: other.actor.id }),
      "FORBIDDEN",
    );
  });

  it("学生は他人の応募を取得・一覧・更新できない", async () => {
    const owner = await student();
    const app = await newApp(owner);
    const intruder = await student();
    await expectCode(getApplication(intruder, app.id), "NOT_FOUND");
    expect(await getApplicationOverview(intruder, app.id)).toBeNull();
    expect(await listApplications(intruder, { studentId: owner.actor.id })).toHaveLength(0);
    expect(await listSteps(intruder, app.id)).toHaveLength(0);
    await expectCode(updateApplicationWithVersion(intruder, app.id, 1, { status: "ACCEPTED" }), "NOT_FOUND");
    await expectCode(setApplicationDeleted(intruder, app.id, true), "NOT_FOUND");
    const step = (await listSteps(owner, app.id))[0];
    await expectCode(updateStepWithVersion(intruder, step.id, 1, { notes: "x" }), "NOT_FOUND");
    await expectCode(deleteStep(intruder, step.id), "NOT_FOUND");
  });

  it("current_step_id に別の応募のステップは設定できない", async () => {
    const s = await student();
    const a = await newApp(s, "A");
    const b = await newApp(s, "B");
    const foreignStep = (await listSteps(s, b.id))[0];
    await expectCode(setCurrentStep(s, a.id, foreignStep.id, 1), "NOT_FOUND");
    // DB の複合外部キーでも拒否される
    await expect(db.update(applications).set({ current_step_id: foreignStep.id }).where(eq(applications.id, a.id))).rejects.toThrow();
  });

  it("インターンの早期選考フラグは false に正規化される", async () => {
    const s = await student();
    const app = await createApplication(s, { companyName: "X", selectionType: "FULL_TIME", isEarlySelection: true });
    expect(app.is_early_selection).toBe(true);
    const updated = await updateApplicationWithVersion(s, app.id, 1, { selection_type: "INTERNSHIP" });
    expect(updated.is_early_selection).toBe(false);
  });

  it("楽観的ロック: version 不一致は VERSION_CONFLICT (最新データ付き)、成功時は version が増える", async () => {
    const s = await student();
    const app = await newApp(s);
    const updated = await updateApplicationWithVersion(s, app.id, 1, { status: "IN_PROGRESS" });
    expect(updated.version).toBe(2);
    const error = await updateApplicationWithVersion(s, app.id, 1, { status: "ACCEPTED" }).catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("VERSION_CONFLICT");
    expect((error as ApiError).details).toMatchObject({ current: { version: 2, status: "IN_PROGRESS" } });
    expect((await getApplication(s, app.id)).status).toBe("IN_PROGRESS");
  });

  it("同時編集: 同じ version からの 2 つの更新は片方だけ成功し、失敗した側の監査ログは残らない", async () => {
    const { owner, s } = await orgWithStudent();
    const app = await newApp(s);
    const results = await Promise.allSettled([
      updateApplicationWithVersion(s, app.id, 1, { memo: "学生の編集" }),
      updateApplicationWithVersion(owner, app.id, 1, { memo: "管理者の編集" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as ApiError).code).toBe("VERSION_CONFLICT");
    const memoLogs = (await db.select().from(auditLogs).where(eq(auditLogs.target_id, app.id))).filter(
      (l) => l.action === "UPDATE" && (l.new_values as Record<string, unknown>)?.memo,
    );
    expect(memoLogs).toHaveLength(1);
  });

  it("set_current_stage: 既存の同種ステップを選び、無ければ追加。version 不一致は VERSION_CONFLICT", async () => {
    const s = await student();
    const app = await newApp(s);
    const updated = await setCurrentStage(s, app.id, "FIRST_INTERVIEW", 1);
    const steps = await listSteps(s, app.id);
    expect(updated.current_step_id).toBe(steps.find((x) => x.step_type === "FIRST_INTERVIEW")!.id);
    expect(steps).toHaveLength(5);
    const added = await setCurrentStage(s, app.id, "GROUP_DISCUSSION", 2);
    const after = await listSteps(s, app.id);
    expect(after).toHaveLength(6);
    expect(after.at(-1)).toMatchObject({ step_type: "GROUP_DISCUSSION", display_name: "グループディスカッション", position: 5 });
    expect(added.current_step_id).toBe(after.at(-1)!.id);
    // 古い version では、ステップも追加されない
    await expectCode(setCurrentStage(s, app.id, "ASSIGNMENT", 2), "VERSION_CONFLICT");
    expect(await listSteps(s, app.id)).toHaveLength(6);
  });

  it("同じ種類のステップを複数回登録できる (再実施)", async () => {
    const s = await student();
    const app = await newApp(s);
    await createStep(s, app.id, { step_type: "FIRST_INTERVIEW", display_name: "一次面接 (再)" });
    const steps = await listSteps(s, app.id);
    expect(steps.filter((x) => x.step_type === "FIRST_INTERVIEW")).toHaveLength(2);
    expect(steps.at(-1)?.position).toBe(5);
  });

  it("ステップの並べ替えは全ステップの指定が必要", async () => {
    const s = await student();
    const app = await newApp(s, "A", "INTERNSHIP");
    const ids = (await listSteps(s, app.id)).map((x) => x.id);
    await expectCode(reorderSteps(s, app.id, ids.slice(0, 2)), "INVALID_STEP_ORDER");
    await expectCode(reorderSteps(s, app.id, [ids[0], ids[0], ids[1]]), "INVALID_STEP_ORDER");
    const reordered = await reorderSteps(s, app.id, [...ids].reverse());
    expect(reordered.map((x) => x.id)).toEqual([...ids].reverse());
  });

  it("ステップの楽観的ロックと、現在段階のステップ削除", async () => {
    const s = await student();
    const app = await newApp(s);
    const first = (await listSteps(s, app.id))[0];
    const updated = await updateStepWithVersion(s, first.id, 1, { scheduled_at: "2026-12-01T01:00:00.000Z", status: "SCHEDULED" });
    expect(updated.version).toBe(2);
    await expectCode(updateStepWithVersion(s, first.id, 1, { notes: "x" }), "VERSION_CONFLICT");
    await deleteStep(s, first.id);
    const after = await getApplication(s, app.id);
    expect(after.current_step_id).toBeNull();
    expect(after.version).toBe(2);
  });

  it("論理削除と復元。削除済みの応募は編集できない", async () => {
    const s = await student();
    const app = await newApp(s);
    const deleted = await setApplicationDeleted(s, app.id, true);
    expect(deleted.deleted_at).not.toBeNull();
    expect(await listApplications(s)).not.toContainEqual(expect.objectContaining({ id: app.id }));
    expect(await listApplications(s, { includeDeleted: true })).toContainEqual(expect.objectContaining({ id: app.id }));
    await expectCode(updateApplicationWithVersion(s, app.id, deleted.version, { memo: "x" }), "APPLICATION_DELETED");
    await expectCode(createStep(s, app.id, { step_type: "OTHER", display_name: "x" }), "APPLICATION_DELETED");
    const restored = await setApplicationDeleted(s, app.id, false);
    expect(restored.deleted_at).toBeNull();
  });

  it("予定に他人の応募を紐づけられない", async () => {
    const s = await student();
    const otherApp = await newApp(await student());
    await expectCode(createEvent(s, { title: "説明会", startsAt: "2026-12-01T10:00:00+09:00", applicationId: otherApp.id }), "NOT_FOUND");
    const ev = await createEvent(s, { title: "説明会", startsAt: "2026-12-01T10:00:00+09:00" });
    expect(ev.starts_at).toBe("2026-12-01T01:00:00.000Z");
    await expectCode(updateEvent(s, ev.id, { applicationId: otherApp.id }), "NOT_FOUND");
    await expectCode(updateEvent(s, ev.id, { endsAt: "2026-11-30T00:00:00Z" }), "VALIDATION_FAILED");
  });

  it("変更履歴に更新者・更新前後の値が残り、他人は閲覧できない", async () => {
    const s = await student();
    const app = await newApp(s);
    await updateApplicationWithVersion(s, app.id, 1, { status: "IN_PROGRESS", company_name: "新社名" });
    const history = await getApplicationHistory(s, app.id);
    const update = history.find((h) => h.action === "UPDATE" && h.target_type === "applications");
    expect(update).toMatchObject({
      actor_id: s.actor.id,
      old_values: { status: "PLANNED", company_name: "テスト株式会社" },
      new_values: { status: "IN_PROGRESS", company_name: "新社名" },
    });
    expect(update?.actor_name).not.toBe("組織の管理者");
    expect(history.filter((h) => h.target_type === "selection_steps" && h.action === "INSERT")).toHaveLength(5);
    await expectCode(getApplicationHistory(await student(), app.id), "NOT_FOUND");
  });
});

describe("組織: 招待リンク", () => {
  it("所属前は管理者から学生の応募が見えない", async () => {
    const owner = await admin();
    await createOrganization(owner, "A");
    const s = await student();
    const app = await newApp(s);
    await expectCode(getApplication(owner, app.id), "NOT_FOUND");
    expect(await listApplications(owner)).toHaveLength(0);
  });

  it("招待作成: トークン平文は返り値のみ、DB にはハッシュのみ。ログイン前でも組織名と状態を確認できる", async () => {
    const owner = await admin();
    await createOrganization(owner, "招待テスト組織");
    const { invitation_id, token } = await createInvitation(owner, { email: null, role: "STUDENT" });
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const row = await db.select().from(invitations).where(eq(invitations.id, invitation_id)).get();
    expect(row?.token_hash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(await listInvitations(owner, row!.organization_id)).not.toContainEqual(expect.objectContaining({ token_hash: expect.anything() }));
    expect(await getInvitation(db, token)).toMatchObject({ organization_name: "招待テスト組織", state: "VALID", email_restricted: false });
    expect((await getInvitation(db, "0".repeat(64))).state).toBe("NOT_FOUND");
  });

  it("招待先メールアドレスと一致しないユーザーは受諾できない", async () => {
    const owner = await admin();
    await createOrganization(owner, "A");
    const { token } = await createInvitation(owner, { email: "invited@example.com", role: "STUDENT" });
    await expectCode(acceptInvitation(await student(), token, CONSENT_VERSION), "INVITATION_EMAIL_MISMATCH");
    const unverified = await createUser(db, { role: "STUDENT", email: "invited@example.com", verified: false });
    await expectCode(acceptInvitation(unverified, token, CONSENT_VERSION), "INVITATION_EMAIL_MISMATCH");
  });

  it("同意なしでは受諾できない", async () => {
    const owner = await admin();
    await createOrganization(owner, "A");
    const { token } = await createInvitation(owner, { email: null, role: "STUDENT" });
    await expectCode(acceptInvitation(await student(), token, null), "CONSENT_REQUIRED");
  });

  it("受諾すると過去の応募も含め管理者に共有され、管理者は編集・代理登録できる", async () => {
    const owner = await admin();
    await createOrganization(owner, "A");
    const s = await student();
    const before = await newApp(s, "受諾前の応募");
    const { token } = await createInvitation(owner, { email: null, role: "STUDENT" });
    await acceptInvitation(s, token, CONSENT_VERSION);
    expect((await listApplications(owner)).map((a) => a.id)).toContain(before.id);
    const edited = await updateApplicationWithVersion(owner, before.id, 1, { memo: "管理者のメモ" });
    expect(edited.updated_by).toBe(owner.actor.id);
    const proxy = await createApplication(owner, { companyName: "代理登録", selectionType: "FULL_TIME", studentId: s.actor.id });
    expect(proxy.student_id).toBe(s.actor.id);
    // 管理者自身を所有者にした応募は作れない
    await expectCode(createApplication(owner, { companyName: "X", selectionType: "FULL_TIME" }), "NOT_STUDENT_ACCOUNT");
  });

  it("使用済み・取り消し済み・期限切れの招待は受諾できない", async () => {
    const owner = await admin();
    const org = await createOrganization(owner, "A");
    const used = await createInvitation(owner, { email: null, role: "STUDENT" });
    await acceptInvitation(await student(), used.token, CONSENT_VERSION);
    await expectCode(acceptInvitation(await student(), used.token, CONSENT_VERSION), "INVITATION_USED");
    const revoked = await createInvitation(owner, { email: null, role: "STUDENT" });
    await revokeInvitation(owner, revoked.invitation_id);
    await expectCode(acceptInvitation(await student(), revoked.token, CONSENT_VERSION), "INVITATION_REVOKED");
    await expectCode(revokeInvitation(owner, revoked.invitation_id), "INVITATION_NOT_REVOCABLE");
    const expired = await createInvitation(owner, { email: null, role: "STUDENT" });
    await db.update(invitations).set({ expires_at: "2000-01-01T00:00:00.000Z" }).where(eq(invitations.id, expired.invitation_id));
    await expectCode(acceptInvitation(await student(), expired.token, CONSENT_VERSION), "INVITATION_EXPIRED");
    expect(org.id).toBeTruthy();
  });

  it("同じ招待を 2 人が同時に受諾しても、所属できるのは 1 人だけ", async () => {
    const owner = await admin();
    const org = await createOrganization(owner, "A");
    const { token } = await createInvitation(owner, { email: null, role: "STUDENT" });
    const [a, b] = [await student(), await student()];
    const results = await Promise.allSettled([acceptInvitation(a, token, CONSENT_VERSION), acceptInvitation(b, token, CONSENT_VERSION)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const members = await db.select().from(studentMemberships).where(eq(studentMemberships.organization_id, org.id));
    expect(members).toHaveLength(1);
  });

  it("2 つの組織に同時所属できない (学生の所属は最大 1 組織)", async () => {
    const { s } = await orgWithStudent();
    const other = await admin();
    await createOrganization(other, "B");
    const { token } = await createInvitation(other, { email: null, role: "STUDENT" });
    await expectCode(acceptInvitation(s, token, CONSENT_VERSION), "ALREADY_IN_ORGANIZATION");
    // DB の部分一意インデックスでも保証
    const second = await createOrganization(await admin(), "C");
    await expect(
      db.insert(studentMemberships).values({ id: crypto.randomUUID(), student_id: s.actor.id, organization_id: second.id, consent_version: "x", consented_at: new Date().toISOString() }),
    ).rejects.toThrow();
  });

  it("他組織の管理者は学生の応募・予定・履歴を取得・更新できない", async () => {
    const { s } = await orgWithStudent();
    const app = await newApp(s);
    const ev = await createEvent(s, { title: "面談", startsAt: "2026-12-02T01:00:00Z" });
    const outsider = await admin();
    await createOrganization(outsider, "他組織");
    await expectCode(getApplication(outsider, app.id), "NOT_FOUND");
    expect(await listApplications(outsider)).toHaveLength(0);
    await expectCode(updateApplicationWithVersion(outsider, app.id, 1, { memo: "x" }), "NOT_FOUND");
    await expectCode(getApplicationHistory(outsider, app.id), "NOT_FOUND");
    await expectCode(updateEvent(outsider, ev.id, { title: "x" }), "NOT_FOUND");
    await expectCode(createEvent(outsider, { title: "x", startsAt: "2026-12-02T01:00:00Z", studentId: s.actor.id }), "FORBIDDEN");
    expect(await listCalendarItems(outsider, { from: "2026-11-01T00:00:00Z", to: "2027-01-01T00:00:00Z" })).toHaveLength(0);
    expect(await listOrgStudents(outsider)).toHaveLength(0);
  });

  it("管理者の招待はオーナーのみ、メール一致で追加管理者になり同じ権限を持つ。オーナーは削除できない", async () => {
    const { owner, org, s } = await orgWithStudent();
    const app = await newApp(s);
    const second = await createUser(db, { role: "ADMIN", email: "second-admin@example.com" });
    const inv = await createInvitation(owner, { email: "second-admin@example.com", role: "ADMIN" });
    await acceptInvitation(second, inv.token, null);
    expect((await getApplication(second, app.id)).id).toBe(app.id);
    await expectCode(createInvitation(second, { email: "x@example.com", role: "ADMIN" }), "FORBIDDEN");
    const ownerRow = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organization_id, org.id), eq(organizationMembers.role, "OWNER"))).get();
    await expectCode(removeOrgMember(second, ownerRow!.id), "FORBIDDEN");
    // 管理者は自分で脱退できる
    const secondRow = await db.select().from(organizationMembers).where(eq(organizationMembers.user_id, second.actor.id)).get();
    await removeOrgMember(second, secondRow!.id);
    await expectCode(getApplication(second, app.id), "NOT_FOUND");
  });

  it("管理者招待の取り消しはオーナーのみ、学生招待は管理者も可。他組織の招待は取り消せない", async () => {
    const owner = await admin();
    await createOrganization(owner, "A");
    const sub = await createUser(db, { role: "ADMIN", email: "sub@example.com" });
    await acceptInvitation(sub, (await createInvitation(owner, { email: "sub@example.com", role: "ADMIN" })).token, null);
    const adminInv = await createInvitation(owner, { email: "x@example.com", role: "ADMIN" });
    const studentInv = await createInvitation(owner, { email: null, role: "STUDENT" });
    await expectCode(revokeInvitation(sub, adminInv.invitation_id), "FORBIDDEN");
    await revokeInvitation(sub, studentInv.invitation_id);
    const outsider = await admin();
    await createOrganization(outsider, "B");
    await expectCode(revokeInvitation(outsider, adminInv.invitation_id), "NOT_FOUND");
  });
});

describe("組織: 組織コード", () => {
  it("誤ったコードは JOIN_CODE_INVALID。1 時間に 10 回失敗すると RATE_LIMITED", async () => {
    const s = await student();
    for (let i = 0; i < 10; i++) await expectCode(requestJoin(s, "AAAA-AAAA", CONSENT_VERSION), "JOIN_CODE_INVALID");
    await expectCode(requestJoin(s, "AAAA-AAAA", CONSENT_VERSION), "RATE_LIMITED");
  });

  it("申請しただけでは共有されず、承認後に共有される。他組織の管理者は承認できない", async () => {
    const owner = await admin();
    const org = await createOrganization(owner, "コード組織");
    const code = await regenerateJoinCode(owner);
    const s = await student();
    const app = await newApp(s);
    const { request_id, organization_name } = await requestJoin(s, code.toLowerCase().replace(/(.{4})/, "$1-"), CONSENT_VERSION);
    expect(organization_name).toBe("コード組織");
    await expectCode(requestJoin(s, code, CONSENT_VERSION), "JOIN_REQUEST_PENDING");
    await expectCode(getApplication(owner, app.id), "NOT_FOUND");
    expect((await getStudentMembership(s, s.actor.id)).pendingRequest?.id).toBe(request_id);
    const outsider = await admin();
    await createOrganization(outsider, "B");
    await expectCode(reviewJoinRequest(outsider, request_id, true), "NOT_FOUND");
    await reviewJoinRequest(owner, request_id, true);
    expect((await getApplication(owner, app.id)).id).toBe(app.id);
    expect((await getStudentMembership(s, s.actor.id)).membership?.organization_id).toBe(org.id);
    await expectCode(reviewJoinRequest(owner, request_id, true), "JOIN_REQUEST_NOT_PENDING");
  });

  it("取り下げられた申請は承認できない (同意の撤回)。コード再発行で旧コードは無効になる", async () => {
    const owner = await admin();
    await createOrganization(owner, "A");
    const oldCode = await regenerateJoinCode(owner);
    const s = await student();
    const { request_id } = await requestJoin(s, oldCode, CONSENT_VERSION);
    await cancelJoinRequest(s, request_id);
    await expectCode(reviewJoinRequest(owner, request_id, true), "JOIN_REQUEST_NOT_PENDING");
    const newCode = await regenerateJoinCode(owner);
    expect(newCode).not.toBe(oldCode);
    await expectCode(requestJoin(await student(), oldCode, CONSENT_VERSION), "JOIN_CODE_INVALID");
  });
});

describe("所属解除", () => {
  it("学生が脱退すると管理者のアクセスは即時失効し、応募データは残る", async () => {
    const { owner, s } = await orgWithStudent();
    const app = await newApp(s);
    const { membership } = await getStudentMembership(s, s.actor.id);
    await endMembership(s, membership!.id);
    await expectCode(getApplication(owner, app.id), "NOT_FOUND");
    expect((await getApplication(s, app.id)).id).toBe(app.id);
    await expectCode(endMembership(s, membership!.id), "MEMBERSHIP_NOT_ACTIVE");
  });

  it("管理者による所属解除も可能、無関係な管理者は解除できない", async () => {
    const { owner, s } = await orgWithStudent();
    const { membership } = await getStudentMembership(s, s.actor.id);
    const outsider = await admin();
    await expectCode(endMembership(outsider, membership!.id), "NOT_FOUND");
    await endMembership(owner, membership!.id);
    expect((await getStudentMembership(s, s.actor.id)).membership).toBeNull();
  });

  it("管理者は所属開始前の履歴を読めず、学生本人は読める", async () => {
    const owner = await admin();
    await createOrganization(owner, "A");
    const s = await student();
    const app = await newApp(s);
    await updateApplicationWithVersion(s, app.id, 1, { memo: "所属前のメモ" });
    await new Promise((r) => setTimeout(r, 5));
    await acceptInvitation(s, (await createInvitation(owner, { email: null, role: "STUDENT" })).token, CONSENT_VERSION);
    await new Promise((r) => setTimeout(r, 5));
    await updateApplicationWithVersion(owner, app.id, 2, { memo: "所属後のメモ" });
    const adminView = await getApplicationHistory(owner, app.id);
    expect(adminView.map((h) => (h.new_values as Record<string, unknown> | null)?.memo).filter(Boolean)).toEqual(["所属後のメモ"]);
    const studentView = await getApplicationHistory(s, app.id);
    expect(studentView.length).toBeGreaterThan(adminView.length);
  });
});

describe("退会", () => {
  it("退会処理で個人データと関連する監査ログが削除され、申請記録は匿名化されて残る", async () => {
    const { owner, s } = await orgWithStudent();
    const app = await newApp(s);
    await updateApplicationWithVersion(owner, app.id, 1, { memo: "x" });
    const requestId = await requestAccountDeletion(s);
    await expectCode(requestAccountDeletion(s), "DELETION_ALREADY_REQUESTED");
    await processAccountDeletion(db, requestId);
    expect(await getProfile(db, s.actor.id)).toBeNull();
    expect(await db.select().from(applications).where(eq(applications.student_id, s.actor.id))).toHaveLength(0);
    expect(await db.select().from(selectionSteps).where(eq(selectionSteps.application_id, app.id))).toHaveLength(0);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.application_id, app.id))).toHaveLength(0);
  });

  it("オーナー退会時は他の管理者へ所有権を移譲し、他人のデータへの操作ログは匿名化する", async () => {
    const { owner, org, s } = await orgWithStudent();
    const second = await createUser(db, { role: "ADMIN", email: `next-owner-${crypto.randomUUID()}@example.com` });
    await acceptInvitation(second, (await createInvitation(owner, { email: second.actor.email, role: "ADMIN" })).token, null);
    const app = await newApp(s);
    await updateApplicationWithVersion(owner, app.id, 1, { memo: "オーナーの編集" });
    await processAccountDeletion(db, await requestAccountDeletion(owner));
    const newOwner = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organization_id, org.id), eq(organizationMembers.role, "OWNER"))).get();
    expect(newOwner?.user_id).toBe(second.actor.id);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.application_id, app.id));
    const edit = logs.find((l) => (l.new_values as Record<string, unknown> | null)?.memo === "オーナーの編集");
    expect(edit?.actor_id).toBeNull();
  });

  it("応募が 100 件以上ある学生も退会処理できる (D1 のパラメーター上限)", async () => {
    const s = await student();
    const rows = Array.from({ length: 120 }, (_, i) => ({ id: crypto.randomUUID(), student_id: s.actor.id, company_name: `会社${i}`, selection_type: "FULL_TIME" as const }));
    for (let i = 0; i < rows.length; i += 10) await db.insert(applications).values(rows.slice(i, i + 10));
    await newApp(s); // 監査ログ付きの応募
    await processAccountDeletion(db, await requestAccountDeletion(s));
    expect(await db.select().from(applications).where(eq(applications.student_id, s.actor.id))).toHaveLength(0);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.student_id, s.actor.id))).toHaveLength(0);
  });

  it("取り消された退会申請は処理されない", async () => {
    const s = await student();
    const id = await requestAccountDeletion(s);
    await cancelAccountDeletion(s);
    await expectCode(processAccountDeletion(db, id), "NOT_FOUND");
    expect(await getProfile(db, s.actor.id)).not.toBeNull();
  });

  it("管理者が 1 人だけの組織は、オーナーの退会で削除される", async () => {
    const owner = await admin();
    const org = await createOrganization(owner, "A");
    await processAccountDeletion(db, await requestAccountDeletion(owner));
    expect(await db.select().from(organizations).where(eq(organizations.id, org.id))).toHaveLength(0);
  });
});
