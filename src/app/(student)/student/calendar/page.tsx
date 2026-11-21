import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/page-header";
import { CalendarView } from "@/components/calendar/calendar-view";
import { requireStudent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadCalendarPage } from "@/lib/data/calendar-page";

export const metadata: Metadata = { title: "カレンダー" };

export default async function StudentCalendarPage() {
  await requireStudent();
  const data = await loadCalendarPage(await createClient());
  return (
    <>
      <PageHeader title="カレンダー" description="選考ステップの日程・締切と、自分で登録した予定をまとめて確認できます。" />
      <CalendarView
        initialYear={data.year}
        initialMonth={data.month}
        initialItems={data.items}
        applications={data.applications}
        applicationBasePath="/student/applications"
      />
    </>
  );
}
