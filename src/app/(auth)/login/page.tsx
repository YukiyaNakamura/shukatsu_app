import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser, homePathFor } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/auth-errors";

export const metadata: Metadata = { title: "ログイン" };

const ERRORS: Record<string, string> = {
  confirm_failed: "確認リンクが無効か、有効期限が切れています。もう一度お試しください。",
  session_expired: "セッションの有効期限が切れました。再度ログインしてください。",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  const user = await getSessionUser();
  if (user) redirect(next ?? homePathFor(user.profile.role));
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">ログイン</CardTitle>
        <CardDescription>メールアドレスとパスワードでログインします。</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} initialError={error} />
      </CardContent>
    </Card>
  );
}
