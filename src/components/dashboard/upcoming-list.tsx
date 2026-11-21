import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { formatDateTime } from "@/lib/utils/datetime";
import { cn } from "@/lib/utils";
import type { CalendarItemRow } from "@/types/database";

const KIND = {
  STEP_SCHEDULE: { label: "選考", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  STEP_DEADLINE: { label: "締切", cls: "bg-rose-50 text-rose-800 border-rose-200" },
  EVENT: { label: "予定", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
} as const;

export function UpcomingList({
  items,
  applicationBasePath,
  calendarHref,
  showStudent,
}: {
  items: CalendarItemRow[];
  applicationBasePath: string;
  calendarHref: string;
  showStudent?: boolean;
}) {
  if (items.length === 0) return <EmptyState icon={CalendarClock} title="直近2週間の予定はありません" />;
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => {
        const href = item.application_id ? `${applicationBasePath}/${item.application_id}` : calendarHref;
        return (
          <li key={`${item.kind}:${item.source_id}`}>
            <Link href={href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
              <span className={cn("shrink-0 rounded border px-1.5 py-px text-[10px] font-medium", KIND[item.kind].cls)}>{KIND[item.kind].label}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {item.company_name ? <span className="font-medium">{item.company_name}</span> : null}
                  {item.company_name ? " ・ " : ""}
                  {item.title}
                </p>
                {showStudent && <p className="truncate text-xs text-muted-foreground">{item.student_name}</p>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular">{formatDateTime(item.starts_at)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
