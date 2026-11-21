import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">ページが見つかりません</h1>
      <p className="text-sm text-muted-foreground">URLが間違っているか、ページが移動した可能性があります。</p>
      <Button asChild variant="outline" className="mt-2">
        <Link href="/">トップへ戻る</Link>
      </Button>
    </div>
  );
}
