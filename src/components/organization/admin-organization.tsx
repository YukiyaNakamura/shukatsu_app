"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, KeyRound, Link2, Loader2, Mail, ShieldCheck, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { formatDate, formatDateTime } from "@/lib/utils/datetime";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function run<T>(key: string, fn: () => Promise<T>, success?: string): Promise<T | undefined> {
    setBusy(key);
    try {
      const result = await fn();
      if (success) toast.success(success);
      router.refresh();
      return result;
    } catch (e) {
      toast.error(errorMessage(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }
  return { busy, run };
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input value={value} readOnly aria-label={label} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`${label}をコピー`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            toast.error("コピーできませんでした。手動で選択してコピーしてください。");
          }
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

export function CreateOrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>組織を作成</CardTitle>
        <CardDescription>
          エージェント組織を作成すると、あなたがオーナーになります。既存の組織に管理者として参加する場合は、オーナーから届いた招待リンクを開いてください。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return setError("組織名を入力してください");
            setPending(true);
            setError("");
            try {
              await api("/api/v1/organizations", { method: "POST", body: { name: name.trim() } });
              toast.success("組織を作成しました");
              router.refresh();
            } catch (err) {
              setError(errorMessage(err));
              setPending(false);
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="org-name">組織名</Label>
            <Input id="org-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="例: 〇〇キャリア" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-fit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            作成する
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function JoinCodeCard({ issuedAt }: { issuedAt: string | null }) {
  const { busy, run } = useAction();
  const [code, setCode] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" />
          組織コード
        </CardTitle>
        <CardDescription>
          学生がコードを入力すると参加申請が届きます。承認するまで選考情報は共有されません。コードはセキュリティのため発行時のみ表示されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {code ? (
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">新しい組織コード (この画面を離れると再表示できません)</p>
            <CopyField value={code} label="組織コード" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{issuedAt ? `${formatDateTime(issuedAt)} に発行済み` : "組織コードは未発行です"}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={async () => {
              const res = await run("issue", () => api<{ code: string }>("/api/v1/organizations/join-code", { method: "POST" }), "組織コードを発行しました");
              if (res) setCode(res.code);
            }}
          >
            {busy === "issue" && <Loader2 className="animate-spin" />}
            {issuedAt ? "再発行 (旧コードは無効)" : "発行する"}
          </Button>
          {issuedAt && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={async () => {
                await run("disable", () => api("/api/v1/organizations/join-code", { method: "DELETE" }), "組織コードを無効にしました");
                setCode(null);
              }}
            >
              無効にする
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type Invitation = {
  id: string;
  email: string | null;
  invitee_role: "STUDENT" | "ADMIN";
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function invitationState(i: Invitation) {
  if (i.revoked_at) return { label: "取り消し", cls: "bg-zinc-100 text-zinc-600" };
  if (i.used_at) return { label: "使用済み", cls: "bg-emerald-50 text-emerald-700" };
  if (new Date(i.expires_at) <= new Date()) return { label: "期限切れ", cls: "bg-amber-50 text-amber-800" };
  return { label: "有効", cls: "bg-blue-50 text-blue-700" };
}

export function InvitationsCard({ invitations, isOwner }: { invitations: Invitation[]; isOwner: boolean }) {
  const { busy, run } = useAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"STUDENT" | "ADMIN">("STUDENT");
  const [created, setCreated] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4" />
          招待リンク
        </CardTitle>
        <CardDescription>7日間有効・1回限りのリンクを発行します。メールアドレスを指定すると、そのアドレスで認証したユーザーのみ参加できます。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              const res = await api<{ url: string; expiresAt: string }>("/api/v1/organizations/invitations", {
                method: "POST",
                body: { email, role },
              });
              setCreated(res);
              setEmail("");
              toast.success("招待リンクを発行しました");
              await run("refresh", async () => undefined);
            } catch (err) {
              setError(err instanceof ClientApiError ? (err.fieldErrors.email ?? err.message) : errorMessage(err));
            }
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={role === "ADMIN" ? "管理者のメールアドレス (必須)" : "メールアドレス (任意)"}
            aria-label="招待先メールアドレス"
          />
          {isOwner && (
            <Select value={role} onValueChange={(v) => setRole(v as "STUDENT" | "ADMIN")}>
              <SelectTrigger className="w-32" aria-label="招待する種別">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STUDENT">学生</SelectItem>
                <SelectItem value="ADMIN">管理者</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button type="submit">
            <Mail />
            発行
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {created && (
          <div className="grid gap-1.5 rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">招待リンク (有効期限 {formatDateTime(created.expiresAt)}・この画面を離れると再表示できません)</p>
            <CopyField value={created.url} label="招待リンク" />
          </div>
        )}
        {invitations.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">
            {invitations.map((i) => {
              const st = invitationState(i);
              return (
                <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                  <Badge variant="outline" className={`border-0 font-normal ${st.cls}`}>
                    {st.label}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {i.invitee_role === "ADMIN" ? "管理者: " : ""}
                    {i.email ?? "メール指定なし"}
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{formatDate(i.created_at)} 発行</span>
                  {st.label === "有効" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => run(i.id, () => api(`/api/v1/organizations/invitations/${i.id}`, { method: "DELETE" }), "招待を取り消しました")}
                    >
                      取り消す
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type JoinRequest = { id: string; full_name: string; university_name: string; created_at: string };

export function JoinRequestsCard({ requests }: { requests: JoinRequest[] }) {
  const { busy, run } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">参加申請 {requests.length > 0 && <Badge className="ml-1">{requests.length}</Badge>}</CardTitle>
        <CardDescription>学生は申請時に選考情報の共有に同意しています。承認すると所属が確定します。</CardDescription>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">審査待ちの申請はありません。</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.university_name} ・ {formatDateTime(r.created_at)}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => run(r.id, () => api(`/api/v1/join-requests/${r.id}`, { method: "PATCH", body: { action: "APPROVE" } }), `${r.full_name}さんの参加を承認しました`)}
                >
                  {busy === r.id ? <Loader2 className="animate-spin" /> : <Check />}
                  承認
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => run(`${r.id}:x`, () => api(`/api/v1/join-requests/${r.id}`, { method: "PATCH", body: { action: "REJECT" } }), "申請を却下しました")}
                >
                  <X />
                  却下
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type Admin = { id: string; user_id: string; role: "OWNER" | "ADMIN"; full_name: string; joined_at: string };

export function AdminsCard({ admins, currentUserId, isOwner }: { admins: Admin[]; currentUserId: string; isOwner: boolean }) {
  const { busy, run } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          管理者
        </CardTitle>
        <CardDescription>オーナーと管理者は学生の選考情報に対して同じ権限を持ちます。管理者の追加・削除はオーナーのみ行えます。</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-md border">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {a.full_name}
                {a.user_id === currentUserId && <span className="text-muted-foreground">（あなた）</span>}
              </span>
              <Badge variant={a.role === "OWNER" ? "default" : "outline"}>{a.role === "OWNER" ? "オーナー" : "管理者"}</Badge>
              {a.role !== "OWNER" && (isOwner || a.user_id === currentUserId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(a.user_id === currentUserId ? "この組織から脱退しますか？" : `${a.full_name}さんを管理者から外しますか？`)) return;
                    void run(a.id, () => api(`/api/v1/organizations/members/${a.id}`, { method: "DELETE" }), "管理者を削除しました");
                  }}
                >
                  {a.user_id === currentUserId ? "脱退" : "削除"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

type Student = { student_id: string; membership_id: string; full_name: string; university_name: string | null; joined_at: string };

export function StudentMembersCard({ students }: { students: Student[] }) {
  const { busy, run } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">所属学生 ({students.length})</CardTitle>
        <CardDescription>所属を解除すると、その学生の選考情報には直ちにアクセスできなくなります。学生のデータは削除されません。</CardDescription>
      </CardHeader>
      <CardContent>
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground">所属学生はまだいません。招待リンクまたは組織コードで学生を招待しましょう。</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {students.map((s) => (
              <li key={s.membership_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.university_name} ・ {formatDate(s.joined_at)} から所属
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={busy !== null}>
                      <UserMinus />
                      所属解除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{s.full_name}さんの所属を解除しますか？</AlertDialogTitle>
                      <AlertDialogDescription>この学生の応募・予定には直ちにアクセスできなくなります。学生本人のデータは削除されません。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => run(s.membership_id, () => api(`/api/v1/memberships/${s.membership_id}`, { method: "DELETE" }), "所属を解除しました")}
                      >
                        所属解除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
