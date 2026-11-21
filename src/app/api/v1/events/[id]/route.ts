import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { ApiError, unwrap } from "@/lib/api/errors";
import { uuidSchema } from "@/lib/validations/common";
import { updateEventSchema } from "@/lib/validations/event";
import type { EventRow } from "@/types/database";

type Params = { id: string };

export const PATCH = withAuth<Params>(async ({ request, params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const input = await parseBody(request, updateEventSchema);
  const patch: Partial<EventRow> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
  if (input.endsAt !== undefined) patch.ends_at = input.endsAt;
  if (input.description !== undefined) patch.description = input.description;
  if (input.applicationId !== undefined) patch.application_id = input.applicationId;
  const event = unwrap(await supabase.from("events").update(patch).eq("id", id).select("*").maybeSingle());
  if (!event) throw new ApiError(404, "NOT_FOUND", "予定が見つかりません。");
  return ok(event);
});

export const DELETE = withAuth<Params>(async ({ params, supabase }) => {
  const id = parseParam(uuidSchema, params.id);
  const rows = unwrap(await supabase.from("events").delete().eq("id", id).select("id"));
  if (!rows.length) throw new ApiError(404, "NOT_FOUND", "予定が見つかりません。");
  return ok({ id });
});
