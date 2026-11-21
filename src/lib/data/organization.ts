import "server-only";
import { unwrap } from "@/lib/api/errors";
import { STALE_STUDENT_DAYS } from "@/lib/constants";
import type { ServerSupabase } from "@/lib/supabase/server";

export async function listOrgStudents(supabase: ServerSupabase) {
  const rows = unwrap(await supabase.rpc("org_student_overview"));
  return rows.map((r) => ({
    ...r,
    application_count: Number(r.application_count),
    in_progress_count: Number(r.in_progress_count),
    accepted_count: Number(r.accepted_count),
  }));
}
export type OrgStudent = Awaited<ReturnType<typeof listOrgStudents>>[number];

export async function getOrgDashboard(supabase: ServerSupabase) {
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 86_400_000);
  const staleBefore = new Date(now.getTime() - STALE_STUDENT_DAYS * 86_400_000);

  const [students, inProgress, accepted, upcoming] = await Promise.all([
    listOrgStudents(supabase),
    supabase.from("application_overview").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "IN_PROGRESS"),
    supabase.from("application_overview").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "ACCEPTED"),
    supabase
      .from("calendar_items")
      .select("*")
      .gte("starts_at", now.toISOString())
      .lt("starts_at", in14.toISOString())
      .order("starts_at")
      .limit(30),
  ]);
  if (inProgress.error) unwrap(inProgress);
  if (accepted.error) unwrap(accepted);

  return {
    studentCount: students.length,
    inProgressCount: inProgress.count ?? 0,
    acceptedCount: accepted.count ?? 0,
    upcoming: unwrap(upcoming),
    staleStudents: students
      .filter((s) => !s.last_updated_at || new Date(s.last_updated_at) < staleBefore)
      .sort((a, b) => (a.last_updated_at ?? "").localeCompare(b.last_updated_at ?? "")),
    staleDays: STALE_STUDENT_DAYS,
  };
}

export async function listOrgMembers(supabase: ServerSupabase, organizationId: string) {
  const members = unwrap(
    await supabase.from("organization_members").select("*").eq("organization_id", organizationId).order("joined_at"),
  );
  const ids = members.map((m) => m.user_id);
  const profiles = ids.length ? unwrap(await supabase.from("profiles").select("id, full_name").in("id", ids)) : [];
  const names = new Map(profiles.map((p) => [p.id, p.full_name]));
  return members.map((m) => ({ ...m, full_name: names.get(m.user_id) ?? "—" }));
}

export async function listInvitations(supabase: ServerSupabase, organizationId: string) {
  return unwrap(
    await supabase
      .from("invitations")
      .select("id, organization_id, email, invitee_role, created_by, expires_at, used_at, used_by, revoked_at, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
  );
}

export async function listPendingJoinRequests(supabase: ServerSupabase, organizationId: string) {
  const requests = unwrap(
    await supabase
      .from("join_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "PENDING")
      .order("created_at"),
  );
  const ids = requests.map((r) => r.student_id);
  const profiles = ids.length
    ? unwrap(await supabase.from("profiles").select("id, full_name, university_name").in("id", ids))
    : [];
  const map = new Map(profiles.map((p) => [p.id, p]));
  return requests.map((r) => ({
    ...r,
    full_name: map.get(r.student_id)?.full_name ?? "—",
    university_name: map.get(r.student_id)?.university_name ?? "—",
  }));
}

export async function getOrganization(supabase: ServerSupabase, organizationId: string) {
  return unwrap(
    await supabase.from("organizations").select("id, name, created_by, join_code_issued_at, created_at").eq("id", organizationId).single(),
  );
}

/** 学生本人の所属状況 */
export async function getStudentMembership(supabase: ServerSupabase, studentId: string) {
  const [membership, pending] = await Promise.all([
    supabase.from("student_memberships").select("*").eq("student_id", studentId).eq("status", "ACTIVE").maybeSingle(),
    supabase.from("join_requests").select("*").eq("student_id", studentId).eq("status", "PENDING").maybeSingle(),
  ]);
  const active = unwrap(membership);
  const pendingRequest = unwrap(pending);
  const orgId = active?.organization_id ?? pendingRequest?.organization_id;
  const organization = orgId
    ? unwrap(await supabase.from("organizations").select("id, name").eq("id", orgId).maybeSingle())
    : null;
  let admins: { full_name: string; role: string }[] = [];
  if (active) {
    const members = await listOrgMembers(supabase, active.organization_id);
    admins = members.map((m) => ({ full_name: m.full_name, role: m.role }));
  }
  return { membership: active, organization, admins, pendingRequest };
}
