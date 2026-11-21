import "server-only";
import { unwrap } from "@/lib/api/errors";
import type { ServerSupabase } from "@/lib/supabase/server";

export async function listCalendarItems(
  supabase: ServerSupabase,
  range: { from: string; to: string; studentId?: string },
) {
  let query = supabase
    .from("calendar_items")
    .select("*")
    .gte("starts_at", range.from)
    .lt("starts_at", range.to)
    .order("starts_at", { ascending: true })
    .limit(2000);
  if (range.studentId) query = query.eq("student_id", range.studentId);
  return unwrap(await query);
}

export async function listEvents(supabase: ServerSupabase, studentId?: string) {
  let query = supabase.from("events").select("*").order("starts_at");
  if (studentId) query = query.eq("student_id", studentId);
  return unwrap(await query);
}
