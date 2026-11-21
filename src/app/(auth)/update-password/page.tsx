import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "新しいパスワードの設定" };

export default async function UpdatePasswordPage() {
  await requireUser();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">新しいパスワードの設定</CardTitle>
        <CardDescription>新しいパスワードを入力してください。</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm redirectTo="/" />
      </CardContent>
    </Card>
  );
}
