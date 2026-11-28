import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, GraduationCap, Users } from "lucide-react";
import { getSessionUser, homePathFor } from "@/lib/auth/session";

export const metadata: Metadata = { title: { absolute: "選考管理アプリ" } };

const CHOICES = [
  {
    role: "STUDENT",
    label: "学生",
    description: "自分の応募と選考状況を管理する",
    icon: GraduationCap,
  },
  {
    role: "ADMIN",
    label: "管理者",
    description: "所属する学生の選考状況を確認・支援する (キャリア支援・エージェント)",
    icon: Users,
  },
] as const;

/** 初期画面: 学生 / 管理者のどちらでログインするかを選ぶ (ログイン済みならそれぞれのホームへ) */
export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect(homePathFor(user.profile.role));

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">ようこそ</h1>
        <p className="text-sm text-muted-foreground">利用するアカウントの種類を選んでください。</p>
      </div>
      <nav aria-label="アカウントの種類" className="grid gap-3">
        {CHOICES.map((c) => (
          <Link
            key={c.role}
            href={`/login?role=${c.role}`}
            className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <c.icon className="size-5" />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-medium">{c.label}としてログイン</span>
              <span className="text-xs text-muted-foreground">{c.description}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </nav>
      <p className="text-center text-sm text-muted-foreground">
        はじめての方は{" "}
        <Link href="/register?role=STUDENT" className="font-medium text-foreground underline-offset-4 hover:underline">
          学生
        </Link>
        {" / "}
        <Link href="/register?role=ADMIN" className="font-medium text-foreground underline-offset-4 hover:underline">
          管理者
        </Link>
        {" "}の新規登録へ
      </p>
    </div>
  );
}
