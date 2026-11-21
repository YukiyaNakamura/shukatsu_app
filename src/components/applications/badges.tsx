import { Badge } from "@/components/ui/badge";
import { applicationStatusLabel, SELECTION_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, SelectionType } from "@/types/database";

export const STATUS_STYLES: Record<ApplicationStatus, string> = {
  PLANNED: "bg-slate-100 text-slate-700 border-slate-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  ACCEPTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
  WITHDRAWN: "bg-amber-50 text-amber-800 border-amber-200",
  CANCELLED: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export const STATUS_DOT: Record<ApplicationStatus, string> = {
  PLANNED: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  ACCEPTED: "bg-emerald-500",
  REJECTED: "bg-rose-500",
  WITHDRAWN: "bg-amber-500",
  CANCELLED: "bg-zinc-400",
};

export function StatusBadge({ status, type, className }: { status: ApplicationStatus; type: SelectionType; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", STATUS_STYLES[status], className)}>
      {applicationStatusLabel(status, type)}
    </Badge>
  );
}

export function SelectionTypeBadge({ type, early, className }: { type: SelectionType; early?: boolean; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        type === "INTERNSHIP" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-sky-200 bg-sky-50 text-sky-800",
        className,
      )}
    >
      {SELECTION_TYPE_LABELS[type]}
      {early && type === "FULL_TIME" ? "・早期" : ""}
    </Badge>
  );
}
