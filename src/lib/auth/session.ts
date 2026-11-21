import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationMemberRow, ProfileRow } from "@/types/database";

export type SessionUser = {
  id: string;
  email: string;
  profile: ProfileRow;
};

/** 現在のユーザー (JWT 検証済み) とプロフィール。1 リクエスト内でキャッシュ */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", sub).maybeSingle();
  if (!profile) return null;
  return { id: sub, email: typeof data.claims.email === "string" ? data.claims.email : "", profile };
});

export function homePathFor(role: ProfileRow["role"]) {
  return role === "ADMIN" ? "/admin/dashboard" : "/student/dashboard";
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireStudent(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.profile.role !== "STUDENT") redirect(homePathFor(user.profile.role));
  return user;
}

export type AdminContext = SessionUser & {
  membership: (Pick<OrganizationMemberRow, "id" | "role" | "organization_id"> & { organization_name: string }) | null;
};

/** 管理者アカウントと所属組織 */
export const getAdminContext = cache(async (): Promise<AdminContext> => {
  const user = await requireUser();
  if (user.profile.role !== "ADMIN") redirect(homePathFor(user.profile.role));
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("id, role, organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return { ...user, membership: null };
  const { data: org } = await supabase.from("organizations").select("id, name").eq("id", member.organization_id).maybeSingle();
  return { ...user, membership: { ...member, organization_name: org?.name ?? "" } };
});

/** 組織に所属している管理者のみ。未所属なら組織作成画面へ */
export async function requireOrgAdmin() {
  const ctx = await getAdminContext();
  if (!ctx.membership) redirect("/admin/organization");
  return ctx as AdminContext & { membership: NonNullable<AdminContext["membership"]> };
}
