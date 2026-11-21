import type { Metadata } from "next";
import Link from "next/link";
import { Award, Briefcase, CalendarClock, Plus, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layouts/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { UpcomingList } from "@/components/dashboard/upcoming-list";
import { SelectionTypeBadge, StatusBadge } from "@/components/applications/badges";
import { requireStudent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listApplications } from "@/lib/data/applications";
import { listCalendarItems } from "@/lib/data/calendar";
import { getStudentMembership } from "@/lib/data/organization";
import { formatRelative } from "@/lib/utils/datetime";

export const metadata: Metadata = { title: "ダッシュボード" };

export default async function StudentDashboardPage() {
  const user = await requireStudent();
  const supabase = await createClient();
  const now = new Date();
  const [apps, upcoming, org] = await Promise.all([
    listApplications(supabase, { studentId: user.id }),
    listCalendarItems(supabase, {
      from: now.toISOString(),
      to: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
      studentId: user.id,
    }),
    getStudentMembership(supabase, user.id),
  ]);
  const inProgress = apps.filter((a) => a.status === "IN_PROGRESS").length;
  const accepted = apps.filter((a) => a.status === "ACCEPTED").length;
  const recent = [...apps].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);

  return (
    <>
      <PageHeader
        title={`${user.profile.full_name}さんのダッシュボード`}
        description={org.organization && org.membership ? `${org.organization.name} に所属中` : "個人で利用中"}
        actions={
          <Button asChild>
            <Link href="/student/applications">
              <Plus />
              応募を管理
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="応募数" value={apps.length} icon={Briefcase} href="/student/applications" />
        <StatCard label="選考中" value={inProgress} icon={Timer} tone="blue" href="/student/applications" />
        <StatCard label="内定・参加決定" value={accepted} icon={Award} tone="green" href="/student/applications" />
        <StatCard label="2週間以内の予定" value={upcoming.length} icon={CalendarClock} tone="amber" href="/student/calendar" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="grid gap-2">
          <h2 className="text-sm font-medium">直近の面接・締切</h2>
          <UpcomingList items={upcoming} applicationBasePath="/student/applications" calendarHref="/student/calendar" />
        </section>
        <section className="grid h-fit gap-2">
          <h2 className="text-sm font-medium">最近更新した応募</h2>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              まだ応募がありません。
              <Link href="/student/applications" className="ml-1 font-medium text-foreground underline underline-offset-4">
                企業を追加する
              </Link>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {recent.map((a) => (
                <li key={a.id}>
                  <Link href={`/student/applications/${a.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.company_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.current_step_name ?? "段階未設定"}</p>
                    </div>
                    <SelectionTypeBadge type={a.selection_type} early={a.is_early_selection} className="hidden sm:inline-flex" />
                    <StatusBadge status={a.status} type={a.selection_type} />
                    <span className="hidden w-16 text-right text-xs text-muted-foreground sm:block">{formatRelative(a.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
