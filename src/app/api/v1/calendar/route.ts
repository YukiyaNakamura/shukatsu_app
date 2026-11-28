import { ok, parseQuery, withAuth } from "@/lib/api/handler";
import { calendarQuerySchema } from "@/lib/validations/event";
import { listCalendarItems } from "@/lib/data/calendar";

/** GET /api/v1/calendar?from=&to=&studentId= — 選考ステップの日時と独立予定 */
export const GET = withAuth(async ({ request, ctx }) => {
  const query = parseQuery(request, calendarQuerySchema);
  return ok(await listCalendarItems(ctx, query));
});
