import "server-only";
import type { DataContext } from "@/lib/server/context";
import { currentJstYearMonth, jstMonthRange } from "@/lib/utils/datetime";
import { listCalendarItems } from "./calendar";
import { listApplications } from "./applications";

/** カレンダー画面の初期データ (当月 ± 7 日) */
export async function loadCalendarPage(ctx: DataContext) {
  const { year, month } = currentJstYearMonth();
  const { from, to } = jstMonthRange(year, month);
  const f = new Date(new Date(from).getTime() - 7 * 86_400_000).toISOString();
  const t = new Date(new Date(to).getTime() + 7 * 86_400_000).toISOString();
  const [items, apps] = await Promise.all([listCalendarItems(ctx, { from: f, to: t }), listApplications(ctx)]);
  return {
    year,
    month,
    items,
    applications: apps.map((a) => ({ id: a.id, company_name: a.company_name, student_id: a.student_id })),
  };
}
