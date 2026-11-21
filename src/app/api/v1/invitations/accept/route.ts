import { ok, parseBody, withAuth } from "@/lib/api/handler";
import { unwrap } from "@/lib/api/errors";
import { acceptInvitationSchema } from "@/lib/validations/organization";

/** POST /api/v1/invitations/accept — 招待の受諾 (学生は共有同意が必須) */
export const POST = withAuth(async ({ request, supabase }) => {
  const input = await parseBody(request, acceptInvitationSchema);
  const organizationId = unwrap(
    await supabase.rpc("accept_invitation", { p_token: input.token, p_consent_version: input.consentVersion ?? null }),
  );
  return ok({ organizationId });
});
