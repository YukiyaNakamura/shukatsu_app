import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationDetail } from "@/components/applications/application-detail";
import { requireOrgAdmin, getDataContext } from "@/lib/auth/session";
import { getApplicationDetail } from "@/lib/data/applications";
import { ApiError } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";

export const metadata: Metadata = { title: "応募詳細" };

export default async function AdminApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrgAdmin();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const detail = await getApplicationDetail(await getDataContext(), id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return (
    <ApplicationDetail
      initialApplication={detail.application}
      initialSteps={detail.steps}
      backHref={`/admin/students/${detail.student.id}`}
      backLabel={`${detail.student.name ?? "学生"}さんの応募一覧`}
      studentLabel={`${detail.student.name ?? ""}（${detail.student.university ?? ""}）`}
    />
  );
}
