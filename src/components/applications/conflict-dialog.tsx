"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { applicationStatusLabel, SELECTION_TYPE_LABELS, STEP_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils/datetime";
import type { Row, SaveState } from "./use-application-rows";

type Conflict = Extract<SaveState, { status: "conflict" }>;

function describe(change: Conflict["change"], latest: Row | null) {
  if (change.kind === "stage") {
    return [{ label: "現在の選考段階", mine: STEP_TYPE_LABELS[change.stepType], theirs: latest?.current_step_name ?? "—" }];
  }
  const type = change.changes.selectionType ?? latest?.selection_type ?? "FULL_TIME";
  const items: { label: string; mine: string; theirs: string }[] = [];
  if (change.changes.companyName !== undefined)
    items.push({ label: "企業名", mine: change.changes.companyName, theirs: latest?.company_name ?? "—" });
  if (change.changes.selectionType !== undefined)
    items.push({
      label: "選考区分",
      mine: SELECTION_TYPE_LABELS[change.changes.selectionType],
      theirs: latest ? SELECTION_TYPE_LABELS[latest.selection_type] : "—",
    });
  if (change.changes.status !== undefined)
    items.push({
      label: "応募状況",
      mine: applicationStatusLabel(change.changes.status, type),
      theirs: latest ? applicationStatusLabel(latest.status, latest.selection_type) : "—",
    });
  return items;
}

/** 同時編集の競合。入力内容は保持したまま、最新内容を確認してどちらを採用するか選ぶ */
export function ConflictDialog({
  open,
  row,
  state,
  onDiscard,
  onOverwrite,
}: {
  open: boolean;
  row: Row | null;
  state: Conflict;
  onDiscard: () => void;
  onOverwrite: () => void;
}) {
  const items = describe(state.change, state.latest);
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ほかのユーザーが先に更新しました</AlertDialogTitle>
          <AlertDialogDescription>
            「{row?.company_name}」は、あなたが編集している間に別の人 (学生本人または管理者) によって更新されました
            {state.latest ? ` (${formatDateTime(state.latest.updated_at)})` : ""}。どちらの内容を残すか選んでください。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="overflow-hidden rounded-md border text-sm">
          <div className="grid grid-cols-[6rem_1fr_1fr] bg-muted/50 text-xs text-muted-foreground [&>div]:px-3 [&>div]:py-1.5">
            <div>項目</div>
            <div>あなたの入力</div>
            <div>最新の内容</div>
          </div>
          {items.map((i) => (
            <div key={i.label} className="grid grid-cols-[6rem_1fr_1fr] border-t [&>div]:px-3 [&>div]:py-2">
              <div className="text-muted-foreground">{i.label}</div>
              <div className="font-medium">{i.mine}</div>
              <div>{i.theirs}</div>
            </div>
          ))}
        </div>
        {!state.latest && <p className="text-xs text-destructive">最新の内容を取得できませんでした。通信状況を確認してください。</p>}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDiscard}>最新の内容を表示</AlertDialogCancel>
          <AlertDialogAction onClick={onOverwrite}>自分の入力で上書き</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
