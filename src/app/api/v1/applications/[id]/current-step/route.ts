import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { setCurrentStepSchema } from "@/lib/validations/application";
import { getApplicationOverview, listSteps, setCurrentStage, setCurrentStep } from "@/lib/data/applications";

/**
 * PATCH /api/v1/applications/:id/current-step
 *   { expectedVersion, stepId }   … 指定ステップを現在段階にする (同じ応募のステップのみ: 複合外部キーでも保証)
 *   { expectedVersion, stepType } … 一覧画面の共通選択肢から変更 (該当ステップが無ければ追加)
 */
export const PATCH = withAuth<{ id: string }>(async ({ request, params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  const input = await parseBody(request, setCurrentStepSchema);
  if ("stepType" in input) {
    await setCurrentStage(ctx, id, input.stepType, input.expectedVersion);
  } else {
    await setCurrentStep(ctx, id, input.stepId, input.expectedVersion);
  }
  const [overview, steps] = await Promise.all([getApplicationOverview(ctx, id), listSteps(ctx, id)]);
  return ok({ overview, steps });
});
