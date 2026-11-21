"use client";

import { useEffect, useState } from "react";
import { History, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { api, errorMessage } from "@/lib/api-client";
import {
  applicationStatusLabel,
  SELECTION_TYPE_LABELS,
  STEP_RESULT_LABELS,
  STEP_STATUS_LABELS,
  STEP_TYPE_LABELS,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils/datetime";
import type { Json, SelectionStepRow } from "@/types/database";

type Entry = {
  id: number;
  actor_name: string;
  actor_role: "STUDENT" | "ADMIN" | null;
  target_type: string;
  target_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_values: Json | null;
  new_values: Json | null;
  created_at: string;
};

const FIELD_LABELS: Record<string, string> = {
  company_name: "企業名",
  selection_type: "選考区分",
  is_early_selection: "早期選考",
  job_title: "職種・コース",
  applied_at: "応募日",
  company_url: "企業URL",
  priority: "志望度",
  application_source: "応募経路",
  status: "状態",
  current_step_id: "現在の選考段階",
  memo: "共有メモ",
  deleted_at: "削除",
  step_type: "ステップ種類",
  display_name: "表示名",
  position: "並び順",
  result: "選考結果",
  scheduled_at: "実施日時",
  deadline_at: "提出期限",
  location: "実施場所",
  meeting_url: "会議URL",
  notes: "メモ",
};

function formatValue(key: string, value: Json | undefined, targetType: string, steps: Map<string, string>): string {
  if (value === null || value === undefined || value === "") return "（なし）";
  const v = String(value);
  switch (key) {
    case "selection_type":
      return SELECTION_TYPE_LABELS[v as keyof typeof SELECTION_TYPE_LABELS] ?? v;
    case "status":
      return targetType === "selection_steps"
        ? (STEP_STATUS_LABELS[v as keyof typeof STEP_STATUS_LABELS] ?? v)
        : applicationStatusLabel(v as never, "FULL_TIME");
    case "result":
      return STEP_RESULT_LABELS[v as keyof typeof STEP_RESULT_LABELS] ?? v;
    case "step_type":
      return STEP_TYPE_LABELS[v as keyof typeof STEP_TYPE_LABELS] ?? v;
    case "is_early_selection":
      return value ? "あり" : "なし";
    case "current_step_id":
      return steps.get(v) ?? "削除されたステップ";
    case "scheduled_at":
    case "deadline_at":
      return formatDateTime(v);
    case "applied_at":
      return formatDate(v);
    case "deleted_at":
      return "削除済み";
    case "memo":
    case "notes":
      return v.length > 60 ? `${v.slice(0, 60)}…` : v;
    default:
      return v;
  }
}

function summary(e: Entry): string {
  const obj = (e.new_values ?? e.old_values ?? {}) as Record<string, Json>;
  if (e.target_type === "applications") {
    if (e.action === "INSERT") return "応募を作成";
    const nv = (e.new_values ?? {}) as Record<string, Json>;
    if ("deleted_at" in nv) return nv.deleted_at ? "応募を削除" : "応募を復元";
    return "応募を更新";
  }
  if (e.target_type === "selection_steps") {
    const name = obj.display_name ? `「${obj.display_name}」` : "";
    if (e.action === "INSERT") return `ステップ${name}を追加`;
    if (e.action === "DELETE") return `ステップ${name}を削除`;
    return "ステップを更新";
  }
  if (e.target_type === "events") return e.action === "INSERT" ? "予定を追加" : e.action === "DELETE" ? "予定を削除" : "予定を更新";
  return "更新";
}

export function HistoryList({ applicationId, refreshKey, steps }: { applicationId: string; refreshKey: number; steps: SelectionStepRow[] }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const stepNames = new Map(steps.map((s) => [s.id, s.display_name]));

  useEffect(() => {
    const controller = new AbortController();
    api<Entry[]>(`/api/v1/applications/${applicationId}/history`, { signal: controller.signal })
      .then((data) => {
        setEntries(data);
        setError("");
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [applicationId, refreshKey, reload]);

  if (error)
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        {error}
        <Button variant="outline" size="sm" onClick={() => setReload((r) => r + 1)}>
          <RotateCw />
          再読み込み
        </Button>
      </div>
    );
  if (!entries)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        読み込み中…
      </div>
    );
  if (entries.length === 0) return <EmptyState icon={History} title="変更履歴はまだありません" />;

  return (
    <ol className="grid gap-0 rounded-lg border">
      {entries.map((e) => {
        const nv = (e.new_values ?? {}) as Record<string, Json>;
        const ov = (e.old_values ?? {}) as Record<string, Json>;
        const changedKeys = e.action === "UPDATE" ? Object.keys(nv).filter((k) => k in FIELD_LABELS && k !== "deleted_at") : [];
        return (
          <li key={e.id} className="grid gap-1 border-b px-4 py-3 text-sm last:border-b-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{summary(e)}</span>
              <span className="text-xs text-muted-foreground">
                {e.actor_name}
                {e.actor_role === "ADMIN" ? "（管理者）" : ""} ・ {formatDateTime(e.created_at)}
              </span>
            </div>
            {changedKeys.length > 0 && (
              <ul className="grid gap-0.5 text-xs text-muted-foreground">
                {changedKeys.map((k) => (
                  <li key={k}>
                    {FIELD_LABELS[k]}: <span className="line-through">{formatValue(k, ov[k], e.target_type, stepNames)}</span> →{" "}
                    <span className="text-foreground">{formatValue(k, nv[k], e.target_type, stepNames)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
