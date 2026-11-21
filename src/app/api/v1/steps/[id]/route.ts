import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { ApiError, unwrap } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";
import { updateStepSchema } from "@/lib/validations/step";
import { toStepColumns, updateStepWithVersion } from "@/lib/data/steps";

type Params = { id: string };

/** PATCH /api/v1/steps/:id — 楽観的ロック付き更新 */
export const PATCH = withAuth<Params>(async ({ request, params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const { expectedVersion, changes } = await parseBody(request, updateStepSchema);
  return ok(await updateStepWithVersion(supabase, id, expectedVersion, toStepColumns(changes)));
});

/** DELETE /api/v1/steps/:id — 現在段階だった場合は current_step_id が NULL になる (FK) */
export const DELETE = withAuth<Params>(async ({ params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const deleted = unwrap(await supabase.from("selection_steps").delete().eq("id", id).select("id, application_id"));
  if (!deleted.length) throw new ApiError(404, "NOT_FOUND", "選考ステップが見つかりません。");
  return ok(deleted[0]);
});
