import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { updateApplicationSchema } from "@/lib/validations/application";
import {
  getApplicationDetail,
  getApplicationOverview,
  setApplicationDeleted,
  toApplicationColumns,
  updateApplicationWithVersion,
} from "@/lib/data/applications";

type Params = { id: string };

/** GET /api/v1/applications/:id — 応募詳細 + 選考ステップ */
export const GET = withAuth<Params>(async ({ params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  return ok(await getApplicationDetail(supabase, id));
});

/** PATCH /api/v1/applications/:id — 楽観的ロック付き更新 (version 不一致は 409) */
export const PATCH = withAuth<Params>(async ({ request, params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const { expectedVersion, changes } = await parseBody(request, updateApplicationSchema);
  const patch = toApplicationColumns(changes);
  if (patch.selection_type === "INTERNSHIP") patch.is_early_selection = false;
  const application = await updateApplicationWithVersion(supabase, id, expectedVersion, patch);
  const overview = await getApplicationOverview(supabase, id);
  return ok({ application, overview });
});

/** DELETE /api/v1/applications/:id — 論理削除 (復元可能) */
export const DELETE = withAuth<Params>(async ({ params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const application = await setApplicationDeleted(supabase, id, true);
  return ok({ id: application.id, deletedAt: application.deleted_at, version: application.version });
});
