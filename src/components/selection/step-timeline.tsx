"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, Clock, Flag, Link2, Loader2, MapPin, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ClientApiError, errorMessage } from "@/lib/api-client";
import { STEP_RESULT_LABELS, STEP_RESULTS, STEP_STATUS_LABELS, STEP_STATUSES, STEP_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";
import type { SelectionStepRow, StepResult, StepStatus } from "@/types/database";
import { StepDialog, type StepFormValues } from "./step-dialog";

const RESULT_STYLE: Record<StepResult, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  PASSED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-rose-200 bg-rose-50 text-rose-700",
};

type Props = {
  applicationId: string;
  steps: SelectionStepRow[];
  currentStepId: string | null;
  disabled?: boolean;
  onStepsChange: (steps: SelectionStepRow[]) => void;
  onSetCurrent: (stepId: string) => Promise<void>;
};

export function StepTimeline({ applicationId, steps, currentStepId, disabled, onStepsChange, onSetCurrent }: Props) {
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; step: SelectionStepRow } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const replaceStep = (step: SelectionStepRow) => onStepsChange(steps.map((s) => (s.id === step.id ? step : s)));

  async function quickUpdate(step: SelectionStepRow, changes: { status?: StepStatus; result?: StepResult | null }) {
    setBusy(step.id);
    try {
      replaceStep(await api<SelectionStepRow>(`/api/v1/steps/${step.id}`, { method: "PATCH", body: { expectedVersion: step.version, changes } }));
    } catch (error) {
      if (error instanceof ClientApiError && error.isConflict) {
        const current = (error.details as { current?: SelectionStepRow } | undefined)?.current;
        if (current) replaceStep(current);
        toast.error("ほかのユーザーがこのステップを更新したため、最新の内容を表示しました。もう一度操作してください。");
      } else toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const order = [...steps];
    [order[index], order[target]] = [order[target], order[index]];
    onStepsChange(order);
    try {
      onStepsChange(
        await api<SelectionStepRow[]>(`/api/v1/applications/${applicationId}/steps/order`, {
          method: "PUT",
          body: { stepIds: order.map((s) => s.id) },
        }),
      );
    } catch (error) {
      onStepsChange(steps);
      toast.error(errorMessage(error));
    }
  }

  async function remove(step: SelectionStepRow) {
    if (!window.confirm(`「${step.display_name}」を削除しますか？`)) return;
    setBusy(step.id);
    try {
      await api(`/api/v1/steps/${step.id}`, { method: "DELETE" });
      onStepsChange(steps.filter((s) => s.id !== step.id));
      toast.success("ステップを削除しました");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function submit(values: StepFormValues, step?: SelectionStepRow): Promise<SelectionStepRow | "conflict"> {
    if (!step) {
      const created = await api<SelectionStepRow>(`/api/v1/applications/${applicationId}/steps`, { method: "POST", body: values });
      onStepsChange([...steps, created]);
      toast.success("ステップを追加しました");
      return created;
    }
    try {
      const updated = await api<SelectionStepRow>(`/api/v1/steps/${step.id}`, {
        method: "PATCH",
        body: { expectedVersion: step.version, changes: values },
      });
      replaceStep(updated);
      toast.success("ステップを保存しました");
      return updated;
    } catch (error) {
      if (error instanceof ClientApiError && error.isConflict) {
        const current = (error.details as { current?: SelectionStepRow } | undefined)?.current;
        if (current) {
          replaceStep(current);
          setDialog({ mode: "edit", step: current });
        }
        return "conflict";
      }
      throw error;
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">選考タイムライン</CardTitle>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => setDialog({ mode: "create" })}>
          <Plus />
          ステップを追加
        </Button>
      </CardHeader>
      <CardContent>
        {steps.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">選考ステップがありません。「ステップを追加」から登録してください。</p>
        ) : (
          <ol className="relative grid gap-3">
            {steps.map((step, i) => {
              const current = step.id === currentStepId;
              return (
                <li key={step.id} className="relative pl-7">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-[7px] top-0 h-full w-px bg-border",
                      i === steps.length - 1 && "h-4",
                    )}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-3 size-[15px] rounded-full border-2 bg-background",
                      current ? "border-primary bg-primary" : step.status === "COMPLETED" ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/40",
                    )}
                  />
                  <div className={cn("rounded-lg border p-3", current && "border-primary/50 bg-primary/[0.03] shadow-sm")}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{step.display_name}</span>
                          {current && <Badge className="h-5 px-1.5 text-[10px]">現在</Badge>}
                          {step.display_name !== STEP_TYPE_LABELS[step.step_type] && (
                            <span className="text-xs text-muted-foreground">{STEP_TYPE_LABELS[step.step_type]}</span>
                          )}
                        </div>
                        <div className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                          {step.scheduled_at && (
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock className="size-3" />
                              実施 {formatDateTime(step.scheduled_at)}
                            </span>
                          )}
                          {step.deadline_at && (
                            <span className="inline-flex items-center gap-1 text-rose-700">
                              <Clock className="size-3" />
                              期限 {formatDateTime(step.deadline_at)}
                            </span>
                          )}
                          {step.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" />
                              {step.location}
                            </span>
                          )}
                          {step.meeting_url && (
                            <a href={step.meeting_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                              <Link2 className="size-3" />
                              オンライン会議URL
                            </a>
                          )}
                          {step.notes && <p className="mt-1 whitespace-pre-wrap text-foreground/80">{step.notes}</p>}
                        </div>
                      </div>
                      {busy === step.id && <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" />}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7" disabled={disabled} aria-label={`${step.display_name} の操作`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ mode: "edit", step })}>
                            <Pencil />
                            編集
                          </DropdownMenuItem>
                          {!current && (
                            <DropdownMenuItem onSelect={() => void onSetCurrent(step.id)}>
                              <Flag />
                              現在の段階にする
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem disabled={i === 0} onSelect={() => void move(i, -1)}>
                            <ArrowUp />
                            上へ移動
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={i === steps.length - 1} onSelect={() => void move(i, 1)}>
                            <ArrowDown />
                            下へ移動
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => void remove(step)}>
                            <Trash2 />
                            削除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Select value={step.status} disabled={disabled || busy === step.id} onValueChange={(v) => void quickUpdate(step, { status: v as StepStatus })}>
                        <SelectTrigger size="sm" className="w-full" aria-label={`${step.display_name} の実施状態`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STEP_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {STEP_STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={step.result ?? "none"}
                        disabled={disabled || busy === step.id}
                        onValueChange={(v) => void quickUpdate(step, { result: v === "none" ? null : (v as StepResult) })}
                      >
                        <SelectTrigger
                          size="sm"
                          className={cn("w-full", step.result && RESULT_STYLE[step.result])}
                          aria-label={`${step.display_name} の選考結果`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">結果: 未定</SelectItem>
                          {STEP_RESULTS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {STEP_RESULT_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
      {dialog && (
        <StepDialog
          key={dialog.mode === "edit" ? dialog.step.id : "create"}
          open
          step={dialog.mode === "edit" ? dialog.step : undefined}
          onOpenChange={(open) => !open && setDialog(null)}
          onSubmit={async (values) => {
            const result = await submit(values, dialog.mode === "edit" ? dialog.step : undefined);
            if (result !== "conflict") setDialog(null);
            return result;
          }}
        />
      )}
    </Card>
  );
}
