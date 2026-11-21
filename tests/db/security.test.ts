import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, errorOf, type Db } from "./harness";

/** セキュリティレビューの指摘に対する回帰テスト */
let db: Db;
let owner: string;
let admin: string;

const tokenOf = async (uid: string, sql: string) =>
  asUser(db, uid, async (tx) => (await tx.query<{ token: string }>(sql)).rows[0].token);

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, { email: "owner@x.jp", role: "ADMIN" });
  admin = await createUser(db, { email: "admin@x.jp", role: "ADMIN" });
  await asUser(db, owner, (tx) => tx.query("select public.create_organization('O')"));
  const t = await tokenOf(owner, "select token from public.create_invitation('admin@x.jp','ADMIN')");
  await asUser(db, admin, (tx) => tx.query("select public.accept_invitation($1)", [t]));
});

describe("招待の取り消し", () => {
  it("invitations を直接 UPDATE できない (取り消しの解除を防止)", async () => {
    await asUser(db, owner, (tx) => tx.query("select public.create_invitation('x@x.jp','ADMIN')"));
    const id = (await db.query<{ id: string }>("select id from public.invitations where email = 'x@x.jp'")).rows[0].id;
    await asUser(db, owner, (tx) => tx.query("select public.revoke_invitation($1)", [id]));
    const err = await errorOf(asUser(db, admin, (tx) => tx.query("update public.invitations set revoked_at = null where id = $1", [id])));
    expect(err).toMatch(/permission denied/);
    expect(await errorOf(asUser(db, owner, (tx) => tx.query("select public.revoke_invitation($1)", [id])))).toBe("INVITATION_NOT_REVOCABLE");
  });

  it("管理者招待の取り消しはオーナーのみ、学生招待は管理者も可", async () => {
    await asUser(db, owner, (tx) => tx.query("select public.create_invitation('y@x.jp','ADMIN')"));
    const id = (await db.query<{ id: string }>("select id from public.invitations where email = 'y@x.jp'")).rows[0].id;
    expect(await errorOf(asUser(db, admin, (tx) => tx.query("select public.revoke_invitation($1)", [id])))).toBe("FORBIDDEN");
    await asUser(db, admin, (tx) => tx.query("select public.create_invitation('s@x.jp')"));
    const sid = (await db.query<{ id: string }>("select id from public.invitations where email = 's@x.jp'")).rows[0].id;
    expect(await errorOf(asUser(db, admin, (tx) => tx.query("select public.revoke_invitation($1)", [sid])))).toBeNull();
  });

  it("他組織の招待は取り消せない", async () => {
    const other = await createUser(db, { email: "other@x.jp", role: "ADMIN" });
    await asUser(db, other, (tx) => tx.query("select public.create_organization('P')"));
    const id = (await db.query<{ id: string }>("select id from public.invitations where email = 'y@x.jp'")).rows[0].id;
    expect(await errorOf(asUser(db, other, (tx) => tx.query("select public.revoke_invitation($1)", [id])))).toBe("NOT_FOUND");
  });
});

describe("監査ログの共有範囲と退会時の削除", () => {
  it("管理者は所属開始前の履歴・所属履歴を読めず、学生本人は読める。退会で全ログが消える", async () => {
    const s = await createUser(db, { email: "stu@x.jp", role: "STUDENT" });
    const app = await asUser(db, s, async (tx) => (await tx.query<{ id: string }>("select id from public.create_application($1,'A社','FULL_TIME')", [s])).rows[0].id);
    await asUser(db, s, (tx) => tx.query("update public.applications set memo = '参加前のメモ' where id = $1", [app]));
    await db.query("update public.audit_logs set created_at = now() - interval '1 minute' where student_id = $1", [s]);
    const t = await tokenOf(owner, "select token from public.create_invitation(null)");
    await asUser(db, s, (tx) => tx.query("select public.accept_invitation($1,'v1')", [t]));
    await asUser(db, owner, (tx) => tx.query("update public.applications set memo = '参加後のメモ' where id = $1", [app]));

    const adminView = await asUser(db, owner, (tx) =>
      tx.query<{ target_type: string; new_values: string }>("select target_type, new_values::text from public.audit_logs where student_id = $1", [s]),
    );
    expect(adminView.rows.some((r) => r.new_values.includes("参加前のメモ"))).toBe(false);
    expect(adminView.rows.some((r) => r.new_values.includes("参加後のメモ"))).toBe(true);
    expect(adminView.rows.some((r) => r.target_type === "student_memberships")).toBe(false);
    const selfView = await asUser(db, s, (tx) => tx.query("select 1 from public.audit_logs where new_values::text like '%参加前のメモ%'"));
    expect(selfView.rows).toHaveLength(1);

    const req = await asUser(db, s, async (tx) => (await tx.query<{ id: string }>("select public.request_account_deletion() as id")).rows[0].id);
    await asUser(db, null, (tx) => tx.query("select public.process_account_deletion($1)", [req]), "service_role");
    const left = await db.query("select 1 from public.audit_logs where application_id = $1 or student_id = $2", [app, s]);
    expect(left.rows).toHaveLength(0);
  });
});

describe("組織コードの総当たり対策", () => {
  it("失敗は 0 行で返り記録され、1時間に10回失敗すると RATE_LIMITED", async () => {
    const s = await createUser(db, { email: "brute@x.jp", role: "STUDENT" });
    for (let i = 0; i < 10; i++) {
      const r = await asUser(db, s, (tx) => tx.query("select * from public.request_join('AAAA-AAAA', 'v1')"));
      expect(r.rows).toHaveLength(0);
    }
    expect(await errorOf(asUser(db, s, (tx) => tx.query("select * from public.request_join('AAAA-AAAA', 'v1')")))).toBe("RATE_LIMITED");
    // 正しいコードでもロック中は拒否
    const code = await asUser(db, owner, async (tx) => (await tx.query<{ c: string }>("select public.regenerate_join_code() as c")).rows[0].c);
    expect(await errorOf(asUser(db, s, (tx) => tx.query("select * from public.request_join($1, 'v1')", [code])))).toBe("RATE_LIMITED");
    // 失敗記録テーブルはクライアントから参照不可
    expect(await errorOf(asUser(db, s, (tx) => tx.query("select * from private.join_code_failures")))).toMatch(/permission denied/);
  });
});

describe("既定の権限", () => {
  it("今後作られる public の関数・テーブルは anon / authenticated に公開されない", async () => {
    await db.exec("create function public.future_fn() returns int language sql as 'select 1'; create table public.future_tbl (id int);");
    expect(await errorOf(asUser(db, null, (tx) => tx.query("select public.future_fn()")))).toMatch(/permission denied/);
    expect(await errorOf(asUser(db, admin, (tx) => tx.query("select public.future_fn()")))).toMatch(/permission denied/);
    expect(await errorOf(asUser(db, admin, (tx) => tx.query("select * from public.future_tbl")))).toMatch(/permission denied/);
  });
});
