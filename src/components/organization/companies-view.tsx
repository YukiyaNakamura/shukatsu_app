"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { SelectionTypeBadge, StatusBadge } from "@/components/applications/badges";
import type { ApplicationOverviewRow } from "@/types/database";

type Group = { key: string; name: string; rows: ApplicationOverviewRow[] };

export function CompaniesView({ groups }: { groups: Group[] }) {
  const [q, setQ] = useState("");
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? groups.filter((g) => g.name.toLowerCase().includes(s) || g.key.includes(s)) : groups;
  }, [groups, q]);

  if (groups.length === 0) return <EmptyState icon={Building2} title="まだ応募がありません" />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="企業名で検索" aria-label="企業名で検索" className="pl-8" />
        </div>
        <p className="text-xs text-muted-foreground">
          企業名は全角/半角・空白・「株式会社」などの表記ゆれを簡易的にそろえて集計しています。
        </p>
      </div>
      {visible.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-lg border">
          <header className="flex items-center justify-between gap-2 bg-muted/50 px-3 py-2">
            <h2 className="truncate text-sm font-semibold">{g.name}</h2>
            <span className="shrink-0 text-xs text-muted-foreground">{new Set(g.rows.map((r) => r.student_id)).size}名 / {g.rows.length}件</span>
          </header>
          <ul className="divide-y">
            {g.rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/applications/${r.id}`} className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 sm:grid-cols-[12rem_8rem_1fr_auto]">
                  <span className="truncate font-medium">{r.student_name}</span>
                  <SelectionTypeBadge type={r.selection_type} early={r.is_early_selection} className="justify-self-end sm:justify-self-start" />
                  <span className="truncate text-muted-foreground">{r.current_step_name ?? "段階未設定"}</span>
                  <StatusBadge status={r.status} type={r.selection_type} className="justify-self-end" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {visible.length === 0 && <p className="text-sm text-muted-foreground">条件に一致する企業がありません。</p>}
    </div>
  );
}
