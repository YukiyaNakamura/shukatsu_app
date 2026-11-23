import { ok, parseBody, parseQuery, withAuth } from "@/lib/api/handler";
import { createApplication, listApplications } from "@/lib/data/applications";
import { createApplicationSchema, listApplicationsQuerySchema } from "@/lib/validations/application";

/** GET /api/v1/applications — 応募一覧 (本人分 / 管理者は自組織学生分のみ) */
export const GET = withAuth(async ({ request, ctx }) => {
  const filters = parseQuery(request, listApplicationsQuerySchema);
  return ok(await listApplications(ctx, filters));
});

/** POST /api/v1/applications — 応募作成 (テンプレートから初期ステップを生成) */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseBody(request, createApplicationSchema);
  // 代理登録の studentId は「自組織に所属する学生」であることをサービス層で検証する
  return ok(await createApplication(ctx, input), 201);
});
