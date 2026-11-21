import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, errorOf, type Db } from "./harness";

const CONSENT = "2026-11-v1";

let db: Db;
let student: string; // 組織 A に所属させる学生
let student2: string; // 無所属の学生
let student3: string; // 組織 B に参加申請する学生
let owner: string; // 組織 A オーナー
let admin2: string; // 組織 A の追加管理者
let otherOwner: string; // 組織 B オーナー
let orgA: string;
let orgB: string;

async function createApp(uid: string, studentId: string, company = "株式会社テスト", type = "FULL_TIME") {
  return asUser(db, uid, async (tx) => {
    const r = await tx.query<{ id: string; version: number; current_step_id: string }>(
      "select * from public.create_application($1, $2, $3::public.selection_type)",
      [studentId, company, type],
    );
    return r.rows[0];
  });
}

async function visibleAppIds(uid: string) {
  return asUser(db, uid, async (tx) => {
    const r = await tx.query<{ id: string }>("select id from public.applications");
    return r.rows.map((x) => x.id);
  });
}

beforeAll(async () => {
  db = await createTestDb();
  student = await createUser(db, { email: "s1@example.com", role: "STUDENT", fullName: "学生 一郎" });
  student2 = await createUser(db, { email: "s2@example.com", role: "STUDENT", fullName: "学生 二郎" });
  student3 = await createUser(db, { email: "s3@example.com", role: "STUDENT", fullName: "学生 三郎" });
  owner = await createUser(db, { email: "owner@example.com", role: "ADMIN", fullName: "管理 太郎" });
  admin2 = await createUser(db, { email: "admin2@example.com", role: "ADMIN" });
  otherOwner = await createUser(db, { email: "other@example.com", role: "ADMIN" });
  orgA = await asUser(db, owner, async (tx) => (await tx.query<{ id: string }>("select public.create_organization('エージェントA') as id")).rows[0].id);
  orgB = await asUser(db, otherOwner, async (tx) => (await tx.query<{ id: string }>("select public.create_organization('エージェントB') as id")).rows[0].id);
}, 60_000);

describe("プロフィールと権限昇格対策", () => {
  it("サインアップ時のメタデータからプロフィールが作られる", async () => {
    const r = await db.query<{ role: string; full_name: string; university_name: string }>(
      "select role, full_name, university_name from public.profiles where id = $1",
      [student],
    );
    expect(r.rows[0]).toEqual({ role: "STUDENT", full_name: "学生 一郎", university_name: "テスト大学" });
  });

  it("学生は自分のロールを ADMIN に変更できない", async () => {
    const err = await errorOf(asUser(db, student, (tx) => tx.query("update public.profiles set role = 'ADMIN' where id = $1", [student])));
    expect(err).toMatch(/permission denied/);
  });

  it("学生は氏名・大学名を更新できる", async () => {
    await asUser(db, student, (tx) => tx.query("update public.profiles set university_name = '更新大学' where id = $1", [student]));
    const r = await db.query<{ university_name: string }>("select university_name from public.profiles where id = $1", [student]);
    expect(r.rows[0].university_name).toBe("更新大学");
  });

  it("他人のプロフィールを更新できない", async () => {
    const r = await asUser(db, student, (tx) => tx.query("update public.profiles set full_name = 'x' where id = $1", [student2]));
    expect(r.affectedRows).toBe(0);
  });

  it("学生は組織を作成できない", async () => {
    expect(await errorOf(asUser(db, student, (tx) => tx.query("select public.create_organization('x')")))).toBe("NOT_ADMIN_ACCOUNT");
  });

  it("管理者は 2 つ目の組織を作れない", async () => {
    expect(await errorOf(asUser(db, owner, (tx) => tx.query("select public.create_organization('x')")))).toBe("ALREADY_IN_ORGANIZATION");
  });

  it("organization_members への直接 INSERT (管理者の自己付与) はできない", async () => {
    const err = await errorOf(
      asUser(db, admin2, (tx) =>
        tx.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'OWNER')", [orgA, admin2]),
      ),
    );
    expect(err).toMatch(/permission denied/);
  });

  it("student_memberships への直接 INSERT (同意なしの所属) はできない", async () => {
    const err = await errorOf(
      asUser(db, owner, (tx) =>
        tx.query(
          "insert into public.student_memberships (student_id, organization_id, consent_version, consented_at) values ($1, $2, 'x', now())",
          [student2, orgA],
        ),
      ),
    );
    expect(err).toMatch(/permission denied/);
  });

  it("anon は何も読めない", async () => {
    const err = await errorOf(asUser(db, null, (tx) => tx.query("select * from public.applications")));
    expect(err).toMatch(/permission denied/);
  });

  it("組織コードのハッシュは管理者にも読めない", async () => {
    const err = await errorOf(asUser(db, owner, (tx) => tx.query("select join_code_hash from public.organizations")));
    expect(err).toMatch(/permission denied/);
  });
});

describe("応募と選考ステップ", () => {
  it("本選考はテンプレート 5 ステップ、インターンは 3 ステップで作成され、現在段階は先頭", async () => {
    const full = await createApp(student2, student2, "サンプル商事", "FULL_TIME");
    const intern = await createApp(student2, student2, "サンプル商事", "INTERNSHIP");
    const steps = await db.query<{ application_id: string; display_name: string; position: number; id: string }>(
      "select application_id, display_name, position, id from public.selection_steps where application_id in ($1, $2) order by application_id, position",
      [full.id, intern.id],
    );
    const fullSteps = steps.rows.filter((s) => s.application_id === full.id);
    const internSteps = steps.rows.filter((s) => s.application_id === intern.id);
    expect(fullSteps.map((s) => s.display_name)).toEqual(["ES", "適性検査", "一次面接", "二次面接", "最終面接"]);
    expect(internSteps.map((s) => s.display_name)).toEqual(["ES", "適性検査", "面接"]);
    expect(full.current_step_id).toBe(fullSteps[0].id);
  });

  it("同じ企業に何度でも応募でき、企業名は正規化される", async () => {
    await createApp(student2, student2, "ＡＢＣ株式会社");
    await createApp(student2, student2, "abc 株式会社");
    const r = await db.query<{ n: number }>(
      "select count(*)::int as n from public.applications where student_id = $1 and company_name_normalized = 'abc'",
      [student2],
    );
    expect(r.rows[0].n).toBe(2);
  });

  it("他人の student_id で応募を作成できない", async () => {
    const err = await errorOf(createApp(student2, student));
    expect(err).toMatch(/row-level security/);
  });

  it("学生は他人の応募を取得できない", async () => {
    const app = await createApp(student, student, "非公開株式会社");
    expect(await visibleAppIds(student2)).not.toContain(app.id);
    const steps = await asUser(db, student2, (tx) => tx.query("select * from public.selection_steps where application_id = $1", [app.id]));
    expect(steps.rows).toHaveLength(0);
  });

  it("current_step_id に別応募のステップは設定できない (複合 FK)", async () => {
    const a = await createApp(student2, student2, "A社");
    const b = await createApp(student2, student2, "B社");
    const err = await errorOf(
      asUser(db, student2, (tx) => tx.query("update public.applications set current_step_id = $1 where id = $2", [b.current_step_id, a.id])),
    );
    expect(err).toMatch(/foreign key/);
  });

  it("インターンの早期選考フラグは false に正規化される", async () => {
    const a = await createApp(student2, student2, "C社", "INTERNSHIP");
    await asUser(db, student2, (tx) => tx.query("update public.applications set is_early_selection = true where id = $1", [a.id]));
    const r = await db.query<{ is_early_selection: boolean }>("select is_early_selection from public.applications where id = $1", [a.id]);
    expect(r.rows[0].is_early_selection).toBe(false);
  });

  it("楽観的ロック: version 不一致の更新は 0 行、成功時は version が増える", async () => {
    const a = await createApp(student2, student2, "D社");
    const ok = await asUser(db, student2, (tx) =>
      tx.query<{ version: number }>("update public.applications set memo = 'first' where id = $1 and version = $2 returning version", [a.id, a.version]),
    );
    expect(ok.rows[0].version).toBe(a.version + 1);
    const stale = await asUser(db, student2, (tx) =>
      tx.query("update public.applications set memo = 'stale' where id = $1 and version = $2", [a.id, a.version]),
    );
    expect(stale.affectedRows).toBe(0);
    const r = await db.query<{ memo: string }>("select memo from public.applications where id = $1", [a.id]);
    expect(r.rows[0].memo).toBe("first");
  });

  it("set_current_stage: 既存の同種ステップを選び、無ければ追加。version 不一致は VERSION_CONFLICT", async () => {
    const a = await createApp(student2, student2, "E社");
    const updated = await asUser(db, student2, async (tx) =>
      (await tx.query<{ version: number; current_step_id: string }>("select * from public.set_current_stage($1, 'FINAL_INTERVIEW', $2)", [a.id, a.version])).rows[0],
    );
    const step = await db.query<{ step_type: string }>("select step_type from public.selection_steps where id = $1", [updated.current_step_id]);
    expect(step.rows[0].step_type).toBe("FINAL_INTERVIEW");

    const gd = await asUser(db, student2, async (tx) =>
      (await tx.query<{ version: number; current_step_id: string }>("select * from public.set_current_stage($1, 'GROUP_DISCUSSION', $2)", [a.id, updated.version])).rows[0],
    );
    const count = await db.query<{ n: number }>("select count(*)::int as n from public.selection_steps where application_id = $1", [a.id]);
    expect(count.rows[0].n).toBe(6);
    expect(gd.version).toBe(updated.version + 1);

    const err = await errorOf(asUser(db, student2, (tx) => tx.query("select public.set_current_stage($1, 'OTHER', $2)", [a.id, a.version])));
    expect(err).toBe("VERSION_CONFLICT");
  });

  it("同じ種類のステップを複数回登録できる (再実施)", async () => {
    const a = await createApp(student2, student2, "F社");
    await asUser(db, student2, (tx) =>
      tx.query("insert into public.selection_steps (application_id, step_type, display_name, position) values ($1, 'FIRST_INTERVIEW', '一次面接 (再)', 10)", [a.id]),
    );
    const r = await db.query<{ n: number }>(
      "select count(*)::int as n from public.selection_steps where application_id = $1 and step_type = 'FIRST_INTERVIEW'",
      [a.id],
    );
    expect(r.rows[0].n).toBe(2);
  });

  it("reorder_steps は全ステップの並びを受け付け、不完全な配列は拒否する", async () => {
    const a = await createApp(student2, student2, "G社", "INTERNSHIP");
    const ids = (await db.query<{ id: string }>("select id from public.selection_steps where application_id = $1 order by position", [a.id])).rows.map((r) => r.id);
    await asUser(db, student2, (tx) => tx.query("select public.reorder_steps($1, $2::uuid[])", [a.id, [...ids].reverse()]));
    const after = (await db.query<{ id: string }>("select id from public.selection_steps where application_id = $1 order by position", [a.id])).rows.map((r) => r.id);
    expect(after).toEqual([...ids].reverse());
    const err = await errorOf(asUser(db, student2, (tx) => tx.query("select public.reorder_steps($1, $2::uuid[])", [a.id, ids.slice(1)])));
    expect(err).toBe("INVALID_STEP_ORDER");
  });

  it("応募の物理削除はできない (論理削除のみ)", async () => {
    const a = await createApp(student2, student2, "H社");
    const err = await errorOf(asUser(db, student2, (tx) => tx.query("delete from public.applications where id = $1", [a.id])));
    expect(err).toMatch(/permission denied/);
    await asUser(db, student2, (tx) => tx.query("update public.applications set deleted_at = now() where id = $1", [a.id]));
    await asUser(db, student2, (tx) => tx.query("update public.applications set deleted_at = null where id = $1", [a.id]));
  });

  it("予定に他人の応募を紐づけられない", async () => {
    const other = await createApp(student, student, "I社");
    const err = await errorOf(
      asUser(db, student2, (tx) =>
        tx.query("insert into public.events (student_id, application_id, title, starts_at) values ($1, $2, '説明会', now())", [student2, other.id]),
      ),
    );
    expect(err).toMatch(/foreign key/);
  });

  it("変更履歴に更新者・更新前後の値が残り、本人のみ閲覧できる", async () => {
    const a = await createApp(student2, student2, "J社");
    await asUser(db, student2, (tx) => tx.query("update public.applications set status = 'IN_PROGRESS' where id = $1", [a.id]));
    const logs = await asUser(db, student2, (tx) =>
      tx.query<{ actor_id: string; old_values: Record<string, unknown>; new_values: Record<string, unknown> }>(
        "select actor_id, old_values, new_values from public.audit_logs where application_id = $1 and target_type = 'applications' and action = 'UPDATE' and new_values ? 'status'",
        [a.id],
      ),
    );
    expect(logs.rows).toHaveLength(1);
    expect(logs.rows[0]).toMatchObject({ actor_id: student2, old_values: { status: "PLANNED" }, new_values: { status: "IN_PROGRESS" } });
    const other = await asUser(db, student, (tx) => tx.query("select * from public.audit_logs where application_id = $1", [a.id]));
    expect(other.rows).toHaveLength(0);
  });
});

describe("組織: 招待リンク", () => {
  let studentApp: string;
  let token: string;

  beforeAll(async () => {
    studentApp = (await createApp(student, student, "所属前からの応募")).id;
  });

  it("所属前は管理者から学生の応募が見えない", async () => {
    expect(await visibleAppIds(owner)).not.toContain(studentApp);
  });

  it("招待作成: トークン平文は返り値のみ、DB にはハッシュのみ", async () => {
    const r = await asUser(db, owner, (tx) => tx.query<{ token: string; expires_at: string }>("select * from public.create_invitation($1)", ["s1@example.com"]));
    token = r.rows[0].token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const days = (new Date(r.rows[0].expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    const raw = await db.query<{ token_hash: string }>("select token_hash from public.invitations");
    expect(raw.rows.map((x) => x.token_hash)).not.toContain(token);
    const err = await errorOf(asUser(db, owner, (tx) => tx.query("select token_hash from public.invitations")));
    expect(err).toMatch(/permission denied/);
  });

  it("ログイン前でも招待情報 (組織名と状態) を確認できる", async () => {
    const r = await asUser(db, null, (tx) => tx.query<{ organization_name: string; state: string }>("select * from public.get_invitation($1)", [token]));
    expect(r.rows[0]).toMatchObject({ organization_name: "エージェントA", state: "VALID" });
  });

  it("招待先メールアドレスと一致しないユーザーは受諾できない", async () => {
    expect(await errorOf(asUser(db, student2, (tx) => tx.query("select public.accept_invitation($1, $2)", [token, CONSENT])))).toBe("INVITATION_EMAIL_MISMATCH");
  });

  it("同意なしでは受諾できない", async () => {
    expect(await errorOf(asUser(db, student, (tx) => tx.query("select public.accept_invitation($1, null)", [token])))).toBe("CONSENT_REQUIRED");
  });

  it("受諾すると過去の応募も含め管理者に共有され、管理者は編集できる", async () => {
    await asUser(db, student, (tx) => tx.query("select public.accept_invitation($1, $2)", [token, CONSENT]));
    expect(await visibleAppIds(owner)).toContain(studentApp);
    expect(await visibleAppIds(owner)).not.toContain((await createApp(student2, student2, "無所属学生の応募")).id);
    // 代理編集
    await asUser(db, owner, (tx) => tx.query("update public.applications set memo = '管理者メモ' where id = $1", [studentApp]));
    // 代理登録
    const proxy = await createApp(owner, student, "管理者が代理登録");
    expect(await visibleAppIds(student)).toContain(proxy.id);
    // 監査ログの actor は管理者
    const log = await asUser(db, student, (tx) =>
      tx.query<{ actor_id: string }>("select actor_id from public.audit_logs where application_id = $1 and action = 'UPDATE' and new_values ? 'memo'", [studentApp]),
    );
    expect(log.rows[0].actor_id).toBe(owner);
  });

  it("使用済み招待は再利用できない", async () => {
    expect(await errorOf(asUser(db, student, (tx) => tx.query("select public.accept_invitation($1, $2)", [token, CONSENT])))).toBe("INVITATION_USED");
  });

  it("期限切れ招待は受諾できない", async () => {
    const t = await asUser(db, owner, async (tx) => (await tx.query<{ token: string }>("select token from public.create_invitation(null)")).rows[0].token);
    await db.query("update public.invitations set expires_at = now() - interval '1 second' where used_at is null and email is null");
    expect(await errorOf(asUser(db, student2, (tx) => tx.query("select public.accept_invitation($1, $2)", [t, CONSENT])))).toBe("INVITATION_EXPIRED");
    const info = await asUser(db, null, (tx) => tx.query<{ state: string }>("select state from public.get_invitation($1)", [t]));
    expect(info.rows[0].state).toBe("EXPIRED");
  });

  it("2 つの組織に同時所属できない", async () => {
    const t = await asUser(db, otherOwner, async (tx) => (await tx.query<{ token: string }>("select token from public.create_invitation(null)")).rows[0].token);
    expect(await errorOf(asUser(db, student, (tx) => tx.query("select public.accept_invitation($1, $2)", [t, CONSENT])))).toBe("ALREADY_IN_ORGANIZATION");
    // DB 制約でも保証 (RPC を経由しない直接 INSERT)
    const err = await errorOf(
      db.query("insert into public.student_memberships (student_id, organization_id, consent_version, consented_at) values ($1, $2, 'x', now())", [student, orgB]),
    );
    expect(err).toMatch(/duplicate key/);
  });

  it("他組織の管理者は学生の応募を取得・更新できない", async () => {
    expect(await visibleAppIds(otherOwner)).not.toContain(studentApp);
    const r = await asUser(db, otherOwner, (tx) => tx.query("update public.applications set memo = 'hack' where id = $1", [studentApp]));
    expect(r.affectedRows).toBe(0);
  });

  it("管理者の招待はオーナーのみ、メール一致で追加管理者になり同じ権限を持つ", async () => {
    const t = await asUser(db, owner, async (tx) => (await tx.query<{ token: string }>("select token from public.create_invitation($1, 'ADMIN')", ["admin2@example.com"])).rows[0].token);
    await asUser(db, admin2, (tx) => tx.query("select public.accept_invitation($1)", [t]));
    expect(await visibleAppIds(admin2)).toContain(studentApp);
    expect(await errorOf(asUser(db, admin2, (tx) => tx.query("select public.create_invitation('x@example.com', 'ADMIN')")))).toBe("FORBIDDEN");
  });

  it("ADMIN はオーナーを削除できない", async () => {
    const r = await asUser(db, admin2, (tx) => tx.query("delete from public.organization_members where user_id = $1", [owner]));
    expect(r.affectedRows).toBe(0);
  });
});

describe("組織: 組織コード", () => {
  let code: string;
  let requestId: string;
  let s3App: string;

  beforeAll(async () => {
    s3App = (await createApp(student3, student3, "S3の応募")).id;
    code = await asUser(db, otherOwner, async (tx) => (await tx.query<{ code: string }>("select public.regenerate_join_code() as code")).rows[0].code);
  });

  it("誤ったコードは JOIN_CODE_INVALID", async () => {
    // 失敗回数を記録するため例外ではなく 0 行 (API で 404 JOIN_CODE_INVALID に変換)
    const r = await asUser(db, student3, (tx) => tx.query("select * from public.request_join('ZZZZ-ZZZZ', $1)", [CONSENT]));
    expect(r.rows).toHaveLength(0);
  });

  it("コードで申請しただけでは管理者に選考データは共有されない", async () => {
    const formatted = `${code.slice(0, 4)}-${code.slice(4).toLowerCase()}`;
    const r = await asUser(db, student3, (tx) => tx.query<{ request_id: string; organization_name: string }>("select * from public.request_join($1, $2)", [formatted, CONSENT]));
    requestId = r.rows[0].request_id;
    expect(r.rows[0].organization_name).toBe("エージェントB");
    expect(await visibleAppIds(otherOwner)).not.toContain(s3App);
    // 審査のため氏名・大学名は見える
    const p = await asUser(db, otherOwner, (tx) => tx.query<{ full_name: string }>("select full_name from public.profiles where id = $1", [student3]));
    expect(p.rows[0].full_name).toBe("学生 三郎");
  });

  it("他組織の管理者は申請を承認できない", async () => {
    expect(await errorOf(asUser(db, owner, (tx) => tx.query("select public.review_join_request($1, true)", [requestId])))).toBe("NOT_FOUND");
  });

  it("承認後に所属が有効化され、共有される", async () => {
    await asUser(db, otherOwner, (tx) => tx.query("select public.review_join_request($1, true)", [requestId]));
    expect(await visibleAppIds(otherOwner)).toContain(s3App);
    expect(await errorOf(asUser(db, otherOwner, (tx) => tx.query("select public.review_join_request($1, true)", [requestId])))).toBe("JOIN_REQUEST_NOT_PENDING");
  });

  it("取り下げられた申請は承認できない (同意の撤回)", async () => {
    const s4 = await createUser(db, { email: "s4@example.com", role: "STUDENT" });
    const id = await asUser(db, s4, async (tx) => (await tx.query<{ request_id: string }>("select * from public.request_join($1, $2)", [code, CONSENT])).rows[0].request_id);
    await asUser(db, s4, (tx) => tx.query("select public.cancel_join_request($1)", [id]));
    expect(await errorOf(asUser(db, otherOwner, (tx) => tx.query("select public.review_join_request($1, true)", [id])))).toBe("JOIN_REQUEST_NOT_PENDING");
  });

  it("コード再発行で旧コードは無効になる", async () => {
    await asUser(db, otherOwner, (tx) => tx.query("select public.regenerate_join_code()"));
    const r = await asUser(db, student2, (tx) => tx.query("select * from public.request_join($1, $2)", [code, CONSENT]));
    expect(r.rows).toHaveLength(0);
    expect((await db.query("select 1 from public.join_requests where student_id = $1", [student2])).rows).toHaveLength(0);
  });

  it("管理者の学生一覧集計は自組織の学生のみ", async () => {
    const r = await asUser(db, otherOwner, (tx) => tx.query<{ student_id: string; application_count: number }>("select * from public.org_student_overview()"));
    expect(r.rows.map((x) => x.student_id)).toEqual([student3]);
    expect(Number(r.rows[0].application_count)).toBe(1);
  });
});

describe("所属解除", () => {
  it("学生が脱退すると管理者のアクセスは即時失効し、応募データは残る", async () => {
    const m = await db.query<{ id: string }>("select id from public.student_memberships where student_id = $1 and status = 'ACTIVE'", [student3]);
    const before = await visibleAppIds(student3);
    await asUser(db, student3, (tx) => tx.query("select public.end_membership($1)", [m.rows[0].id]));
    expect(await visibleAppIds(otherOwner)).toHaveLength(0);
    const r = await asUser(db, otherOwner, (tx) => tx.query("update public.applications set memo = 'x' where student_id = $1", [student3]));
    expect(r.affectedRows).toBe(0);
    expect(await visibleAppIds(student3)).toEqual(before);
  });

  it("管理者による所属解除も可能、無関係な管理者は解除できない", async () => {
    const m = await db.query<{ id: string }>("select id from public.student_memberships where student_id = $1 and status = 'ACTIVE'", [student]);
    expect(await errorOf(asUser(db, otherOwner, (tx) => tx.query("select public.end_membership($1)", [m.rows[0].id])))).toBe("NOT_FOUND");
    await asUser(db, admin2, (tx) => tx.query("select public.end_membership($1)", [m.rows[0].id]));
    expect(await visibleAppIds(owner)).toHaveLength(0);
  });
});

describe("退会", () => {
  it("一般ユーザーは退会処理を実行できず、service_role の処理で個人データが削除される", async () => {
    const s = await createUser(db, { email: "leave@example.com", role: "STUDENT" });
    const app = await createApp(s, s, "退会者の応募");
    const reqId = await asUser(db, s, async (tx) => (await tx.query<{ id: string }>("select public.request_account_deletion() as id")).rows[0].id);
    expect(await errorOf(asUser(db, s, (tx) => tx.query("select public.request_account_deletion()")))).toBe("DELETION_ALREADY_REQUESTED");
    expect(await errorOf(asUser(db, s, (tx) => tx.query("select public.process_account_deletion($1)", [reqId])))).toMatch(/permission denied/);

    await asUser(db, null, (tx) => tx.query("select public.process_account_deletion($1)", [reqId]), "service_role");
    expect((await db.query("select 1 from public.applications where id = $1", [app.id])).rows).toHaveLength(0);
    expect((await db.query("select 1 from public.audit_logs where student_id = $1", [s])).rows).toHaveLength(0);
    expect((await db.query("select 1 from auth.users where id = $1", [s])).rows).toHaveLength(0);
    const req = await db.query<{ status: string; user_id: string | null }>("select status, user_id from public.account_deletion_requests where id = $1", [reqId]);
    expect(req.rows[0]).toEqual({ status: "COMPLETED", user_id: null });
  });

  it("オーナー退会時は他の管理者へ所有権を移譲する", async () => {
    const reqId = await asUser(db, owner, async (tx) => (await tx.query<{ id: string }>("select public.request_account_deletion() as id")).rows[0].id);
    await asUser(db, null, (tx) => tx.query("select public.process_account_deletion($1)", [reqId]), "service_role");
    const r = await db.query<{ user_id: string; role: string }>("select user_id, role from public.organization_members where organization_id = $1", [orgA]);
    expect(r.rows).toEqual([{ user_id: admin2, role: "OWNER" }]);
  });
});

describe("ビュー (security_invoker)", () => {
  it("application_overview / calendar_items は RLS が適用される", async () => {
    const s = await createUser(db, { email: "view@example.com", role: "STUDENT" });
    const app = await createApp(s, s, "ビュー確認社");
    await asUser(db, s, (tx) => tx.query("update public.selection_steps set scheduled_at = now(), deadline_at = now() where id = $1", [app.current_step_id]));
    await asUser(db, s, (tx) => tx.query("insert into public.events (student_id, title, starts_at) values ($1, '説明会', now())", [s]));
    const own = await asUser(db, s, (tx) => tx.query<{ current_step_type: string; student_name: string }>("select * from public.application_overview"));
    expect(own.rows).toHaveLength(1);
    expect(own.rows[0].current_step_type).toBe("DOCUMENT");
    const cal = await asUser(db, s, (tx) => tx.query<{ kind: string }>("select kind from public.calendar_items order by kind"));
    expect(cal.rows.map((r) => r.kind)).toEqual(["EVENT", "STEP_DEADLINE", "STEP_SCHEDULE"]);
    expect((await asUser(db, student2, (tx) => tx.query("select * from public.calendar_items where student_id = $1", [s]))).rows).toHaveLength(0);
    expect((await asUser(db, admin2, (tx) => tx.query("select * from public.application_overview where student_id = $1", [s]))).rows).toHaveLength(0);
  });
});
