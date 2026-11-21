import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";
import { createEventSchema } from "@/lib/validations/event";

/** POST /api/v1/events — 独立予定の作成 (管理者は所属学生の予定を作成可。RLS で検証) */
export const POST = withAuth(async ({ request, supabase, user }) => {
  const input = await parseBody(request, createEventSchema);
  const event = unwrap(
    await supabase
      .from("events")
      .insert({
        student_id: input.studentId ?? user.id,
        application_id: input.applicationId ?? null,
        title: input.title,
        starts_at: input.startsAt,
        ends_at: input.endsAt ?? null,
        description: input.description ?? null,
      })
      .select("*")
      .single(),
  );
  return ok(event, 201);
});
