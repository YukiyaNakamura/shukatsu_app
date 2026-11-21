import "server-only";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/page-header";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import type { SessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { AccountDeletion } from "./account-deletion";

export async function SettingsPage({ user }: { user: SessionUser }) {
  const supabase = await createClient();
  const { data: deletion } = await supabase
    .from("account_deletion_requests")
    .select("status, requested_at")
    .in("status", ["REQUESTED", "PROCESSING"])
    .maybeSingle();
  return (
    <>
      <PageHeader title="設定" />
      <div className="grid max-w-2xl gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">プロフィール</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm
              fullName={user.profile.full_name}
              universityName={user.profile.university_name}
              email={user.email}
              isStudent={user.profile.role === "STUDENT"}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">パスワードの変更</CardTitle>
          </CardHeader>
          <CardContent className="max-w-md">
            <UpdatePasswordForm />
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base">退会</CardTitle>
            <CardDescription>アカウントの削除を申請します。</CardDescription>
          </CardHeader>
          <CardContent>
            <AccountDeletion request={deletion} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
