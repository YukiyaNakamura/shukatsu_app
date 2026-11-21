import "server-only";
import { ApiError, unwrap } from "@/lib/api/errors";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { UpdateStepInput } from "@/lib/validations/step";
import type { SelectionStepRow } from "@/types/database";

export function toStepColumns(changes: UpdateStepInput["changes"]) {
  const map = {
    stepType: "step_type",
    displayName: "display_name",
    status: "status",
    result: "result",
    scheduledAt: "scheduled_at",
    deadlineAt: "deadline_at",
    location: "location",
    meetingUrl: "meeting_url",
    notes: "notes",
  } as const;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    const column = map[key as keyof typeof map];
    if (column && value !== undefined) patch[column] = value;
  }
  return patch as Partial<SelectionStepRow>;
}

export async function updateStepWithVersion(
  supabase: ServerSupabase,
  id: string,
  expectedVersion: number,
  patch: Partial<SelectionStepRow>,
) {
  const updated = unwrap(
    await supabase.from("selection_steps").update(patch).eq("id", id).eq("version", expectedVersion).select("*").maybeSingle(),
  );
  if (updated) return updated;
  const current = unwrap(await supabase.from("selection_steps").select("*").eq("id", id).maybeSingle());
  if (!current) throw new ApiError(404, "NOT_FOUND", "選考ステップが見つかりません。");
  throw new ApiError(409, "VERSION_CONFLICT", "他のユーザーがこのステップを更新しました。最新の内容を確認してください。", {
    current,
  });
}
