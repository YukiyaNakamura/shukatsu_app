import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const root = join(__dirname, "..", "..");

/** Supabase 互換の shim とすべてのマイグレーションを適用した PGlite を作成する */
export async function createTestDb() {
  const db = new PGlite();
  await db.exec(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
  const dir = join(root, "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration failed: ${file}: ${(error as Error).message}`);
    }
  }
  return db;
}

export type Db = PGlite;

/** auth.users にユーザーを作成する (handle_new_user トリガーで profiles が作られる) */
export async function createUser(
  db: Db,
  opts: { email: string; role: "STUDENT" | "ADMIN"; fullName?: string; university?: string; confirmed?: boolean },
): Promise<string> {
  const meta = {
    role: opts.role,
    full_name: opts.fullName ?? opts.email.split("@")[0],
    university_name: opts.role === "STUDENT" ? (opts.university ?? "テスト大学") : undefined,
  };
  const res = await db.query<{ id: string }>(
    "insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3) returning id",
    [opts.email, opts.confirmed === false ? null : new Date().toISOString(), JSON.stringify(meta)],
  );
  return res.rows[0].id;
}

/**
 * 指定ユーザーとして (role=authenticated, JWT sub=uid) クエリを実行する。
 * 成功時もロールバックしたい場合は rollback=true。
 */
export async function asUser<T>(
  db: Db,
  uid: string | null,
  fn: (tx: Transaction) => Promise<T>,
  role: "authenticated" | "anon" | "service_role" = uid ? "authenticated" : "anon",
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid, role } : { role })]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

/** 例外メッセージを返す (成功した場合は null) */
export async function errorOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
