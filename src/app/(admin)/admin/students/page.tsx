import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/page-header";
import { StudentsTable } from "@/components/organization/students-table";
import { requireOrgAdmin, getDataContext } from "@/lib/auth/session";
import { listOrgStudents } from "@/lib/data/organization";

export const metadata: Metadata = { title: "学生一覧" };

export default async function AdminStudentsPage() {
  await requireOrgAdmin();
  const students = await listOrgStudents(await getDataContext());
  return (
    <>
      <PageHeader title="学生一覧" description="組織に所属している学生と応募状況です。" />
      <StudentsTable students={students} />
    </>
  );
}
