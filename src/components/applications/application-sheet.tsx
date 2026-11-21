"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArchiveRestore,
  Check,
  ChevronRight,
  ExternalLink,
  FilterX,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Search,
  Table2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/common/empty-state";
import {
  APPLICATION_STATUSES,
  applicationStatusLabel,
  SELECTION_TYPE_LABELS,
  SELECTION_TYPES,
  STEP_TYPE_LABELS,
  STEP_TYPES,
} from "@/lib/constants";
import { errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, SelectionType, StepType } from "@/types/database";
import { SelectionTypeBadge, StatusBadge, STATUS_DOT } from "./badges";
import { ConflictDialog } from "./conflict-dialog";
import { CompanyNameCell, SelectCell } from "./sheet-cells";
import { useApplicationRows, type Row, type SaveState } from "./use-application-rows";

type Props = {
  initialRows: Row[];
  /** 詳細ページのベースパス (例: /student/applications) */
  detailBasePath: string;
  /** 新規作成時の対象学生 (管理者の代理登録)。未指定ならログインユーザー本人 */
  studentId?: string;
  allowCreate?: boolean;
  showStudent?: boolean;
  /** 学生名リンクのベースパス (管理者) */
  studentBasePath?: string;
};

const ALL = "ALL";

type Filters = {
  q: string;
  jobTitle: string;
  selectionType: SelectionType | typeof ALL;
  stepType: StepType | typeof ALL;
  status: ApplicationStatus | typeof ALL;
  showDeleted: boolean;
};
const EMPTY_FILTERS: Filters = { q: "", jobTitle: "", selectionType: ALL, stepType: ALL, status: ALL, showDeleted: false };

function statusOptions(type: SelectionType) {
  return APPLICATION_STATUSES.map((s) => ({
    value: s,
    label: applicationStatusLabel(s, type),
    node: (
      <span className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", STATUS_DOT[s])} />
        {applicationStatusLabel(s, type)}
      </span>
    ),
  }));
}
const TYPE_OPTIONS = SELECTION_TYPES.map((t) => ({ value: t, label: SELECTION_TYPE_LABELS[t] }));
const STEP_OPTIONS = STEP_TYPES.map((t) => ({ value: t, label: STEP_TYPE_LABELS[t] }));

export function ApplicationSheet({ initialRows, detailBasePath, studentId, allowCreate = true, showStudent, studentBasePath }: Props) {
  const { rows, saveStates, save, retry, discardMine, overwrite, create, remove, restore } = useApplicationRows(initialRows);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [drafting, setDrafting] = useState(false);

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const job = filters.jobTitle.trim().toLowerCase();
    return rows.filter((r) => {
      if (!filters.showDeleted && r.deleted_at) return false;
      if (q && !r.company_name.toLowerCase().includes(q)) return false;
      if (job && !(r.job_title ?? "").toLowerCase().includes(job)) return false;
      if (filters.selectionType !== ALL && r.selection_type !== filters.selectionType) return false;
      if (filters.stepType !== ALL && r.current_step_type !== filters.stepType) return false;
      if (filters.status !== ALL && r.status !== filters.status) return false;
      return true;
    });
  }, [rows, filters]);

  const activeCount = rows.filter((r) => !r.deleted_at).length;
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const conflictEntry = Object.entries(saveStates).find(([, s]) => s?.status === "conflict") as [string, Extract<SaveState, { status: "conflict" }>] | undefined;
  const savingCount = Object.values(saveStates).filter((s) => s?.status === "saving").length;
  const errorCount = Object.values(saveStates).filter((s) => s?.status === "error").length;

  return (
    <div className="grid gap-3">
      {/* ツールバー */}
      <div className="flex flex-wrap items-center gap-2">
        {allowCreate && (
          <Button onClick={() => setDrafting(true)} disabled={drafting}>
            <Plus />
            企業を追加
          </Button>
        )}
        <div className="relative min-w-40 flex-1 sm:max-w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="企業名で検索"
            aria-label="企業名で検索"
            className="pl-8"
          />
        </div>
        <Input
          value={filters.jobTitle}
          onChange={(e) => setFilters({ ...filters, jobTitle: e.target.value })}
          placeholder="職種"
          aria-label="職種で絞り込み"
          className="w-28"
        />
        <FilterSelect
          label="選考区分"
          value={filters.selectionType}
          onChange={(v) => setFilters({ ...filters, selectionType: v as Filters["selectionType"] })}
          options={TYPE_OPTIONS}
        />
        <FilterSelect
          label="選考段階"
          value={filters.stepType}
          onChange={(v) => setFilters({ ...filters, stepType: v as Filters["stepType"] })}
          options={STEP_OPTIONS}
        />
        <FilterSelect
          label="応募状況"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v as Filters["status"] })}
          options={APPLICATION_STATUSES.map((s) => ({ value: s, label: applicationStatusLabel(s, "FULL_TIME") }))}
        />
        <div className="flex items-center gap-2 px-1">
          <Switch
            id="show-deleted"
            checked={filters.showDeleted}
            onCheckedChange={(v) => setFilters({ ...filters, showDeleted: v })}
          />
          <Label htmlFor="show-deleted" className="text-xs font-normal text-muted-foreground">
            削除済み
          </Label>
        </div>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            <FilterX />
            クリア
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {savingCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              保存中…
            </span>
          ) : errorCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertCircle className="size-3" />
              {errorCount}件の保存に失敗
            </span>
          ) : (
            <span>
              {visible.length}
              {filtered ? ` / ${activeCount}` : ""} 件
            </span>
          )}
        </div>
      </div>

      {/* PC: スプレッドシート */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full min-w-[720px] border-collapse text-sm" data-grid role="grid" aria-label="応募管理シート">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr className="[&>th]:h-9 [&>th]:border-b [&>th]:px-3 [&>th]:text-left [&>th]:font-medium">
              {showStudent && <th className="w-40">学生</th>}
              <th>企業名</th>
              <th className="w-36">選考区分</th>
              <th className="w-52">現在の選考段階</th>
              <th className="w-36">応募状況</th>
              <th className="w-20 text-right">
                <span className="sr-only">保存状態・操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {drafting && (
              <DraftRow
                showStudent={showStudent}
                onCancel={() => setDrafting(false)}
                onCreate={async (input) => {
                  await create({ ...input, studentId });
                  setDrafting(false);
                  toast.success(`「${input.companyName}」を追加しました`);
                }}
              />
            )}
            {visible.map((row, r) => {
              const deleted = Boolean(row.deleted_at);
              const state = saveStates[row.id];
              let c = 0;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b last:border-b-0 [&>td]:px-1 [&>td]:py-0.5",
                    deleted && "bg-muted/40 text-muted-foreground",
                    state?.status === "error" && "bg-destructive/5",
                    state?.status === "conflict" && "bg-amber-50",
                  )}
                >
                  {showStudent && (
                    <td className="px-3">
                      <Link
                        href={`${studentBasePath}/${row.student_id}`}
                        className="block truncate px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {row.student_name ?? "—"}
                      </Link>
                    </td>
                  )}
                  <td>
                    <CompanyNameCell
                      cell={`${r}:${c++}`}
                      value={row.company_name}
                      href={`${detailBasePath}/${row.id}`}
                      disabled={deleted}
                      onCommit={(v) => save(row.id, { kind: "fields", changes: { companyName: v } })}
                      badge={row.job_title ? <span className="truncate text-xs text-muted-foreground">{row.job_title}</span> : undefined}
                    />
                  </td>
                  <td>
                    <SelectCell
                      cell={`${r}:${c++}`}
                      ariaLabel={`${row.company_name} の選考区分`}
                      value={row.selection_type}
                      disabled={deleted}
                      display={<SelectionTypeBadge type={row.selection_type} early={row.is_early_selection} />}
                      options={TYPE_OPTIONS}
                      onChange={(v) => save(row.id, { kind: "fields", changes: { selectionType: v } })}
                    />
                  </td>
                  <td>
                    <SelectCell
                      cell={`${r}:${c++}`}
                      ariaLabel={`${row.company_name} の現在の選考段階`}
                      value={row.current_step_type}
                      disabled={deleted}
                      display={row.current_step_name ?? undefined}
                      placeholder="未設定"
                      options={STEP_OPTIONS}
                      onChange={(v) => save(row.id, { kind: "stage", stepType: v })}
                    />
                  </td>
                  <td>
                    <SelectCell
                      cell={`${r}:${c++}`}
                      ariaLabel={`${row.company_name} の応募状況`}
                      value={row.status}
                      disabled={deleted}
                      display={<StatusBadge status={row.status} type={row.selection_type} />}
                      options={statusOptions(row.selection_type)}
                      onChange={(v) => save(row.id, { kind: "fields", changes: { status: v } })}
                    />
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-0.5 pr-1">
                      <SaveIndicator state={state} onRetry={() => retry(row.id)} />
                      <RowMenu
                        href={`${detailBasePath}/${row.id}`}
                        deleted={deleted}
                        onDelete={() => remove(row.id)}
                        onRestore={() => restore(row.id)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && !drafting && (
          <div className="p-6">
            <SheetEmpty filtered={filtered} allowCreate={allowCreate} onAdd={() => setDrafting(true)} onClear={() => setFilters(EMPTY_FILTERS)} />
          </div>
        )}
        <p className="border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          矢印キーでセル移動 ・ Enter で編集 / プルダウンを開く ・ Esc で取り消し ・ 変更は自動保存されます
        </p>
      </div>

      {/* スマートフォン: カード */}
      <div className="grid gap-2 md:hidden">
        {drafting && (
          <MobileDraft
            onCancel={() => setDrafting(false)}
            onCreate={async (input) => {
              await create({ ...input, studentId });
              setDrafting(false);
              toast.success(`「${input.companyName}」を追加しました`);
            }}
          />
        )}
        {visible.map((row) => (
          <Link
            key={row.id}
            href={`${detailBasePath}/${row.id}`}
            className={cn(
              "flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors active:bg-muted",
              row.deleted_at && "opacity-60",
            )}
          >
            <div className="min-w-0 flex-1">
              {showStudent && <p className="truncate text-xs text-muted-foreground">{row.student_name}</p>}
              <p className="truncate font-medium">{row.company_name}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <SelectionTypeBadge type={row.selection_type} early={row.is_early_selection} />
                <span className="text-xs text-muted-foreground">{row.current_step_name ?? "段階未設定"}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={row.status} type={row.selection_type} />
              {row.deleted_at && <span className="text-[11px] text-muted-foreground">削除済み</span>}
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
        {visible.length === 0 && !drafting && (
          <SheetEmpty filtered={filtered} allowCreate={allowCreate} onAdd={() => setDrafting(true)} onClear={() => setFilters(EMPTY_FILTERS)} />
        )}
      </div>

      {conflictEntry && (
        <ConflictDialog
          open
          row={rows.find((r) => r.id === conflictEntry[0]) ?? null}
          state={conflictEntry[1]}
          onDiscard={() => discardMine(conflictEntry[0])}
          onOverwrite={() => overwrite(conflictEntry[0])}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn("h-8 w-auto min-w-28", value !== ALL && "border-primary/40 bg-primary/5")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: すべて</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState | undefined; onRetry: () => void }) {
  if (!state) return <span className="size-7" />;
  if (state.status === "saving")
    return (
      <span className="grid size-7 place-items-center" role="status" aria-label="保存中">
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      </span>
    );
  if (state.status === "saved")
    return (
      <span className="grid size-7 place-items-center" role="status" aria-label="保存しました">
        <Check className="size-3.5 text-emerald-600" />
      </span>
    );
  if (state.status === "conflict")
    return (
      <span className="grid size-7 place-items-center" role="status" aria-label="更新が競合しています">
        <TriangleAlert className="size-3.5 text-amber-600" />
      </span>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={onRetry} aria-label={`保存に失敗しました: ${state.message} 再試行`}>
          <RotateCw className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>保存に失敗しました。クリックで再試行 — {state.message}</TooltipContent>
    </Tooltip>
  );
}

function RowMenu({ href, deleted, onDelete, onRestore }: { href: string; deleted: boolean; onDelete: () => void; onRestore: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="行の操作">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={href}>
            <ExternalLink />
            詳細を開く
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {deleted ? (
          <DropdownMenuItem onSelect={onRestore}>
            <ArchiveRestore />
            復元する
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            削除する
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SheetEmpty({ filtered, allowCreate, onAdd, onClear }: { filtered: boolean; allowCreate: boolean; onAdd: () => void; onClear: () => void }) {
  return filtered ? (
    <EmptyState
      icon={Search}
      title="条件に一致する応募がありません"
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          絞り込みをクリア
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Table2}
      title="まだ応募がありません"
      description={allowCreate ? "「企業を追加」から応募先を登録しましょう。選考ステップはテンプレートから自動で作成されます。" : undefined}
      action={
        allowCreate ? (
          <Button size="sm" onClick={onAdd}>
            <Plus />
            企業を追加
          </Button>
        ) : undefined
      }
    />
  );
}

type DraftInput = { companyName: string; selectionType: SelectionType; status: ApplicationStatus };

/** 新規行。企業名と選考区分がそろったときに初めて DB に保存する */
function DraftRow({
  showStudent,
  onCancel,
  onCreate,
}: {
  showStudent?: boolean;
  onCancel: () => void;
  onCreate: (input: DraftInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SelectionType | null>(null);
  const [status, setStatus] = useState<ApplicationStatus>("PLANNED");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rowRef = useRef<HTMLTableRowElement>(null);

  async function trySave(next?: { type?: SelectionType }) {
    const t = next?.type ?? type;
    const n = name.trim();
    if (!n || !t || saving) return;
    setSaving(true);
    setError("");
    try {
      await onCreate({ companyName: n, selectionType: t, status });
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <tr ref={rowRef} className="border-b bg-primary/5 [&>td]:px-1 [&>td]:py-1">
      {showStudent && <td />}
      <td>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          placeholder="企業名を入力"
          aria-label="新しい応募の企業名"
          disabled={saving}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!type) {
                rowRef.current?.querySelector<HTMLElement>("[data-draft-type]")?.focus();
                setError("選考区分を選択してください");
              } else void trySave();
            } else if (e.key === "Escape") onCancel();
          }}
          className="h-9 w-full rounded-sm border bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        {error && <p className="px-2 pt-1 text-xs text-destructive">{error}</p>}
      </td>
      <td>
        <Select
          value={type ?? undefined}
          onValueChange={(v) => {
            setType(v as SelectionType);
            setError("");
            void trySave({ type: v as SelectionType });
          }}
          disabled={saving}
        >
          <SelectTrigger data-draft-type aria-label="新しい応募の選考区分" className="h-9 w-full bg-background">
            <SelectValue placeholder="選考区分" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 text-xs text-muted-foreground">テンプレートから自動作成</td>
      <td>
        <Select value={status} onValueChange={(v) => setStatus(v as ApplicationStatus)} disabled={saving}>
          <SelectTrigger aria-label="新しい応募の応募状況" className="h-9 w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions(type ?? "FULL_TIME").map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.node}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td>
        <div className="flex items-center justify-end gap-1 pr-1">
          {saving ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Button size="sm" className="h-7 px-2" disabled={!name.trim() || !type} onClick={() => void trySave()}>
                保存
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onCancel}>
                取消
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function MobileDraft({ onCancel, onCreate }: { onCancel: () => void; onCreate: (input: DraftInput) => Promise<void> }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SelectionType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return setError("企業名を入力してください");
        if (!type) return setError("選考区分を選択してください");
        setSaving(true);
        try {
          await onCreate({ companyName: name.trim(), selectionType: type, status: "PLANNED" });
        } catch (err) {
          setError(errorMessage(err));
          setSaving(false);
        }
      }}
    >
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="企業名" aria-label="企業名" maxLength={200} />
      <div className="grid grid-cols-2 gap-2">
        {TYPE_OPTIONS.map((o) => (
          <Button key={o.value} type="button" variant={type === o.value ? "default" : "outline"} onClick={() => setType(o.value)}>
            {o.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          追加
        </Button>
      </div>
    </form>
  );
}
