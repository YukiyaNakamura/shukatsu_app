"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">エラーが発生しました</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        データを読み込めませんでした。ネットワーク接続を確認して再試行してください。問題が続く場合は、再度ログインしてください。
      </p>
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>再試行</Button>
        <Button variant="outline" asChild>
          <a href="/login">ログイン画面へ</a>
        </Button>
      </div>
    </div>
  );
}
