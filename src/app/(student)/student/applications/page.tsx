import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/page-header";
import { ApplicationSheet } from "@/components/applications/application-sheet";
import { requireStudent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listApplications } from "@/lib/data/applications";

export const metadata: Metadata = { title: "応募管理" };

export default async function StudentApplicationsPage() {
  const user = await requireStudent();
  const supabase = await createClient();
  const rows = await listApplications(supabase, { studentId: user.id, includeDeleted: true });
  return (
    <>
      <PageHeader title="応募管理" description="セルをクリックして直接編集できます。変更は自動で保存されます。" />
      <ApplicationSheet initialRows={rows} detailBasePath="/student/applications" />
    </>
  );
}
