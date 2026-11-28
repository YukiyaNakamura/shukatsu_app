import { ok, parseBody, parseParam, withAuth } from "@/lib/api/handler";
import { uuidSchema } from "@/lib/validations/common";
import { updateEventSchema } from "@/lib/validations/event";
import { deleteEvent, updateEvent } from "@/lib/data/calendar";

type Params = { id: string };

export const PATCH = withAuth<Params>(async ({ request, params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  const input = await parseBody(request, updateEventSchema);
  return ok(await updateEvent(ctx, id, input));
});

export const DELETE = withAuth<Params>(async ({ params, ctx }) => {
  const id = parseParam(uuidSchema, params.id);
  return ok(await deleteEvent(ctx, id));
});
