"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GraduationCap, Loader2, MailCheck, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { signUpSchema } from "@/lib/validations/profile";
import { FormField } from "./form-field";

type Role = "STUDENT" | "ADMIN";

export function RegisterForm({ next, defaultRole = "STUDENT" }: { next: string | null; defaultRole?: Role }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(defaultRole);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      role,
      fullName: form.get("fullName"),
      universityName: role === "STUDENT" ? form.get("universityName") : undefined,
      email: String(form.get("email") ?? "").trim(),
      password: form.get("password"),
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
      setErrors(fieldErrors);
      return;
    }
    if (form.get("password") !== form.get("passwordConfirm")) {
      setErrors({ passwordConfirm: "パスワードが一致しません" });
      return;
    }
    setErrors({});
    setFormError("");
    setPending(true);

    const input = parsed.data;
    const redirectTo = new URL("/auth/confirm", window.location.origin);
    // メールテンプレートで `{{ .RedirectTo }}&token_hash=...` と連結できるよう常にクエリを付ける
    redirectTo.searchParams.set("next", next ?? "/");
    const { data, error } = await createClient().auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: redirectTo.toString(),
        data: {
          role: input.role,
          full_name: input.fullName,
          university_name: input.role === "STUDENT" ? input.universityName : null,
        },
      },
    });
    setPending(false);
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    if (data.session) {
      // メール確認が無効な環境ではそのままログイン状態になる
      router.replace(next ?? "/");
      router.refresh();
      return;
    }
    setSentTo(input.email);
  }

  if (sentTo) {
    return (
      <div className="grid gap-4 text-sm">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
          <MailCheck className="size-5 shrink-0 text-primary" />
          <p>
            <span className="font-medium">{sentTo}</span> に確認メールを送信しました。メール内のリンクを開いて登録を完了してください。
          </p>
        </div>
        <p className="text-muted-foreground">メールが届かない場合は、迷惑メールフォルダを確認するか、時間をおいて再度登録してください。</p>
        <Button variant="outline" asChild>
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>ログイン画面へ</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div role="radiogroup" aria-label="アカウント種別" className="grid grid-cols-2 gap-2">
        {(
          [
            { value: "STUDENT", label: "学生", desc: "自分の選考を管理", icon: GraduationCap },
            { value: "ADMIN", label: "エージェント", desc: "学生の選考を支援", icon: Users },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={role === opt.value}
            onClick={() => setRole(opt.value)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              role === opt.value ? "border-primary bg-primary/5" : "hover:bg-muted",
            )}
          >
            <opt.icon className="size-4" />
            <span className="text-sm font-medium">{opt.label}</span>
            <span className="text-xs text-muted-foreground">{opt.desc}</span>
          </button>
        ))}
      </div>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FormField label="氏名" name="fullName" autoComplete="name" placeholder="山田 太郎" error={errors.fullName} required />
      {role === "STUDENT" && (
        <FormField label="大学名" name="universityName" autoComplete="organization" placeholder="〇〇大学" error={errors.universityName} required />
      )}
      <FormField label="メールアドレス" name="email" type="email" autoComplete="email" error={errors.email} required />
      <FormField
        label="パスワード"
        name="password"
        type="password"
        autoComplete="new-password"
        error={errors.password}
        hint="8文字以上"
        required
      />
      <FormField label="パスワード (確認)" name="passwordConfirm" type="password" autoComplete="new-password" error={errors.passwordConfirm} required />
      {role === "ADMIN" && (
        <p className="text-xs text-muted-foreground">登録後に組織を作成するか、オーナーから届いた招待リンクで既存の組織に参加できます。</p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        登録する
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        すでにアカウントをお持ちの方は{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-foreground underline-offset-4 hover:underline">
          ログイン
        </Link>
      </p>
    </form>
  );
}
