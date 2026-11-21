"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import { api, ClientApiError, errorMessage } from "@/lib/api-client";

export function ProfileForm({
  fullName,
  universityName,
  email,
  isStudent,
}: {
  fullName: string;
  universityName: string | null;
  email: string;
  isStudent: boolean;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setErrors({});
    try {
      await api("/api/v1/me", {
        method: "PATCH",
        body: {
          fullName: String(form.get("fullName") ?? ""),
          ...(isStudent ? { universityName: String(form.get("universityName") ?? "") } : {}),
        },
      });
      toast.success("プロフィールを保存しました");
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 422) setErrors(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-md gap-4">
      <FormField label="氏名" name="fullName" defaultValue={fullName} maxLength={100} error={errors.fullName} required />
      {isStudent && (
        <FormField label="大学名" name="universityName" defaultValue={universityName ?? ""} maxLength={100} error={errors.universityName} required />
      )}
      <FormField label="メールアドレス" name="email" value={email} readOnly disabled hint="ログインに使用するメールアドレスです" />
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        保存
      </Button>
    </form>
  );
}
