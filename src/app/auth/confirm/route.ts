import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/auth-errors";

/** 受け付けるリンク種別 (magiclink 等は使用しないため拒否) */
const ALLOWED_TYPES = new Set<EmailOtpType>(["signup", "email", "recovery", "email_change"]);

function fail(origin: string) {
  return NextResponse.redirect(new URL("/login?error=confirm_failed", origin), { status: 303 });
}

/**
 * GET: メール内リンクの受け口。
 *   - PKCE (?code=): コード検証子 Cookie は本人のブラウザにしか無いため、ここで直接セッション化してよい
 *   - token_hash: GET だけでセッションを作るとログイン CSRF (他人のアカウントへ強制ログイン) が可能になるため、
 *     確認画面 (/auth/verify) でユーザーのクリック (POST) を経てから検証する
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next")) ?? "/";
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (code) {
    const supabase = await createClient();
    if ((await supabase.auth.exchangeCodeForSession(code)).error) return fail(origin);
    return NextResponse.redirect(new URL(next, origin));
  }
  if (tokenHash && type && ALLOWED_TYPES.has(type)) {
    const verify = new URL("/auth/verify", origin);
    verify.searchParams.set("token_hash", tokenHash);
    verify.searchParams.set("type", type);
    verify.searchParams.set("next", next);
    return NextResponse.redirect(verify);
  }
  return fail(origin);
}

/** POST: 確認画面からの送信。同一オリジンからのフォーム送信のみ受け付ける */
export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const reqOrigin = request.headers.get("origin");
  if (reqOrigin && reqOrigin !== origin) return fail(origin);
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail(origin);

  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "") as EmailOtpType;
  const next = safeNextPath(String(form.get("next") ?? "")) ?? "/";
  if (!tokenHash || !ALLOWED_TYPES.has(type)) return fail(origin);

  const supabase = await createClient();
  if ((await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error) return fail(origin);
  return NextResponse.redirect(new URL(type === "recovery" ? "/update-password" : next, origin), { status: 303 });
}
