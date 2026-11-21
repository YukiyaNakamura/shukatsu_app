import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { ApplicationSheet } from "@/components/applications/application-sheet";
import { requireOrgAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listApplications } from "@/lib/data/applications";
import { listOrgStudents } from "@/lib/data/organization";
import { uuidSchema } from "@/lib/validations/common";
import { formatDate } from "@/lib/utils/datetime";

export const metadata: Metadata = { title: "学生詳細" };

export default async function AdminStudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrgAdmin();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  // 自組織に現在所属している学生のみ (RLS でも保証)
  const student = (await listOrgStudents(supabase)).find((s) => s.student_id === id);
  if (!student) notFound();
  const rows = await listApplications(supabase, { studentId: id, includeDeleted: true });
  return (
    <>
      <PageHeader
        back={
          <Link href="/admin/students" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" />
            学生一覧
          </Link>
        }
        title={student.full_name}
        description={`${student.university_name} ・ ${formatDate(student.joined_at)} から所属 ・ 応募 ${student.application_count}件 / 選考中 ${student.in_progress_count}件 / 内定 ${student.accepted_count}件`}
      />
      <ApplicationSheet initialRows={rows} detailBasePath="/admin/applications" studentId={id} />
    </>
  );
}
