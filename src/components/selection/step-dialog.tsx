"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-client";
import { STEP_RESULT_LABELS, STEP_RESULTS, STEP_STATUS_LABELS, STEP_STATUSES, STEP_TYPE_LABELS, STEP_TYPES } from "@/lib/constants";
import { fromJstInputValue, toJstInputValue } from "@/lib/utils/datetime";
import { createStepSchema } from "@/lib/validations/step";
import type { SelectionStepRow, StepResult, StepStatus, StepType } from "@/types/database";

export type StepFormValues = {
  stepType: StepType;
  displayName: string;
  status: StepStatus;
  result: StepResult | null;
  scheduledAt: string | null;
  deadlineAt: string | null;
  location: string | null;
  meetingUrl: string | null;
  notes: string | null;
};

type FormState = {
  stepType: StepType;
  displayName: string;
  status: StepStatus;
  result: StepResult | "none";
  scheduledAt: string;
  deadlineAt: string;
  location: string;
  meetingUrl: string;
  notes: string;
};

function toForm(step?: SelectionStepRow): FormState {
  return {
    stepType: step?.step_type ?? "FIRST_INTERVIEW",
    displayName: step?.display_name ?? STEP_TYPE_LABELS.FIRST_INTERVIEW,
    status: step?.status ?? "NOT_STARTED",
    result: step?.result ?? "none",
    scheduledAt: toJstInputValue(step?.scheduled_at),
    deadlineAt: toJstInputValue(step?.deadline_at),
    location: step?.location ?? "",
    meetingUrl: step?.meeting_url ?? "",
    notes: step?.notes ?? "",
  };
}

export function StepDialog({
  open,
  step,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  step?: SelectionStepRow;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: StepFormValues) => Promise<SelectionStepRow | "conflict">;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(step));
  const [nameTouched, setNameTouched] = useState(Boolean(step));
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const values: StepFormValues = {
      stepType: form.stepType,
      displayName: form.displayName.trim() || STEP_TYPE_LABELS[form.stepType],
      status: form.status,
      result: form.result === "none" ? null : form.result,
      scheduledAt: fromJstInputValue(form.scheduledAt),
      deadlineAt: fromJstInputValue(form.deadlineAt),
      location: form.location.trim() || null,
      meetingUrl: form.meetingUrl.trim() || null,
      notes: form.notes.trim() || null,
    };
    const parsed = createStepSchema.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    setPending(true);
    setError("");
    try {
      const result = await onSubmit(values);
      setConflict(result === "conflict");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{step ? "選考ステップを編集" : "選考ステップを追加"}</DialogTitle>
          <DialogDescription>日時は日本時間で入力してください。実施日時と提出期限はカレンダーに表示されます。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          {conflict && step && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900">
              <TriangleAlert />
              <AlertDescription>
                <p>ほかのユーザーがこのステップを更新しました。あなたの入力は保持されています。</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setForm(toForm(step));
                      setConflict(false);
                    }}
                  >
                    最新の内容を反映
                  </Button>
                  <Button type="submit" size="sm">
                    自分の入力で上書き保存
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>ステップ種類</Label>
              <Select
                value={form.stepType}
                onValueChange={(v) => {
                  set("stepType", v as StepType);
                  if (!nameTouched) set("displayName", STEP_TYPE_LABELS[v as StepType]);
                }}
              >
                <SelectTrigger className="w-full" aria-label="ステップ種類">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {STEP_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="displayName">表示名</Label>
              <Input
                id="displayName"
                value={form.displayName}
                maxLength={100}
                onChange={(e) => {
                  setNameTouched(true);
                  set("displayName", e.target.value);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>実施状態</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as StepStatus)}>
                <SelectTrigger className="w-full" aria-label="実施状態">
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
            </div>
            <div className="grid gap-1.5">
              <Label>選考結果</Label>
              <Select value={form.result} onValueChange={(v) => set("result", v as FormState["result"])}>
                <SelectTrigger className="w-full" aria-label="選考結果">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未定</SelectItem>
                  {STEP_RESULTS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {STEP_RESULT_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="scheduledAt">実施日時</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => {
                  set("scheduledAt", e.target.value);
                  if (e.target.value && form.status === "NOT_STARTED") set("status", "SCHEDULED");
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="deadlineAt">提出期限</Label>
              <Input id="deadlineAt" type="datetime-local" value={form.deadlineAt} onChange={(e) => set("deadlineAt", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="location">実施場所</Label>
            <Input id="location" value={form.location} maxLength={200} placeholder="例: 本社 5F / オンライン" onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="meetingUrl">オンライン会議URL</Label>
            <Input id="meetingUrl" type="url" inputMode="url" value={form.meetingUrl} placeholder="https://" onChange={(e) => set("meetingUrl", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes">メモ</Label>
            <Textarea id="notes" rows={3} value={form.notes} maxLength={5000} onChange={(e) => set("notes", e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {step ? "保存" : "追加"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
