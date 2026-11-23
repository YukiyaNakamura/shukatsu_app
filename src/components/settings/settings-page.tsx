import "server-only";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layouts/page-header";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import type { SessionUser } from "@/lib/auth/session";
import { getDataContext } from "@/lib/auth/session";
import { getOpenDeletionRequest } from "@/lib/data/account";
import { ProfileForm } from "./profile-form";
import { AccountDeletion } from "./account-deletion";

export async function SettingsPage({ user }: { user: SessionUser }) {
  const deletion = await getOpenDeletionRequest(await getDataContext());
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
