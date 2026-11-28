"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { authErrorMessage, verifiedCallbackPath } from "@/lib/auth/auth-errors";
import { ROLE_LABELS, type AccountRole } from "@/lib/auth/roles";
import { FormField } from "./form-field";

type Props = {
  next: string | null;
  /** 初期画面で選んだアカウントの種類。指定時は、種類が違うアカウントではログインさせない */
  role?: AccountRole | null;
  initialError?: string;
  notice?: string;
};

export function LoginForm({ next, role, initialError, notice }: Props) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? "");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    const { data, error } = await authClient.signIn.email({
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
    const actual = data?.user.role === "ADMIN" ? "ADMIN" : "STUDENT";
    if (role && actual !== role) {
      // アカウントの種類は登録時に決まり変更できないため、選び直してもらう
      await authClient.signOut();
      setError(`このアカウントは${ROLE_LABELS[actual]}用です。初期画面で「${ROLE_LABELS[actual]}」を選んでログインしてください。`);
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
        <Link href={registerHref(next, role)} className="font-medium underline-offset-4 hover:underline">
          新規登録
        </Link>
      </div>
    </form>
  );
}

function registerHref(next: string | null, role: AccountRole | null | undefined) {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (next) params.set("next", next);
  const query = params.toString();
  return query ? `/register?${query}` : "/register";
}
