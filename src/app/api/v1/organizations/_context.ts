import "server-only";
import { ApiError, unwrap } from "@/lib/api/errors";
import type { ServerSupabase } from "@/lib/supabase/server";

/** API 用: ログイン中の管理者の所属組織 (無ければ 403) */
export async function requireOrgMembership(supabase: ServerSupabase, userId: string) {
  const member = unwrap(
    await supabase.from("organization_members").select("id, organization_id, role").eq("user_id", userId).maybeSingle(),
  );
  if (!member) throw new ApiError(403, "NOT_ORG_ADMIN", "組織の管理者ではありません。");
  return member;
}
