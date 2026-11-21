import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="応募が見つかりません"
      description="URLが間違っているか、アクセスできない応募です。"
      action={
        <Button asChild variant="outline">
          <Link href="/student/applications">応募管理に戻る</Link>
        </Button>
      }
    />
  );
}
