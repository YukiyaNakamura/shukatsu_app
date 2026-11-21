"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { FormField } from "./form-field";

export function LoginForm({ next, initialError }: { next: string | null; initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? "");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
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
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
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
