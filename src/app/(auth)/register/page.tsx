import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/components/auth/register-form";
import { getSessionUser, homePathFor } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/auth-errors";

export const metadata: Metadata = { title: "新規登録" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  const user = await getSessionUser();
  if (user) redirect(next ?? homePathFor(user.profile.role));
  return (
    <div className="grid gap-3">
      <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <ArrowLeft className="size-4" />
        学生 / 管理者を選ぶ
      </Link>
      <Card>
      <CardHeader>
        <CardTitle className="text-xl">新規登録</CardTitle>
        <CardDescription>アカウントの種類を選んで登録してください。種類は後から変更できません。</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm next={next} defaultRole={sp.role === "ADMIN" ? "ADMIN" : "STUDENT"} />
      </CardContent>
      </Card>
    </div>
  );
}
