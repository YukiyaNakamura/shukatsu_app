import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser, homePathFor } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/auth-errors";

export const metadata: Metadata = { title: "ログイン" };

/** Better Auth がメール確認の失敗時に付ける ?error= と、アプリ独自のエラー */
const ERRORS: Record<string, string> = {
  INVALID_TOKEN: "確認リンクが無効か、有効期限が切れています。ログインすると確認メールを再送します。",
  TOKEN_EXPIRED: "確認リンクの有効期限が切れています。ログインすると確認メールを再送します。",
  USER_NOT_FOUND: "確認リンクが無効です。",
  session_expired: "セッションの有効期限が切れました。再度ログインしてください。",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  const user = await getSessionUser();
  if (user) redirect(next ?? homePathFor(user.profile.role));
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? ERRORS.INVALID_TOKEN) : undefined;
  const notice =
    sp.verified === "1"
      ? "メールアドレスを確認しました。ログインしてください。"
      : sp.reset === "1"
        ? "パスワードを変更しました。新しいパスワードでログインしてください。"
        : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">ログイン</CardTitle>
        <CardDescription>メールアドレスとパスワードでログインします。</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} initialError={error} notice={notice} />
      </CardContent>
    </Card>
  );
}
