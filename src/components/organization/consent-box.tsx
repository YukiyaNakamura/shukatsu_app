"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SHARED_SCOPE_ITEMS } from "@/lib/constants";

export function ConsentBox({
  organizationName,
  checked,
  onCheckedChange,
}: {
  organizationName?: string | null;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
      <p className="font-medium">共有される情報</p>
      <p className="text-muted-foreground">
        {organizationName ? `「${organizationName}」` : "参加する組織"}の管理者は、所属期間中、次の情報を閲覧・編集できます。
      </p>
      <ul className="grid list-disc gap-0.5 pl-5 text-muted-foreground">
        {SHARED_SCOPE_ITEMS.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        組織からはいつでも脱退できます。脱退すると管理者のアクセスは直ちに停止し、あなたの応募データはそのまま残ります。
      </p>
      <div className="flex items-start gap-2">
        <Checkbox id="consent" checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
        <Label htmlFor="consent" className="font-normal leading-snug">
          上記の情報を組織の管理者と共有することに同意します
        </Label>
      </div>
    </div>
  );
}
