"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api-client";
import { fromJstInputValue, toJstInputValue } from "@/lib/utils/datetime";
import type { CalendarItemRow } from "@/types/database";
import type { CalendarApplication, CalendarStudent } from "./calendar-view";

export type EventTarget = { mode: "create"; date: string } | { mode: "edit"; eventId: string; item: CalendarItemRow };

const NONE = "none";

export function EventDialog({
  target,
  students,
  applications,
  onClose,
  onSaved,
}: {
  target: EventTarget;
  students?: CalendarStudent[];
  applications: CalendarApplication[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = target.mode === "edit" ? target.item : null;
  const [studentId, setStudentId] = useState(editing?.student_id ?? students?.[0]?.id ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [startsAt, setStartsAt] = useState(editing ? toJstInputValue(editing.starts_at) : target.mode === "create" ? `${target.date}T10:00` : "");
  const [endsAt, setEndsAt] = useState(editing ? toJstInputValue(editing.ends_at) : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [applicationId, setApplicationId] = useState(editing?.application_id ?? NONE);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const appOptions = students ? applications.filter((a) => a.student_id === studentId) : applications;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("タイトルを入力してください");
    const starts = fromJstInputValue(startsAt);
    if (!starts) return setError("開始日時を入力してください");
    const ends = fromJstInputValue(endsAt);
    if (ends && new Date(ends) < new Date(starts)) return setError("終了日時は開始日時より後にしてください");
    setPending(true);
    setError("");
    const body = {
      title: title.trim(),
      startsAt: starts,
      endsAt: ends,
      description: description.trim() || null,
      applicationId: applicationId === NONE ? null : applicationId,
    };
    try {
      if (editing) {
        await api(`/api/v1/events/${editing.source_id}`, { method: "PATCH", body });
        toast.success("予定を保存しました");
      } else {
        await api("/api/v1/events", { method: "POST", body: { ...body, studentId: students ? studentId : undefined } });
        toast.success("予定を追加しました");
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  async function remove() {
    if (!editing || !window.confirm("この予定を削除しますか？")) return;
    setPending(true);
    try {
      await api(`/api/v1/events/${editing.source_id}`, { method: "DELETE" });
      toast.success("予定を削除しました");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "予定を編集" : "予定を追加"}</DialogTitle>
          <DialogDescription>説明会・OB訪問など、選考ステップ以外の予定を登録できます。日時は日本時間です。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          {students && !editing && (
            <div className="grid gap-1.5">
              <Label>学生</Label>
              <Select
                value={studentId}
                onValueChange={(v) => {
                  setStudentId(v);
                  setApplicationId(NONE);
                }}
              >
                <SelectTrigger className="w-full" aria-label="学生">
                  <SelectValue placeholder="学生を選択" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="event-title">タイトル</Label>
            <Input id="event-title" value={title} maxLength={200} autoFocus placeholder="例: 会社説明会" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="event-start">開始</Label>
              <Input id="event-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="event-end">終了 (任意)</Label>
              <Input id="event-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>関連する応募 (任意)</Label>
            <Select value={applicationId} onValueChange={setApplicationId}>
              <SelectTrigger className="w-full" aria-label="関連する応募">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>なし</SelectItem>
                {appOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="event-desc">メモ</Label>
            <Textarea id="event-desc" rows={3} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>
                <Trash2 />
                削除
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                キャンセル
              </Button>
              <Button type="submit" disabled={pending || (students && !studentId)}>
                {pending && <Loader2 className="animate-spin" />}
                保存
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
