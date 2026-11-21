import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { ApiError, unwrap } from "@/lib/api/errors";
import { createInvitationSchema } from "@/lib/validations/organization";
import { listInvitations } from "@/lib/data/organization";
import { requireOrgMembership } from "../_context";

/** GET /api/v1/organizations/invitations */
export const GET = withAuth(async ({ supabase, user }) => {
  const member = await requireOrgMembership(supabase, user.id);
  return ok(await listInvitations(supabase, member.organization_id));
});

/** POST /api/v1/organizations/invitations — 招待リンク発行 (7日間有効・1回限り) */
export const POST = withAuth(async ({ request, supabase, user }) => {
  await requireOrgMembership(supabase, user.id);
  const input = await parseBody(request, createInvitationSchema);
  const rows = unwrap(await supabase.rpc("create_invitation", { p_email: input.email, p_role: input.role }));
  const row = rows[0];
  if (!row) throw new ApiError(500, "INTERNAL_ERROR", "招待リンクを作成できませんでした。");
  // 平文トークンはこのレスポンスでのみ返す (DB にはハッシュのみ保存)
  return ok(
    { id: row.invitation_id, url: `${request.nextUrl.origin}/invite/${row.token}`, expiresAt: row.expires_at, email: input.email, role: input.role },
    201,
  );
});
