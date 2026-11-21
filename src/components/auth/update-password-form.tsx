"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { passwordSchema } from "@/lib/validations/profile";
import { FormField } from "./form-field";

export function UpdatePasswordForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const parsed = passwordSchema.safeParse(form.get("password"));
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (form.get("password") !== form.get("passwordConfirm")) return setError("パスワードが一致しません");
    setPending(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ password: parsed.data });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    toast.success("パスワードを変更しました");
    formEl.reset();
    if (redirectTo) {
      router.replace(redirectTo);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <FormField label="新しいパスワード" name="password" type="password" autoComplete="new-password" hint="8文字以上" required />
      <FormField label="新しいパスワード (確認)" name="passwordConfirm" type="password" autoComplete="new-password" required />
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        パスワードを変更
      </Button>
    </form>
  );
}
