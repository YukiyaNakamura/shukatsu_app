import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMyOrgMembership } from "@/lib/server/access";
import type { DataContext } from "@/lib/server/context";
import { getDb } from "@/lib/server/env";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { OrganizationMemberRow, ProfileRow } from "@/types/database";
import { getAuth } from "./server";

export type SessionUser = {
  id: string;
  email: string;
  profile: ProfileRow;
};

/** Better Auth のセッションのユーザー → アプリのプロフィール */
export function toSessionUser(u: {
  id: string;
  email: string;
  name: string;
  role?: unknown;
  universityName?: unknown;
  createdAt: Date;
  updatedAt: Date;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    profile: {
      id: u.id,
      role: u.role === "ADMIN" ? "ADMIN" : "STUDENT",
      full_name: u.name,
      university_name: typeof u.universityName === "string" ? u.universityName : null,
      created_at: u.createdAt.toISOString(),
      updated_at: u.updatedAt.toISOString(),
    },
  };
}

/** 現在のユーザー (サーバー側で DB のセッションを検証済み)。1 リクエスト内でキャッシュ */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? toSessionUser(session.user) : null;
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

/** ページ (Server Component) 用: ログイン中のユーザーの権限で動くデータアクセスのコンテキスト */
export const getDataContext = cache(async (): Promise<DataContext> => {
  const user = await requireUser();
  return { db: await getDb(), actor: { id: user.id, role: user.profile.role, email: user.email } };
});

export type AdminContext = SessionUser & {
  membership: (Pick<OrganizationMemberRow, "id" | "role" | "organization_id"> & { organization_name: string }) | null;
};

/** 管理者アカウントと所属組織 */
export const getAdminContext = cache(async (): Promise<AdminContext> => {
  const user = await requireUser();
  if (user.profile.role !== "ADMIN") redirect(homePathFor(user.profile.role));
  const ctx = await getDataContext();
  const member = await getMyOrgMembership(ctx);
  if (!member) return { ...user, membership: null };
  const org = await ctx.db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, member.organization_id)).get();
  return { ...user, membership: { ...member, organization_name: org?.name ?? "" } };
});

/** 組織に所属している管理者のみ。未所属なら組織作成画面へ */
export async function requireOrgAdmin() {
  const ctx = await getAdminContext();
  if (!ctx.membership) redirect("/admin/organization");
  return ctx as AdminContext & { membership: NonNullable<AdminContext["membership"]> };
}
