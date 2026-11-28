import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { createInvitationSchema } from "@/lib/validations/organization";
import { createInvitation, listInvitations } from "@/lib/data/organization";
import { requireOrgMembership } from "@/lib/server/access";

/** GET /api/v1/organizations/invitations */
export const GET = withAuth(async ({ ctx }) => {
  const member = await requireOrgMembership(ctx);
  return ok(await listInvitations(ctx, member.organization_id));
});

/** POST /api/v1/organizations/invitations — 招待リンク発行 (7日間有効・1回限り) */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseBody(request, createInvitationSchema);
  const row = await createInvitation(ctx, { email: input.email, role: input.role });
  // 平文トークンはこのレスポンスでのみ返す (DB にはハッシュのみ保存)
  return ok(
    { id: row.invitation_id, url: `${request.nextUrl.origin}/invite/${row.token}`, expiresAt: row.expires_at, email: input.email, role: input.role },
    201,
  );
});
