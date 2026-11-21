import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="grid gap-1 rounded-lg border p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
