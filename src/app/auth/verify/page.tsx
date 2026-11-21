import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/auth/auth-errors";

export const metadata: Metadata = { title: "メールアドレスの確認", robots: { index: false } };

/** メールリンクの確認画面。ボタン押下 (POST) で初めて検証・ログインする (ログイン CSRF 対策) */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tokenHash = typeof sp.token_hash === "string" ? sp.token_hash : "";
  const type = typeof sp.type === "string" ? sp.type : "";
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null) ?? "/";
  const recovery = type === "recovery";
  return (
    <div className="flex min-h-svh items-start justify-center bg-muted/40 px-4 py-16 sm:items-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{recovery ? "パスワードの再設定" : "メールアドレスの確認"}</CardTitle>
          <CardDescription>
            {recovery
              ? "ボタンを押すと、新しいパスワードの設定画面に進みます。"
              : "ボタンを押すとメールアドレスの確認を完了し、ログインします。心当たりのないメールの場合は、このページを閉じてください。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/auth/confirm" method="post">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next} />
            <Button type="submit" className="w-full" disabled={!tokenHash}>
              {recovery ? "再設定に進む" : "確認してログイン"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
