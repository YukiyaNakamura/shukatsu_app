"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage, verifiedCallbackPath } from "@/lib/auth/auth-errors";
import { FormField } from "./form-field";

export function LoginForm({ next, initialError, notice }: { next: string | null; initialError?: string; notice?: string }) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? "");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      // メールアドレスが未確認の場合に再送する確認メールの戻り先
      callbackURL: verifiedCallbackPath(next),
    });
    if (error) {
      setError(authErrorMessage(error));
      setPending(false);
      return;
    }
    router.replace(next ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : notice ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      <FormField label="メールアドレス" name="email" type="email" autoComplete="email" required autoFocus />
      <FormField label="パスワード" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        ログイン
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Link href="/reset-password" className="text-muted-foreground underline-offset-4 hover:underline">
          パスワードを忘れた方
        </Link>
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-medium underline-offset-4 hover:underline">
          新規登録
        </Link>
      </div>
    </form>
  );
}
