"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { emailSchema } from "@/lib/validations/profile";
import { FormField } from "./form-field";

export function ResetPasswordForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(String(new FormData(e.currentTarget).get("email") ?? "").trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setPending(true);
    setError("");
    // メール内のリンクは /update-password?token=... に戻る
    const { error } = await authClient.requestPasswordReset({ email: parsed.data, redirectTo: "/update-password" });
    setPending(false);
    if (error) {
      setError(authErrorMessage(error));
      return;
    }
    // 登録有無を推測されないよう、常に同じ表示にする
    setSent(true);
  }

  if (sent) {
    return (
      <div className="grid gap-4 text-sm">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
          <MailCheck className="size-5 shrink-0 text-primary" />
          <p>登録済みのメールアドレスであれば、パスワード再設定用のリンクを送信しました。</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/login">ログイン画面へ</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <FormField label="メールアドレス" name="email" type="email" autoComplete="email" required autoFocus />
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        再設定メールを送信
      </Button>
      <Link href="/login" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
        ログイン画面に戻る
      </Link>
    </form>
  );
}
