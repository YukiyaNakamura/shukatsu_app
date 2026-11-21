"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { formatDateTime, formatRelative } from "@/lib/utils/datetime";

type Student = {
  student_id: string;
  full_name: string;
  university_name: string | null;
  application_count: number;
  in_progress_count: number;
  accepted_count: number;
  last_updated_at: string | null;
};

export function StudentsTable({ students }: { students: Student[] }) {
  const [q, setQ] = useState("");
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? students.filter((x) => x.full_name.toLowerCase().includes(s) || (x.university_name ?? "").toLowerCase().includes(s)) : students;
  }, [q, students]);

  if (students.length === 0)
    return (
      <EmptyState
        icon={Users}
        title="所属学生はまだいません"
        description="組織管理から招待リンクまたは組織コードを発行して学生を招待しましょう。"
      />
    );

  return (
    <div className="grid gap-3">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="氏名・大学名で検索" aria-label="氏名・大学名で検索" className="pl-8" />
      </div>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr className="[&>th]:h-9 [&>th]:px-3 [&>th]:text-left [&>th]:font-medium">
              <th>学生氏名</th>
              <th>大学名</th>
              <th className="text-right">応募</th>
              <th className="text-right">選考中</th>
              <th className="text-right">内定</th>
              <th>最終更新</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.student_id} className="border-t hover:bg-muted/40 [&>td]:px-3 [&>td]:py-2">
                <td>
                  <Link href={`/admin/students/${s.student_id}`} className="font-medium underline-offset-4 hover:underline">
                    {s.full_name}
                  </Link>
                </td>
                <td className="text-muted-foreground">{s.university_name}</td>
                <td className="text-right tabular">{s.application_count}</td>
                <td className="text-right tabular">{s.in_progress_count}</td>
                <td className="text-right tabular">{s.accepted_count}</td>
                <td className="text-muted-foreground" title={formatDateTime(s.last_updated_at)}>
                  {formatRelative(s.last_updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-2 md:hidden">
        {visible.map((s) => (
          <li key={s.student_id}>
            <Link href={`/admin/students/${s.student_id}`} className="flex items-center gap-3 rounded-lg border p-3 active:bg-muted">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{s.university_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  応募 {s.application_count} ・ 選考中 {s.in_progress_count} ・ 内定 {s.accepted_count} ・ {formatRelative(s.last_updated_at)}
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p className="text-sm text-muted-foreground">条件に一致する学生がいません。</p>}
    </div>
  );
}
