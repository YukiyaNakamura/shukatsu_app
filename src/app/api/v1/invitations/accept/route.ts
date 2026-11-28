import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { acceptInvitationSchema } from "@/lib/validations/organization";
import { acceptInvitation } from "@/lib/data/organization";

/** POST /api/v1/invitations/accept — 招待の受諾 (学生は共有同意が必須) */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseBody(request, acceptInvitationSchema);
  const organizationId = await acceptInvitation(ctx, input.token, input.consentVersion ?? null);
  return ok({ organizationId });
});
