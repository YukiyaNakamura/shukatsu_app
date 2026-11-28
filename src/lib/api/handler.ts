import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { getAuth } from "@/lib/auth/server";
import type { DataContext } from "@/lib/server/context";
import { getDb } from "@/lib/server/env";
import { ApiError, fromDbError, type ApiErrorBody } from "./errors";

export type AuthedContext<P> = {
  request: NextRequest;
  params: P;
  /** ログイン中のユーザーの権限で動くデータアクセスのコンテキスト */
  ctx: DataContext;
  /** サーバー側で検証済みのユーザー。クライアントから送られた user_id は信用しない */
  user: { id: string; email: string; role: DataContext["actor"]["role"] };
};

const NO_STORE = { "Cache-Control": "private, no-store" };

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status, headers: NO_STORE });
}

export function errorResponse(error: unknown) {
  let e: ApiError;
  if (error instanceof ApiError) {
    e = error;
  } else {
    e = fromDbError(error) ?? new ApiError(500, "INTERNAL_ERROR", "サーバーでエラーが発生しました。時間をおいて再度お試しください。");
    if (e.status >= 500) console.error("Unhandled API error", error);
  }
  const body: ApiErrorBody = { error: { code: e.code, message: e.message, details: e.details } };
  return NextResponse.json(body, { status: e.status, headers: NO_STORE });
}

/** 状態を変更するリクエストのクロスサイト送信を拒否する (CSRF 対策) */
export function assertSameOrigin(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    throw new ApiError(403, "FORBIDDEN", "不正なリクエスト元です。");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiError(403, "FORBIDDEN", "不正なリクエスト元です。");
  }
}

/** 認証必須の Route Handler を作る。セッションは毎回 DB で検証する */
export function withAuth<P extends Record<string, string> = Record<string, never>>(
  handler: (ctx: AuthedContext<P>) => Promise<Response>,
) {
  return async (request: NextRequest, context: { params: Promise<P> }) => {
    try {
      assertSameOrigin(request);
      const auth = await getAuth();
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        throw new ApiError(401, "UNAUTHENTICATED", "ログインが必要です。再度ログインしてください。");
      }
      const role = (session.user as { role?: unknown }).role === "ADMIN" ? "ADMIN" : "STUDENT";
      const user = { id: session.user.id, email: session.user.email, role } as const;
      const params = context?.params ? await context.params : ({} as P);
      return await handler({ request, params, user, ctx: { db: await getDb(), actor: user } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** JSON ボディを Zod で検証する。JSON 不正は 400、検証失敗は 422 */
export async function parseBody<S extends z.ZodType>(request: NextRequest, schema: S): Promise<z.output<S>> {
  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError(400, "BAD_REQUEST", "Content-Type は application/json を指定してください。");
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "リクエストの形式が正しくありません。");
  }
  return validate(schema, json);
}

export function parseQuery<S extends z.ZodType>(request: NextRequest, schema: S): z.output<S> {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  return validate(schema, params);
}

export function parseParam<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(404, "NOT_FOUND", "対象が見つかりません。");
  return result.data;
}

function validate<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] ??= issue.message;
    }
    const first = result.error.issues[0]?.message ?? "入力内容を確認してください。";
    throw new ApiError(422, "VALIDATION_FAILED", first, { fieldErrors });
  }
  return result.data;
}
