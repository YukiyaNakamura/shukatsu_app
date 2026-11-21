import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/page-header";
import { CompaniesView } from "@/components/organization/companies-view";
import { requireOrgAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listApplications } from "@/lib/data/applications";
import type { ApplicationOverviewRow } from "@/types/database";

export const metadata: Metadata = { title: "企業別一覧" };

export default async function AdminCompaniesPage() {
  await requireOrgAdmin();
  const rows = await listApplications(await createClient());
  const map = new Map<string, ApplicationOverviewRow[]>();
  for (const r of rows) {
    const key = r.company_name_normalized || r.company_name;
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  const groups = [...map.entries()]
    .map(([key, items]) => {
      // 最も多く使われている表記を代表名にする
      const counts = new Map<string, number>();
      for (const i of items) counts.set(i.company_name, (counts.get(i.company_name) ?? 0) + 1);
      const name = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { key, name, rows: items.sort((a, b) => (a.student_name ?? "").localeCompare(b.student_name ?? "", "ja")) };
    })
    .sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name, "ja"));
  return (
    <>
      <PageHeader title="企業別一覧" description="同じ企業に応募している学生をまとめて確認できます。" />
      <CompaniesView groups={groups} />
    </>
  );
}
