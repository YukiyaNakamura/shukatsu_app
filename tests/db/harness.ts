import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { createDb, type DB } from "@/db";
import { user } from "@/db/schema";
import type { DataContext, UserRole } from "@/lib/server/context";

const migrationsDir = join(__dirname, "..", "..", "drizzle", "migrations");

/**
 * テスト用の D1 (wrangler の getPlatformProxy。本番と同じ workerd の D1 実装をメモリ上で動かす)。
 * drizzle/migrations のマイグレーションをすべて適用する。
 */
export async function createTestDb(): Promise<{ db: DB; d1: D1Database; dispose: () => Promise<void> }> {
  // wrangler.jsonc と同じ D1 バインディングを、ファイルに保存しないメモリ上のデータベースとして起動する
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false });
  const d1 = proxy.env.DB;
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(join(migrationsDir, file), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await d1.batch(statements.map((s) => d1.prepare(s)));
    } catch (error) {
      throw new Error(`Migration failed: ${file}: ${(error as Error).message}`);
    }
  }
  return { db: createDb(d1), d1, dispose: () => proxy.dispose() };
}

let seq = 0;

/** ユーザーを直接作成する (認証は Better Auth の責務のため、ここではプロフィールだけを作る) */
export async function createUser(
  db: DB,
  opts: { email?: string; role: UserRole; fullName?: string; university?: string | null; verified?: boolean },
): Promise<DataContext> {
  const id = crypto.randomUUID();
  const email = opts.email ?? `user${++seq}@example.com`;
  await db.insert(user).values({
    id,
    name: opts.fullName ?? email.split("@")[0],
    email,
    emailVerified: opts.verified ?? true,
    role: opts.role,
    universityName: opts.role === "STUDENT" ? (opts.university ?? "テスト大学") : (opts.university ?? null),
  });
  return { db, actor: { id, role: opts.role, email } };
}
