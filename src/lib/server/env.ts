import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb, type DB } from "@/db";

/** Worker のバインディングと環境変数 (wrangler.jsonc / .dev.vars / wrangler secret) */
export type AppEnv = CloudflareEnv & {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  MAIL_FROM: string;
  OPERATOR_TOKEN?: string;
  /** 未設定ならメールを送信せずログに出す (開発用) */
  RESEND_API_KEY?: string;
};

export async function getEnv(): Promise<AppEnv> {
  return (await getCloudflareContext({ async: true })).env as AppEnv;
}

/** レスポンス後も処理を続ける (メール送信など)。Workers のリクエスト外では完了を待つ */
export async function runInBackground(promise: Promise<unknown>) {
  const guarded = promise.catch((error) => console.error("Background task failed", error));
  try {
    (await getCloudflareContext({ async: true })).ctx.waitUntil(guarded);
  } catch {
    await guarded;
  }
}

export async function getDb(): Promise<DB> {
  return createDb((await getEnv()).DB);
}
