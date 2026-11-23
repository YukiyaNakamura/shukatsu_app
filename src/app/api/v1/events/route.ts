import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { createEventSchema } from "@/lib/validations/event";
import { createEvent } from "@/lib/data/calendar";

/** POST /api/v1/events — 独立予定の作成 (管理者は所属学生の予定を作成可) */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseBody(request, createEventSchema);
  return ok(await createEvent(ctx, input), 201);
});
