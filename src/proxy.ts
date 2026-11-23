import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Cookie 名の接頭辞 (src/lib/auth/server.ts の AUTH_COOKIE_PREFIX と同じ値) */
const AUTH_COOKIE_PREFIX = "shukatsu";

const PUBLIC_PATHS = ["/login", "/register", "/reset-password", "/update-password", "/auth", "/invite", "/terms", "/api/auth", "/api/ops"];

function isPublic(pathname: string) {
  return pathname === "/" || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 未ログインのユーザーを保護ページから /login へ誘導する。
 * ここでは Cookie の有無だけを見る (DB にアクセスしない一次防御)。
 * セッションの検証と認可は、各ページ・API のサーバー側処理で必ず行う。
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname) || getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "ログインが必要です。再度ログインしてください。" } },
      { status: 401 },
    );
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
