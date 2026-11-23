import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { z } from "zod";
import { createDb } from "@/db";
import { authSchema } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/server/crypto";
import { getEnv, runInBackground, type AppEnv } from "@/lib/server/env";
import { linkMail, sendMail } from "@/lib/server/mail";
import { signUpSchema } from "@/lib/validations/profile";

/** Cookie 名の接頭辞 (proxy.ts でセッション Cookie の有無を確認するときにも使う) */
export const AUTH_COOKIE_PREFIX = "shukatsu";

/**
 * Better Auth の設定。
 *   - メールアドレス + パスワード。ログインにはメールアドレスの確認が必須
 *   - 確認リンクを開いても自動ログインはしない (他人のアカウントへ強制ログインさせる「ログイン CSRF」の対策)
 *   - ロールはサインアップ時のみ指定でき、ユーザー情報の更新 API は無効化している (権限昇格対策)
 */
function buildAuth(env: AppEnv) {
  const db = createDb(env.DB);
  return betterAuth({
    appName: "選考管理アプリ",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    // D1 は対話的なトランザクションに対応しないため transaction: false
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema, transaction: false }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 72,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user, url }) => {
        // 登録の有無を応答時間から推測されないよう、送信は応答後に行う
        await runInBackground(
          sendMail(
            env,
            linkMail({
              to: user.email,
              subject: "【選考管理アプリ】パスワードの再設定",
              lead: `${user.name} 様\nパスワード再設定のリクエストを受け付けました。下のボタンから新しいパスワードを設定してください (有効期限: 1 時間)。`,
              linkLabel: "パスワードを再設定する",
              url,
              note: "心当たりがない場合は、このメールを破棄してください。パスワードは変更されません。",
            }),
          ),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await runInBackground(
          sendMail(
            env,
            linkMail({
              to: user.email,
              subject: "【選考管理アプリ】メールアドレスの確認",
              lead: `${user.name} 様\n選考管理アプリへのご登録ありがとうございます。下のボタンからメールアドレスの確認を完了してください (有効期限: 24 時間)。`,
              linkLabel: "メールアドレスを確認する",
              url,
              note: "心当たりがない場合は、このメールを破棄してください。",
            }),
          ),
        );
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: true, input: true, validator: { input: z.enum(["STUDENT", "ADMIN"]) } },
        universityName: { type: "string", required: false, input: true },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    // アプリでは使わない・権限昇格につながるエンドポイントを無効化 (プロフィール更新は /api/v1/me で行う)
    disabledPaths: ["/update-user", "/change-email", "/delete-user", "/delete-user/callback", "/link-social", "/unlink-account"],
    rateLimit: {
      enabled: true,
      // Workers はインスタンス間でメモリを共有しないため D1 に保存する
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      // Cloudflare が付与する接続元 IP (レート制限に使う)
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
      database: { generateId: () => crypto.randomUUID() },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        // サインアップの入力をアプリのルール (学生は大学名必須など) で検証する
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const parsed = signUpSchema.safeParse({
          role: body.role,
          fullName: body.name,
          universityName: body.role === "STUDENT" ? body.universityName : undefined,
          email: typeof body.email === "string" ? body.email.trim() : body.email,
          password: body.password,
        });
        if (!parsed.success) {
          throw new APIError("BAD_REQUEST", { message: parsed.error.issues[0]?.message ?? "入力内容を確認してください。", code: "INVALID_SIGN_UP" });
        }
        const input = parsed.data;
        return {
          context: {
            body: {
              ...body,
              email: input.email,
              name: input.fullName,
              role: input.role,
              universityName: input.role === "STUDENT" ? input.universityName : null,
            },
          },
        };
      }),
    },
  });
}

export type Auth = ReturnType<typeof buildAuth>;

const cache = new WeakMap<object, Auth>();

/** リクエストの環境 (D1 バインディング・シークレット) に対応する Better Auth のインスタンス */
export async function getAuth(): Promise<Auth> {
  const env = await getEnv();
  let auth = cache.get(env);
  if (!auth) {
    auth = buildAuth(env);
    cache.set(env, auth);
  }
  return auth;
}
