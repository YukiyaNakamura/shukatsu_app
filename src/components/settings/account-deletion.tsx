"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { formatDateTime } from "@/lib/utils/datetime";

export function AccountDeletion({ request }: { request: { status: string; requested_at: string } | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(method: "POST" | "DELETE") {
    setPending(true);
    try {
      await api("/api/v1/account/deletion-request", { method });
      toast.success(method === "POST" ? "退会を申請しました" : "退会申請を取り消しました");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  if (request) {
    return (
      <div className="grid gap-3 text-sm">
        <p>
          {formatDateTime(request.requested_at)} に退会を申請しました。
          {request.status === "PROCESSING" ? "現在、削除処理を行っています。" : "運営者が処理するまで取り消すことができます。"}
        </p>
        {request.status === "REQUESTED" && (
          <Button variant="outline" className="w-fit" disabled={pending} onClick={() => run("DELETE")}>
            退会申請を取り消す
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3 text-sm text-muted-foreground">
      <p>
        退会するとアカウントと、あなたの応募・選考ステップ・予定などすべての個人データが削除されます。組織からの脱退だけをしたい場合は「所属組織」から行ってください。
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-fit" disabled={pending}>
            退会を申請する
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>退会を申請しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              運営者の処理が完了すると、アカウントとすべての個人データが削除され、元に戻せません。処理されるまでは申請を取り消せます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => run("POST")}>退会を申請する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
