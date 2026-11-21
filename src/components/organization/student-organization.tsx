"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Clock, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { api, errorMessage } from "@/lib/api-client";
import { CONSENT_VERSION, SHARED_SCOPE_ITEMS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/utils/datetime";
import { ConsentBox } from "./consent-box";

type Props = {
  membership: { id: string; joined_at: string; consented_at: string } | null;
  organizationName: string | null;
  admins: { full_name: string; role: string }[];
  pendingRequest: { id: string; created_at: string } | null;
};

export function StudentOrganization({ membership, organizationName, admins, pendingRequest }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function leave() {
    if (!membership) return;
    setPending(true);
    try {
      await api(`/api/v1/memberships/${membership.id}`, { method: "DELETE" });
      toast.success("組織から脱退しました。応募データはそのまま利用できます。");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function cancelRequest() {
    if (!pendingRequest) return;
    setPending(true);
    try {
      await api(`/api/v1/join-requests/${pendingRequest.id}`, { method: "PATCH", body: { action: "CANCEL" } });
      toast.success("参加申請を取り下げました");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  if (membership) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4" />
            {organizationName}
          </CardTitle>
          <CardDescription>
            {formatDate(membership.joined_at)} から所属 ・ 共有への同意: {formatDateTime(membership.consented_at)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div>
            <p className="mb-1 font-medium">管理者</p>
            <ul className="grid gap-0.5 text-muted-foreground">
              {admins.map((a, i) => (
                <li key={i}>
                  {a.full_name}
                  {a.role === "OWNER" ? "（オーナー）" : ""}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium">共有中の情報</p>
            <ul className="grid list-disc gap-0.5 pl-5 text-muted-foreground">
              {SHARED_SCOPE_ITEMS.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-fit" disabled={pending}>
                <LogOut />
                組織から脱退する
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>「{organizationName}」から脱退しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  管理者はあなたの選考情報にアクセスできなくなります。あなたの応募データは削除されず、引き続き個人で利用できます。アカウントの退会とは異なります。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={leave}>脱退する</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    );
  }

  if (pendingRequest) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4" />
            参加申請の審査中
          </CardTitle>
          <CardDescription>
            「{organizationName ?? "組織"}」への参加を申請しました ({formatDateTime(pendingRequest.created_at)})。管理者が承認すると所属が確定し、選考情報が共有されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={cancelRequest} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            申請を取り下げる
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <JoinByCode />;
}

function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = code.replace(/[^A-Za-z0-9]/g, "");
    if (normalized.length !== 8) return setError("組織コードは8文字です (例: ABCD-EFGH)");
    if (!consent) return setError("選考情報の共有に同意してください");
    setPending(true);
    setError("");
    try {
      const res = await api<{ organizationName: string }>("/api/v1/join-requests", {
        method: "POST",
        body: { code: normalized, consentVersion: CONSENT_VERSION },
      });
      toast.success(`「${res.organizationName}」に参加申請しました`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <Card>
        <CardHeader>
          <CardTitle>組織に参加する</CardTitle>
          <CardDescription>
            現在どの組織にも所属していません。組織に所属しなくても、応募管理はすべて利用できます。キャリア支援エージェントから組織コードを受け取った場合は、ここから参加を申請できます。招待リンクを受け取った場合は、そのリンクを開いてください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="join-code">組織コード</Label>
              <Input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={12}
                className="max-w-48 font-mono tracking-widest"
              />
            </div>
            <ConsentBox checked={consent} onCheckedChange={setConsent} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-fit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              参加を申請する
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
