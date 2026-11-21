import Link from "next/link";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      icon={UserX}
      title="学生が見つかりません"
      description="この学生は組織に所属していないか、所属が解除されています。"
      action={
        <Button asChild variant="outline">
          <Link href="/admin/students">学生一覧に戻る</Link>
        </Button>
      }
    />
  );
}
