import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationDetail } from "@/components/applications/application-detail";
import { requireStudent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getApplicationDetail } from "@/lib/data/applications";
import { ApiError } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";

export const metadata: Metadata = { title: "応募詳細" };

export default async function StudentApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStudent();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const detail = await getApplicationDetail(supabase, id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return (
    <ApplicationDetail
      initialApplication={detail.application}
      initialSteps={detail.steps}
      backHref="/student/applications"
      backLabel="応募管理"
    />
  );
}
