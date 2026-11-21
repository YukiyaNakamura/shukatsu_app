"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";
import { CONSENT_VERSION } from "@/lib/constants";
import { ConsentBox } from "./consent-box";

export function AcceptInvitation({
  token,
  organizationName,
  inviteeRole,
}: {
  token: string;
  organizationName: string;
  inviteeRole: "STUDENT" | "ADMIN";
}) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function accept() {
    if (inviteeRole === "STUDENT" && !consent) return setError("選考情報の共有に同意してください");
    setPending(true);
    setError("");
    try {
      await api("/api/v1/invitations/accept", {
        method: "POST",
        body: { token, consentVersion: inviteeRole === "STUDENT" ? CONSENT_VERSION : undefined },
      });
      router.replace(inviteeRole === "STUDENT" ? "/student/organization" : "/admin/organization");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      {inviteeRole === "STUDENT" ? (
        <ConsentBox organizationName={organizationName} checked={consent} onCheckedChange={setConsent} />
      ) : (
        <p className="text-sm text-muted-foreground">
          管理者として参加すると、組織に所属する学生全員の選考情報を閲覧・編集できるようになります。
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={accept} disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {inviteeRole === "STUDENT" ? "同意して参加する" : "管理者として参加する"}
      </Button>
    </div>
  );
}
