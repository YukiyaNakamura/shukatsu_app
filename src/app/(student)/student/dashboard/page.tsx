import type { Metadata } from "next";
import Link from "next/link";
import { Award, Briefcase, CalendarClock, Plus, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layouts/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { UpcomingList } from "@/components/dashboard/upcoming-list";
import { ApplicationSheet } from "@/components/applications/application-sheet";
import { requireStudent, getDataContext } from "@/lib/auth/session";
import { listApplications } from "@/lib/data/applications";
import { listCalendarItems } from "@/lib/data/calendar";
import { getStudentMembership } from "@/lib/data/organization";

export const metadata: Metadata = { title: "ダッシュボード" };

export default async function StudentDashboardPage() {
  const user = await requireStudent();
  const ctx = await getDataContext();
  const now = new Date();
  const [allApps, upcoming, org] = await Promise.all([
    // 応募一覧で削除済みの表示・復元もできるよう、削除済みを含めて取得する
    listApplications(ctx, { studentId: user.id, includeDeleted: true }),
    listCalendarItems(ctx, {
      from: now.toISOString(),
      to: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
      studentId: user.id,
    }),
    getStudentMembership(ctx, user.id),
  ]);
  const apps = allApps.filter((a) => !a.deleted_at);
  const inProgress = apps.filter((a) => a.status === "IN_PROGRESS").length;
  const accepted = apps.filter((a) => a.status === "ACCEPTED").length;

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
      <section className="mt-6 grid gap-2">
        <h2 className="text-sm font-medium">直近の面接・締切</h2>
        <UpcomingList items={upcoming} applicationBasePath="/student/applications" calendarHref="/student/calendar" />
      </section>
      <section className="mt-6 grid gap-2">
        <div>
          <h2 className="text-sm font-medium">応募一覧</h2>
          <p className="text-xs text-muted-foreground">セルをクリックして直接編集できます。変更は自動で保存されます。</p>
        </div>
        <ApplicationSheet initialRows={allApps} detailBasePath="/student/applications" />
      </section>
    </>
  );
}
