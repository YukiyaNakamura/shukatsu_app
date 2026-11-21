import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/page-header";
import {
  AdminsCard,
  CreateOrganizationForm,
  InvitationsCard,
  JoinCodeCard,
  JoinRequestsCard,
  StudentMembersCard,
} from "@/components/organization/admin-organization";
import { getAdminContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getOrganization,
  listInvitations,
  listOrgMembers,
  listOrgStudents,
  listPendingJoinRequests,
} from "@/lib/data/organization";

export const metadata: Metadata = { title: "組織管理" };

export default async function AdminOrganizationPage() {
  const ctx = await getAdminContext();
  if (!ctx.membership) {
    return (
      <>
        <PageHeader title="組織管理" description="まずは組織を作成しましょう。" />
        <CreateOrganizationForm />
      </>
    );
  }
  const orgId = ctx.membership.organization_id;
  const supabase = await createClient();
  const [org, admins, invitations, requests, students] = await Promise.all([
    getOrganization(supabase, orgId),
    listOrgMembers(supabase, orgId),
    listInvitations(supabase, orgId),
    listPendingJoinRequests(supabase, orgId),
    listOrgStudents(supabase),
  ]);
  const isOwner = ctx.membership.role === "OWNER";
  return (
    <>
      <PageHeader title={org.name} description={`組織管理 ・ あなたの権限: ${isOwner ? "オーナー" : "管理者"}`} />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="grid h-fit gap-5">
          <JoinRequestsCard requests={requests} />
          <InvitationsCard invitations={invitations} isOwner={isOwner} />
          <JoinCodeCard issuedAt={org.join_code_issued_at} />
        </div>
        <div className="grid h-fit gap-5">
          <StudentMembersCard students={students} />
          <AdminsCard admins={admins} currentUserId={ctx.id} isOwner={isOwner} />
        </div>
      </div>
    </>
  );
}
