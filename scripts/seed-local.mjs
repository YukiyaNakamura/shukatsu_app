#!/usr/bin/env node
/**
 * ローカル D1 (wrangler の .wrangler/state) にテスト用のアカウントを作成する。本番には使わない。
 *
 *   npm run db:seed:local    … マイグレーションを適用し、テストアカウントを作成 (作成済みならパスワードを 0000 に戻す)
 *   npm run db:reset:local   … ローカル D1 を削除して作り直す (サーバーを止めてから実行)
 *
 * テストアカウント (パスワードはすべて 0000。ローカル専用のため新規登録時の 8 文字ルールの対象外):
 *   example@gmail.com   学生 (組織に所属していない)
 *   member@example.com  学生 (テスト組織に所属)
 *   admin@example.com   管理者 (テスト組織のオーナー)
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webcrypto as crypto } from "node:crypto";

const root = new URL("..", import.meta.url).pathname;
const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { cwd: root, stdio: "inherit" });

if (process.argv.includes("--reset")) {
  rmSync(join(root, ".wrangler", "state", "v3", "d1"), { recursive: true, force: true });
  console.log("ローカル D1 を削除しました。");
}
wrangler("d1", "migrations", "apply", "DB", "--local");

/** src/lib/server/crypto.ts の hashPassword と同じ形式 (PBKDF2-HMAC-SHA256, 100,000 回) */
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 }, key, 256));
  const b64 = (b) => Buffer.from(b).toString("base64");
  return `pbkdf2-sha256$100000$${b64(salt)}$${b64(bits)}`;
}

const q = (v) => (v === null ? "null" : `'${String(v).replaceAll("'", "''")}'`);
const now = Date.now();
const iso = new Date(now).toISOString();
const ids = {
  student: "00000000-0000-4000-8000-000000000001",
  member: "00000000-0000-4000-8000-000000000002",
  admin: "00000000-0000-4000-8000-000000000003",
  org: "00000000-0000-4000-8000-0000000000a1",
};
const users = [
  { id: ids.student, email: "example@gmail.com", name: "テスト 学生", role: "STUDENT", university: "テスト大学" },
  { id: ids.member, email: "member@example.com", name: "所属 学生", role: "STUDENT", university: "サンプル大学" },
  { id: ids.admin, email: "admin@example.com", name: "テスト 管理者", role: "ADMIN", university: null },
];

const sql = [];
for (const u of users) {
  sql.push(
    `insert or ignore into "user" (id, name, email, email_verified, role, university_name, created_at, updated_at) values (${q(u.id)}, ${q(u.name)}, ${q(u.email)}, 1, ${q(u.role)}, ${q(u.university)}, ${now}, ${now});`,
    `insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (${q(`acc-${u.id}`)}, ${q(u.id)}, 'credential', ${q(u.id)}, ${q(await hashPassword("0000"))}, ${now}, ${now}) on conflict(id) do update set password = excluded.password, updated_at = excluded.updated_at;`,
  );
}
sql.push(
  `insert or ignore into organizations (id, name, created_by, created_at) values (${q(ids.org)}, 'テスト組織', ${q(ids.admin)}, ${q(iso)});`,
  `insert or ignore into organization_members (id, organization_id, user_id, role, joined_at) values ('00000000-0000-4000-8000-0000000000b1', ${q(ids.org)}, ${q(ids.admin)}, 'OWNER', ${q(iso)});`,
  `insert or ignore into student_memberships (id, student_id, organization_id, status, consent_version, consented_at, joined_at) values ('00000000-0000-4000-8000-0000000000c1', ${q(ids.member)}, ${q(ids.org)}, 'ACTIVE', '2026-11-v1', ${q(iso)}, ${q(iso)});`,
);

const dir = mkdtempSync(join(tmpdir(), "shukatsu-seed-"));
const file = join(dir, "seed.sql");
writeFileSync(file, sql.join("\n"));
try {
  wrangler("d1", "execute", "DB", "--local", `--file=${file}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("\nテストアカウント (パスワードはすべて 0000):");
for (const u of users) console.log(`  ${u.email.padEnd(20)} ${u.role === "ADMIN" ? "管理者 (テスト組織のオーナー)" : u.id === ids.member ? "学生 (テスト組織に所属)" : "学生"}`);
