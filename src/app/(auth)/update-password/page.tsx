import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "新しいパスワードの設定", robots: { index: false } };

/**
 * パスワード再設定メールのリンク先 (/api/auth/reset-password/:token から ?token= 付きで戻る)。
 * token が無い場合はログイン中のユーザーのパスワード変更。
 */
export default async function UpdatePasswordPage({ searchParams }: PageProps<"/update-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(sp.token) ? sp.token : undefined;
  const invalid = typeof sp.error === "string";
  if (!token && !invalid) await requireUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">新しいパスワードの設定</CardTitle>
        <CardDescription>
          {invalid ? "再設定リンクが無効か、有効期限が切れています。" : "新しいパスワードを入力してください。"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {invalid ? (
          <Button asChild variant="outline">
            <Link href="/reset-password">再設定メールをもう一度送る</Link>
          </Button>
        ) : (
          <UpdatePasswordForm token={token} />
        )}
      </CardContent>
    </Card>
  );
}
