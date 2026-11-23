import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";

/** POST /auth/signout — ログアウト (フォーム送信用。セッションを DB から削除し Cookie を消す) */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "不正なリクエスト元です。" } }, { status: 403 });
  }
  const redirect = NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
  try {
    const auth = await getAuth();
    const res = await auth.api.signOut({ headers: request.headers, asResponse: true });
    for (const cookie of res.headers.getSetCookie()) redirect.headers.append("set-cookie", cookie);
  } catch {
    // セッションが既に無い場合もログイン画面へ戻す
  }
  return redirect;
}
