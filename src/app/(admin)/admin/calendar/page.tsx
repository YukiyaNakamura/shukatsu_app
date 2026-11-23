import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/page-header";
import { CalendarView } from "@/components/calendar/calendar-view";
import { requireOrgAdmin, getDataContext } from "@/lib/auth/session";
import { loadCalendarPage } from "@/lib/data/calendar-page";
import { listOrgStudents } from "@/lib/data/organization";

export const metadata: Metadata = { title: "カレンダー" };

export default async function AdminCalendarPage() {
  await requireOrgAdmin();
  const ctx = await getDataContext();
  const [data, students] = await Promise.all([loadCalendarPage(ctx), listOrgStudents(ctx)]);
  return (
    <>
      <PageHeader title="カレンダー" description="所属学生全員の面接・締切・予定です。" />
      <CalendarView
        initialYear={data.year}
        initialMonth={data.month}
        initialItems={data.items}
        applications={data.applications}
        students={students.map((s) => ({ id: s.student_id, name: s.full_name }))}
        applicationBasePath="/admin/applications"
        showStudent
      />
    </>
  );
}
