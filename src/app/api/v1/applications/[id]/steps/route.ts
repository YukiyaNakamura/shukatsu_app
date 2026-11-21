import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { ApiError, unwrap } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";
import { createStepSchema } from "@/lib/validations/step";
import { getApplication, listSteps } from "@/lib/data/applications";
import { STEP_TYPE_LABELS } from "@/lib/constants";

type Params = { id: string };

/** GET /api/v1/applications/:id/steps */
export const GET = withAuth<Params>(async ({ params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  await getApplication(supabase, id);
  return ok(await listSteps(supabase, id));
});

/** POST /api/v1/applications/:id/steps — ステップ追加 (同種ステップの複数登録可) */
export const POST = withAuth<Params>(async ({ request, params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const input = await parseBody(request, createStepSchema);
  const app = await getApplication(supabase, id);
  if (app.deleted_at) throw new ApiError(410, "APPLICATION_DELETED", "削除済みの応募にはステップを追加できません。");

  let position = input.position;
  if (position === undefined) {
    const last = unwrap(
      await supabase.from("selection_steps").select("position").eq("application_id", id).order("position", { ascending: false }).limit(1),
    );
    position = last.length ? last[0].position + 1 : 0;
  }
  const step = unwrap(
    await supabase
      .from("selection_steps")
      .insert({
        application_id: id,
        step_type: input.stepType,
        display_name: input.displayName ?? STEP_TYPE_LABELS[input.stepType],
        position,
        status: input.status ?? (input.scheduledAt ? "SCHEDULED" : "NOT_STARTED"),
        result: input.result ?? null,
        scheduled_at: input.scheduledAt ?? null,
        deadline_at: input.deadlineAt ?? null,
        location: input.location ?? null,
        meeting_url: input.meetingUrl ?? null,
        notes: input.notes ?? null,
      })
      .select("*")
      .single(),
  );
  return ok(step, 201);
});
