import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser, homePathFor } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/auth-errors";
import { parseRole, ROLE_LABELS } from "@/lib/auth/roles";

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
  // 初期画面で選んだアカウントの種類 (未指定なら種類を問わないログイン)
  const role = parseRole(sp.role);
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
    <div className="grid gap-3">
      <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <ArrowLeft className="size-4" />
        {role ? "種類を選び直す" : "学生 / 管理者を選ぶ"}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{role ? `${ROLE_LABELS[role]}ログイン` : "ログイン"}</CardTitle>
          <CardDescription>
            {role === "ADMIN"
              ? "管理者 (キャリア支援・エージェント) のアカウントでログインします。"
              : role === "STUDENT"
                ? "学生のアカウントでログインします。"
                : "メールアドレスとパスワードでログインします。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} role={role} initialError={error} notice={notice} />
        </CardContent>
      </Card>
    </div>
  );
}
