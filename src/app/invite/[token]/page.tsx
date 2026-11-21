import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInvitation } from "@/components/organization/accept-invitation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, homePathFor } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/utils/datetime";

export const metadata: Metadata = { title: "組織への招待", robots: { index: false } };

const STATE_MESSAGES = {
  NOT_FOUND: "招待リンクが無効です。URLが正しいか確認してください。",
  EXPIRED: "この招待リンクは有効期限が切れています。組織の管理者に再発行を依頼してください。",
  USED: "この招待リンクはすでに使用されています。",
  REVOKED: "この招待リンクは取り消されています。",
} as const;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f]{64}$/.test(token);
  const supabase = await createClient();
  const info = valid ? (await supabase.rpc("get_invitation", { p_token: token })).data?.[0] : undefined;
  const state = info?.state ?? "NOT_FOUND";
  const user = await getSessionUser();
  const next = `/invite/${token}`;

  return (
    <div className="flex min-h-svh items-start justify-center bg-muted/40 px-4 py-16 sm:items-center">
      <Card className="w-full max-w-md">
        {state !== "VALID" || !info ? (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleAlert className="size-5 text-destructive" />
                招待リンクを利用できません
              </CardTitle>
              <CardDescription>{STATE_MESSAGES[state as keyof typeof STATE_MESSAGES] ?? STATE_MESSAGES.NOT_FOUND}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/">トップへ</Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-5" />
                {info.organization_name}
              </CardTitle>
              <CardDescription>
                {info.invitee_role === "ADMIN" ? "管理者として" : ""}組織への招待が届いています。有効期限: {formatDateTime(info.expires_at)}
                {info.email_restricted && " ・ 招待されたメールアドレスでログインしてください。"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!user ? (
                <div className="grid gap-2">
                  <p className="mb-2 text-sm text-muted-foreground">参加するには、ログインまたは新規登録してください。</p>
                  <Button asChild>
                    <Link href={`/register?next=${encodeURIComponent(next)}${info.invitee_role === "ADMIN" ? "&role=ADMIN" : ""}`}>新規登録して参加</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/login?next=${encodeURIComponent(next)}`}>ログインして参加</Link>
                  </Button>
                </div>
              ) : user.profile.role !== info.invitee_role ? (
                <div className="grid gap-3 text-sm">
                  <p className="text-destructive">
                    この招待は{info.invitee_role === "ADMIN" ? "管理者" : "学生"}アカウント向けです。現在 {user.email} ({user.profile.role === "ADMIN" ? "管理者" : "学生"}) でログインしています。
                  </p>
                  <form action="/auth/signout" method="post">
                    <Button type="submit" variant="outline">
                      別のアカウントでログイン
                    </Button>
                  </form>
                  <Button asChild variant="ghost">
                    <Link href={homePathFor(user.profile.role)}>ホームへ戻る</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  <p className="text-xs text-muted-foreground">ログイン中: {user.email}</p>
                  <AcceptInvitation token={token} organizationName={info.organization_name ?? ""} inviteeRole={info.invitee_role ?? "STUDENT"} />
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
