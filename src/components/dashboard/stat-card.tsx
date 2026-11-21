import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "blue" | "green" | "amber";
}) {
  const body = (
    <div className="flex items-start justify-between gap-2 rounded-lg border bg-card p-4 transition-colors">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
      </div>
      <span
        className={cn(
          "grid size-8 place-items-center rounded-md",
          tone === "blue" && "bg-blue-50 text-blue-600",
          tone === "green" && "bg-emerald-50 text-emerald-600",
          tone === "amber" && "bg-amber-50 text-amber-600",
          tone === "default" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
    </div>
  );
  return href ? (
    <Link href={href} className="rounded-lg hover:[&>div]:bg-muted/40">
      {body}
    </Link>
  ) : (
    body
  );
}
