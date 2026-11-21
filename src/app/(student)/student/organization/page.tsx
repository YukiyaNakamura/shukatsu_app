import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/page-header";
import { StudentOrganization } from "@/components/organization/student-organization";
import { requireStudent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getStudentMembership } from "@/lib/data/organization";

export const metadata: Metadata = { title: "所属組織" };

export default async function StudentOrganizationPage() {
  const user = await requireStudent();
  const data = await getStudentMembership(await createClient(), user.id);
  return (
    <>
      <PageHeader title="所属組織" />
      <StudentOrganization
        membership={data.membership}
        organizationName={data.organization?.name ?? null}
        admins={data.admins}
        pendingRequest={data.pendingRequest}
      />
    </>
  );
}
