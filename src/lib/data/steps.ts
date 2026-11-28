import "server-only";
import { toUtcIso } from "@/lib/server/time";
import type { CreateStepInput, UpdateStepInput } from "@/lib/validations/step";
import type { SelectionStepRow } from "@/types/database";
import { STEP_TYPE_LABELS } from "@/lib/constants";
import type { StepInsert } from "./applications";

export { createStep, deleteStep, updateStepWithVersion } from "./applications";

/** API の入力 (camelCase) → 列 (snake_case)。日時は UTC の ISO 形式に揃える */
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
    if (!column || value === undefined) continue;
    patch[column] = column === "scheduled_at" || column === "deadline_at" ? toUtcIso(value as string | null) : value;
  }
  return patch as Partial<SelectionStepRow>;
}

export function toStepInsert(input: CreateStepInput): StepInsert {
  return {
    step_type: input.stepType,
    display_name: input.displayName ?? STEP_TYPE_LABELS[input.stepType],
    position: input.position,
    status: input.status,
    result: input.result ?? null,
    scheduled_at: toUtcIso(input.scheduledAt ?? null),
    deadline_at: toUtcIso(input.deadlineAt ?? null),
    location: input.location ?? null,
    meeting_url: input.meetingUrl ?? null,
    notes: input.notes ?? null,
  };
}
