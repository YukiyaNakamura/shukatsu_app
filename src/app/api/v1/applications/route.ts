import { ok, parseBody, parseQuery, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";
import { listApplications } from "@/lib/data/applications";
import { createApplicationSchema, listApplicationsQuerySchema } from "@/lib/validations/application";

/** GET /api/v1/applications — 応募一覧 (本人分 / 管理者は自組織学生分。RLS で制限) */
export const GET = withAuth(async ({ request, supabase }) => {
  const filters = parseQuery(request, listApplicationsQuerySchema);
  return ok(await listApplications(supabase, filters));
});

/** POST /api/v1/applications — 応募作成 (テンプレートから初期ステップを生成) */
export const POST = withAuth(async ({ request, supabase, user }) => {
  const input = await parseBody(request, createApplicationSchema);
  const app = unwrap(
    await supabase.rpc("create_application", {
      // 代理登録の studentId は RLS (can_access_student) で検証される
      p_student_id: input.studentId ?? user.id,
      p_company_name: input.companyName,
      p_selection_type: input.selectionType,
      p_is_early_selection: input.selectionType === "FULL_TIME" ? input.isEarlySelection : false,
      p_job_title: input.jobTitle ?? null,
      p_status: input.status ?? "PLANNED",
      p_use_template: input.useTemplate,
    }),
  );
  const overview = unwrap(await supabase.from("application_overview").select("*").eq("id", app.id).single());
  return ok(overview, 201);
});
