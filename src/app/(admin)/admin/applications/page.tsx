import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/page-header";
import { ApplicationSheet } from "@/components/applications/application-sheet";
import { requireOrgAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listApplications } from "@/lib/data/applications";

export const metadata: Metadata = { title: "応募管理" };

export default async function AdminApplicationsPage() {
  await requireOrgAdmin();
  const rows = await listApplications(await createClient(), { includeDeleted: true });
  return (
    <>
      <PageHeader title="応募管理" description="所属学生全員の応募です。新しい応募は学生詳細から代理登録できます。" />
      <ApplicationSheet initialRows={rows} detailBasePath="/admin/applications" allowCreate={false} showStudent studentBasePath="/admin/students" />
    </>
  );
}
