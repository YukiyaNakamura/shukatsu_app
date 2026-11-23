import { ok, withAuth } from "@/lib/api/handler";
import { listOrgStudents } from "@/lib/data/organization";
import { requireOrgMembership } from "@/lib/server/access";

/** GET /api/v1/organizations/students?q= — 所属学生と集計 (氏名・大学名で検索) */
export const GET = withAuth(async ({ request, ctx }) => {
  await requireOrgMembership(ctx);
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  const students = await listOrgStudents(ctx);
  return ok(
    q
      ? students.filter((s) => s.full_name.toLowerCase().includes(q) || (s.university_name ?? "").toLowerCase().includes(q))
      : students,
  );
});
