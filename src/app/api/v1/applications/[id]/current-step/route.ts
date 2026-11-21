import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";
import { setCurrentStepSchema } from "@/lib/validations/application";
import { getApplicationOverview, listSteps, updateApplicationWithVersion } from "@/lib/data/applications";

/**
 * PATCH /api/v1/applications/:id/current-step
 *   { expectedVersion, stepId }   … 指定ステップを現在段階にする (同じ応募のステップのみ: DB の複合 FK で保証)
 *   { expectedVersion, stepType } … 一覧画面の共通選択肢から変更 (該当ステップが無ければ追加)
 */
export const PATCH = withAuth<{ id: string }>(async ({ request, params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const input = await parseBody(request, setCurrentStepSchema);
  if ("stepType" in input) {
    unwrap(
      await supabase.rpc("set_current_stage", {
        p_application_id: id,
        p_step_type: input.stepType,
        p_expected_version: input.expectedVersion,
      }),
    );
  } else {
    await updateApplicationWithVersion(supabase, id, input.expectedVersion, { current_step_id: input.stepId });
  }
  const [overview, steps] = await Promise.all([getApplicationOverview(supabase, id), listSteps(supabase, id)]);
  return ok({ overview, steps });
});
