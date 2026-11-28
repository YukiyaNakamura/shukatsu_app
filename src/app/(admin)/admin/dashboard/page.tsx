import type { Metadata } from "next";
import Link from "next/link";
import { Award, Timer, TriangleAlert, Users } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { UpcomingList } from "@/components/dashboard/upcoming-list";
import { requireOrgAdmin, getDataContext } from "@/lib/auth/session";
import { getOrgDashboard } from "@/lib/data/organization";
import { formatRelative } from "@/lib/utils/datetime";

export const metadata: Metadata = { title: "ダッシュボード" };

export default async function AdminDashboardPage() {
  const ctx = await requireOrgAdmin();
  const d = await getOrgDashboard(await getDataContext());
  return (
    <>
      <PageHeader title="ダッシュボード" description={ctx.membership.organization_name} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="所属学生数" value={d.studentCount} icon={Users} href="/admin/students" />
        <StatCard label="選考中の応募" value={d.inProgressCount} icon={Timer} tone="blue" href="/admin/applications" />
        <StatCard label="内定・参加決定" value={d.acceptedCount} icon={Award} tone="green" href="/admin/applications" />
        <StatCard label={`${d.staleDays}日以上更新なし`} value={d.staleStudents.length} icon={TriangleAlert} tone="amber" href="/admin/students" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="grid h-fit gap-2">
          <h2 className="text-sm font-medium">直近2週間の面接・締切</h2>
          <UpcomingList items={d.upcoming} applicationBasePath="/admin/applications" calendarHref="/admin/calendar" showStudent />
        </section>
        <section className="grid h-fit gap-2">
          <h2 className="text-sm font-medium">最終更新から{d.staleDays}日以上経過している学生</h2>
          {d.staleStudents.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">該当する学生はいません</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {d.staleStudents.map((s) => (
                <li key={s.student_id}>
                  <Link href={`/admin/students/${s.student_id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.university_name}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{s.last_updated_at ? `最終更新 ${formatRelative(s.last_updated_at)}` : "応募未登録"}</span>
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
