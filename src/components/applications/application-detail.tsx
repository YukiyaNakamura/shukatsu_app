"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ArchiveRestore, ArrowLeft, Check, ExternalLink, Loader2, RotateCw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api, ClientApiError, errorMessage } from "@/lib/api-client";
import {
  APPLICATION_SOURCE_SUGGESTIONS,
  APPLICATION_STATUSES,
  applicationStatusLabel,
  PRIORITY_LABELS,
  SELECTION_TYPE_LABELS,
  SELECTION_TYPES,
} from "@/lib/constants";
import { applicationFieldsSchema, type ApplicationFieldsInput } from "@/lib/validations/application";
import { formatDateTime } from "@/lib/utils/datetime";
import type { ApplicationRow, SelectionStepRow } from "@/types/database";
import { SelectionTypeBadge, StatusBadge } from "./badges";
import { StepTimeline } from "@/components/selection/step-timeline";
import { HistoryList } from "./history-list";

type SaveStatus = { state: "idle" } | { state: "saving" } | { state: "saved" } | { state: "error"; message: string } | { state: "conflict"; latest: ApplicationRow | null };

type Props = {
  initialApplication: ApplicationRow;
  initialSteps: SelectionStepRow[];
  backHref: string;
  backLabel: string;
  studentLabel?: string;
};

/** 応募詳細: 基本情報 (フィールド単位の自動保存 + 楽観的ロック)、選考タイムライン、変更履歴 */
export function ApplicationDetail({ initialApplication, initialSteps, backHref, backLabel, studentLabel }: Props) {
  const router = useRouter();
  const [app, setApp] = useState(initialApplication);
  const [steps, setSteps] = useState(initialSteps);
  const [status, setStatus] = useState<SaveStatus>({ state: "idle" });
  const [pending, setPending] = useState<ApplicationFieldsInput | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const version = useRef(initialApplication.version);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const deleted = Boolean(app.deleted_at);

  const replaceApp = useCallback((next: ApplicationRow) => {
    version.current = next.version;
    setApp(next);
  }, []);

  const save = useCallback(
    (changes: ApplicationFieldsInput) => {
      const parsed = applicationFieldsSchema.safeParse(changes);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
        return Promise.resolve();
      }
      queue.current = queue.current.then(async () => {
        setStatus({ state: "saving" });
        setPending(changes);
        try {
          const res = await api<{ application: ApplicationRow }>(`/api/v1/applications/${app.id}`, {
            method: "PATCH",
            body: { expectedVersion: version.current, changes: parsed.data },
          });
          replaceApp(res.application);
          setPending(null);
          setStatus({ state: "saved" });
          setHistoryKey((k) => k + 1);
        } catch (error) {
          if (error instanceof ClientApiError && error.isConflict) {
            const latest = (error.details as { current?: ApplicationRow } | undefined)?.current ?? null;
            setStatus({ state: "conflict", latest });
          } else {
            setStatus({ state: "error", message: errorMessage(error) });
          }
        }
      });
      return queue.current;
    },
    [app.id, replaceApp],
  );

  async function reloadLatest() {
    try {
      const detail = await api<{ application: ApplicationRow; steps: SelectionStepRow[] }>(`/api/v1/applications/${app.id}`);
      replaceApp(detail.application);
      setSteps(detail.steps);
      setPending(null);
      setStatus({ state: "idle" });
      setFormKey((k) => k + 1);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function overwrite() {
    if (status.state !== "conflict" || !pending) return;
    if (status.latest) version.current = status.latest.version;
    else {
      const detail = await api<{ application: ApplicationRow }>(`/api/v1/applications/${app.id}`);
      version.current = detail.application.version;
    }
    void save(pending);
  }

  async function toggleDeleted() {
    try {
      if (deleted) {
        await api(`/api/v1/applications/${app.id}/restore`, { method: "POST" });
        toast.success("応募を復元しました");
      } else {
        await api(`/api/v1/applications/${app.id}`, { method: "DELETE" });
        toast.success("応募を削除しました。一覧の「削除済み」から復元できます。");
      }
      const detail = await api<{ application: ApplicationRow }>(`/api/v1/applications/${app.id}`);
      replaceApp(detail.application);
      setHistoryKey((k) => k + 1);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const currentStep = steps.find((s) => s.id === app.current_step_id);

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href={backHref} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" />
            {backLabel}
          </Link>
          <h1 className="truncate text-xl font-semibold tracking-tight">{app.company_name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {studentLabel && <span>{studentLabel}</span>}
            <SelectionTypeBadge type={app.selection_type} early={app.is_early_selection} />
            <StatusBadge status={app.status} type={app.selection_type} />
            <span>現在: {currentStep?.display_name ?? "未設定"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DetailSaveStatus status={status} onRetry={() => pending && void save(pending)} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                {deleted ? <ArchiveRestore /> : <Trash2 />}
                {deleted ? "復元" : "削除"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{deleted ? "この応募を復元しますか？" : "この応募を削除しますか？"}</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleted ? "一覧とカレンダーに再び表示されます。" : "一覧とカレンダーから非表示になります。選考履歴は保持され、あとから復元できます。"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={toggleDeleted}>{deleted ? "復元する" : "削除する"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {deleted && (
        <Alert>
          <Trash2 />
          <AlertTitle>この応募は削除されています</AlertTitle>
          <AlertDescription>編集するには復元してください。</AlertDescription>
        </Alert>
      )}

      {status.state === "conflict" && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <TriangleAlert />
          <AlertTitle>ほかのユーザーが先に更新しました</AlertTitle>
          <AlertDescription>
            <p>
              あなたの入力内容は保持されています。
              {status.latest && `最新の更新: ${formatDateTime(status.latest.updated_at)}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={reloadLatest}>
                最新の内容を読み込む (自分の入力を破棄)
              </Button>
              <Button size="sm" onClick={overwrite}>
                自分の入力で上書き
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">基本情報・選考</TabsTrigger>
          <TabsTrigger value="history">変更履歴</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <BasicInfoForm key={formKey} app={app} disabled={deleted} onSave={save} />
          <StepTimeline
            applicationId={app.id}
            steps={steps}
            currentStepId={app.current_step_id}
            disabled={deleted}
            onStepsChange={(next) => {
              setSteps(next);
              setHistoryKey((k) => k + 1);
            }}
            onSetCurrent={async (stepId) => {
              try {
                const res = await api<{ steps: SelectionStepRow[] }>(`/api/v1/applications/${app.id}/current-step`, {
                  method: "PATCH",
                  body: { expectedVersion: version.current, stepId },
                });
                const detail = await api<{ application: ApplicationRow }>(`/api/v1/applications/${app.id}`);
                replaceApp(detail.application);
                setSteps(res.steps);
                setHistoryKey((k) => k + 1);
                toast.success("現在の選考段階を変更しました");
              } catch (error) {
                if (error instanceof ClientApiError && error.isConflict) {
                  toast.error("ほかのユーザーが更新したため変更できませんでした。最新の内容を読み込みます。");
                  await reloadLatest();
                } else toast.error(errorMessage(error));
              }
            }}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryList applicationId={app.id} refreshKey={historyKey} steps={steps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailSaveStatus({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <div className="text-xs text-muted-foreground" aria-live="polite">
      {status.state === "saving" && (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" />
          保存中…
        </span>
      )}
      {status.state === "saved" && (
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <Check className="size-3" />
          保存しました
        </span>
      )}
      {status.state === "error" && (
        <span className="inline-flex items-center gap-1 text-destructive">
          {status.message}
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-destructive" onClick={onRetry}>
            <RotateCw className="size-3" />
            再試行
          </Button>
        </span>
      )}
    </div>
  );
}

/** 基本情報。各フィールドはフォーカスが外れたとき / 選択したときに自動保存 */
function BasicInfoForm({
  app,
  disabled,
  onSave,
}: {
  app: ApplicationRow;
  disabled: boolean;
  onSave: (changes: ApplicationFieldsInput) => Promise<void>;
}) {
  const commitText = (field: "companyName" | "jobTitle" | "companyUrl" | "applicationSource" | "memo", original: string | null) =>
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.currentTarget.value.trim();
      if (value === (original ?? "")) return;
      if (field === "companyName" && !value) {
        toast.error("企業名を入力してください");
        e.currentTarget.value = original ?? "";
        return;
      }
      void onSave({ [field]: value } as ApplicationFieldsInput);
    };
  const enterToBlur = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
  };

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="text-base">基本情報</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field label="企業名" htmlFor="companyName">
          <Input id="companyName" defaultValue={app.company_name} maxLength={200} disabled={disabled} onBlur={commitText("companyName", app.company_name)} onKeyDown={enterToBlur} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="選考区分">
            <Select value={app.selection_type} disabled={disabled} onValueChange={(v) => void onSave({ selectionType: v as ApplicationRow["selection_type"] })}>
              <SelectTrigger className="w-full" aria-label="選考区分">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SELECTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {SELECTION_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="応募状況">
            <Select value={app.status} disabled={disabled} onValueChange={(v) => void onSave({ status: v as ApplicationRow["status"] })}>
              <SelectTrigger className="w-full" aria-label="応募状況">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLICATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {applicationStatusLabel(s, app.selection_type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {app.selection_type === "FULL_TIME" && (
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="early" className="font-normal">
              早期選考
            </Label>
            <Switch id="early" checked={app.is_early_selection} disabled={disabled} onCheckedChange={(v) => void onSave({ isEarlySelection: v })} />
          </div>
        )}
        <Field label="職種・コース" htmlFor="jobTitle">
          <Input id="jobTitle" defaultValue={app.job_title ?? ""} maxLength={200} disabled={disabled} placeholder="例: 総合職、エンジニアコース" onBlur={commitText("jobTitle", app.job_title)} onKeyDown={enterToBlur} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="応募日" htmlFor="appliedAt">
            <Input
              id="appliedAt"
              type="date"
              defaultValue={app.applied_at ?? ""}
              disabled={disabled}
              onBlur={(e) => {
                const v = e.currentTarget.value || null;
                if (v !== app.applied_at) void onSave({ appliedAt: v });
              }}
            />
          </Field>
          <Field label="志望度">
            <Select
              value={app.priority ? String(app.priority) : "none"}
              disabled={disabled}
              onValueChange={(v) => void onSave({ priority: v === "none" ? null : Number(v) })}
            >
              <SelectTrigger className="w-full" aria-label="志望度">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未設定</SelectItem>
                {[5, 4, 3, 2, 1].map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    {PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="応募経路" htmlFor="applicationSource">
          <Input
            id="applicationSource"
            list="application-sources"
            defaultValue={app.application_source ?? ""}
            maxLength={100}
            disabled={disabled}
            placeholder="例: ナビサイト"
            onBlur={commitText("applicationSource", app.application_source)}
            onKeyDown={enterToBlur}
          />
          <datalist id="application-sources">
            {APPLICATION_SOURCE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="企業URL" htmlFor="companyUrl">
          <div className="flex gap-2">
            <Input
              id="companyUrl"
              type="url"
              inputMode="url"
              defaultValue={app.company_url ?? ""}
              disabled={disabled}
              placeholder="https://"
              onBlur={commitText("companyUrl", app.company_url)}
              onKeyDown={enterToBlur}
            />
            {app.company_url && (
              <Button variant="outline" size="icon" asChild>
                <a href={app.company_url} target="_blank" rel="noopener noreferrer" aria-label="企業サイトを開く">
                  <ExternalLink />
                </a>
              </Button>
            )}
          </div>
        </Field>
        <Field label="共有メモ" htmlFor="memo" hint="所属組織の管理者と共有されます">
          <Textarea id="memo" defaultValue={app.memo ?? ""} rows={5} maxLength={10000} disabled={disabled} onBlur={commitText("memo", app.memo)} />
        </Field>
        <p className="text-[11px] text-muted-foreground">最終更新: {formatDateTime(app.updated_at)}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
