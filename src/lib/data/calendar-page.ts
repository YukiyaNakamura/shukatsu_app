import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { currentJstYearMonth, jstMonthRange } from "@/lib/utils/datetime";
import { listCalendarItems } from "./calendar";
import { listApplications } from "./applications";

/** カレンダー画面の初期データ (当月 ± 7 日) */
export async function loadCalendarPage(supabase: ServerSupabase) {
  const { year, month } = currentJstYearMonth();
  const { from, to } = jstMonthRange(year, month);
  const f = new Date(new Date(from).getTime() - 7 * 86_400_000).toISOString();
  const t = new Date(new Date(to).getTime() + 7 * 86_400_000).toISOString();
  const [items, apps] = await Promise.all([listCalendarItems(supabase, { from: f, to: t }), listApplications(supabase)]);
  return {
    year,
    month,
    items,
    applications: apps.map((a) => ({ id: a.id, company_name: a.company_name, student_id: a.student_id })),
  };
}
