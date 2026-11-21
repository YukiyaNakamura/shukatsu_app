"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatTime, jstDateKey, jstMonthRange } from "@/lib/utils/datetime";
import type { CalendarItemRow } from "@/types/database";
import { EventDialog, type EventTarget } from "./event-dialog";

export type CalendarStudent = { id: string; name: string };
export type CalendarApplication = { id: string; company_name: string; student_id: string };

const KIND_STYLE: Record<CalendarItemRow["kind"], { dot: string; chip: string; label: string }> = {
  STEP_SCHEDULE: { dot: "bg-blue-500", chip: "bg-blue-50 text-blue-800 border-blue-200", label: "選考" },
  STEP_DEADLINE: { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-800 border-rose-200", label: "締切" },
  EVENT: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800 border-emerald-200", label: "予定" },
};
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type Props = {
  initialYear: number;
  initialMonth: number;
  initialItems: CalendarItemRow[];
  /** 管理者: 所属学生 (予定作成時に学生を選択) */
  students?: CalendarStudent[];
  applications: CalendarApplication[];
  applicationBasePath: string;
  showStudent?: boolean;
};

function itemKey(i: CalendarItemRow) {
  return `${i.kind}:${i.source_id}`;
}

export function CalendarView({ initialYear, initialMonth, initialItems, students, applications, applicationBasePath, showStudent }: Props) {
  const [ym, setYm] = useState({ year: initialYear, month: initialMonth });
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [studentFilter, setStudentFilter] = useState("ALL");
  const todayKey = jstDateKey(new Date());
  const [selected, setSelected] = useState<string>(() => {
    const t = todayKey.split("-").map(Number);
    return t[0] === initialYear && t[1] === initialMonth ? todayKey : `${initialYear}-${String(initialMonth).padStart(2, "0")}-01`;
  });
  const [dialog, setDialog] = useState<EventTarget | null>(null);
  const firstLoad = useRef(true);

  const load = useCallback(async (year: number, month: number) => {
    setLoading(true);
    try {
      const { from, to } = jstMonthRange(year, month);
      // 前後の週も表示するため 7 日広げて取得
      const f = new Date(new Date(from).getTime() - 7 * 86_400_000).toISOString();
      const t = new Date(new Date(to).getTime() + 7 * 86_400_000).toISOString();
      setItems(await api<CalendarItemRow[]>(`/api/v1/calendar?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    void load(ym.year, ym.month);
  }, [ym, load]);

  const filtered = useMemo(
    () => (studentFilter === "ALL" ? items : items.filter((i) => i.student_id === studentFilter)),
    [items, studentFilter],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItemRow[]>();
    for (const item of filtered) {
      const key = jstDateKey(item.starts_at);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [filtered]);

  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(ym.year, ym.month - 1, 1));
    const start = new Date(first);
    start.setUTCDate(1 - first.getUTCDay());
    const days: { key: string; day: number; inMonth: boolean; weekday: number }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      days.push({
        key: d.toISOString().slice(0, 10),
        day: d.getUTCDate(),
        inMonth: d.getUTCMonth() === ym.month - 1,
        weekday: d.getUTCDay(),
      });
    }
    const rows = [];
    for (let i = 0; i < 42; i += 7) rows.push(days.slice(i, i + 7));
    return rows.filter((w, i) => i < 5 || w.some((d) => d.inMonth));
  }, [ym]);

  const shift = (delta: number) =>
    setYm(({ year, month }) => {
      const m = month + delta;
      return m < 1 ? { year: year - 1, month: 12 } : m > 12 ? { year: year + 1, month: 1 } : { year, month: m };
    });

  const selectedItems = byDay.get(selected) ?? [];

  function openItem(item: CalendarItemRow) {
    if (item.kind === "EVENT") setDialog({ mode: "edit", eventId: item.source_id, item });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="前の月">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="次の月">
            <ChevronRight />
          </Button>
        </div>
        <h2 className="min-w-28 text-lg font-semibold tabular">
          {ym.year}年{ym.month}月
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const [y, m] = todayKey.split("-").map(Number);
            setYm({ year: y, month: m });
            setSelected(todayKey);
          }}
        >
          今日
        </Button>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {students && (
            <Select value={studentFilter} onValueChange={setStudentFilter}>
              <SelectTrigger className="w-40" aria-label="学生で絞り込み">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全学生</SelectItem>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setDialog({ mode: "create", date: selected })} disabled={students?.length === 0}>
            <CalendarPlus />
            予定を追加
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries(KIND_STYLE).map(([k, s]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", s.dot)} />
            {k === "STEP_SCHEDULE" ? "面接・選考実施日" : k === "STEP_DEADLINE" ? "ES・課題の提出期限" : "独立した予定"}
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-hidden rounded-lg border" role="grid" aria-label={`${ym.year}年${ym.month}月のカレンダー`}>
          <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs text-muted-foreground">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={cn("py-1.5", i === 0 && "text-rose-600", i === 6 && "text-blue-600")}>
                {w}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0].key} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((d) => {
                const dayItems = byDay.get(d.key) ?? [];
                const isToday = d.key === todayKey;
                const isSelected = d.key === selected;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setSelected(d.key)}
                    aria-pressed={isSelected}
                    aria-label={`${d.key} ${dayItems.length}件`}
                    className={cn(
                      "flex min-h-14 flex-col gap-0.5 border-r p-1 text-left align-top last:border-r-0 sm:min-h-24",
                      !d.inMonth && "bg-muted/30 text-muted-foreground",
                      isSelected && "bg-primary/5 ring-2 ring-inset ring-primary/40",
                      "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-xs tabular",
                        isToday && "bg-primary font-semibold text-primary-foreground",
                        !isToday && d.weekday === 0 && "text-rose-600",
                        !isToday && d.weekday === 6 && "text-blue-600",
                      )}
                    >
                      {d.day}
                    </span>
                    {/* スマホ: ドット */}
                    <span className="flex flex-wrap gap-0.5 px-1 sm:hidden">
                      {dayItems.slice(0, 4).map((i) => (
                        <span key={itemKey(i)} className={cn("size-1.5 rounded-full", KIND_STYLE[i.kind].dot)} />
                      ))}
                    </span>
                    {/* PC: ラベル */}
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {dayItems.slice(0, 3).map((i) => (
                        <span key={itemKey(i)} className={cn("truncate rounded border px-1 text-[11px] leading-4", KIND_STYLE[i.kind].chip)}>
                          {formatTime(i.starts_at)} {i.company_name ?? i.title}
                        </span>
                      ))}
                      {dayItems.length > 3 && <span className="px-1 text-[11px] text-muted-foreground">他 {dayItems.length - 3} 件</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <section aria-label="選択した日の予定" className="grid h-fit gap-2">
          <h3 className="text-sm font-medium">
            {Number(selected.slice(5, 7))}月{Number(selected.slice(8, 10))}日の予定
          </h3>
          {selectedItems.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">予定はありません</p>
          ) : (
            <ul className="grid gap-2">
              {selectedItems.map((item) => {
                const content = (
                  <>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn("rounded border px-1.5 py-px text-[10px] font-medium", KIND_STYLE[item.kind].chip)}>{KIND_STYLE[item.kind].label}</span>
                      <span className="inline-flex items-center gap-1 tabular">
                        <Clock className="size-3" />
                        {formatTime(item.starts_at)}
                        {item.ends_at ? `〜${formatTime(item.ends_at)}` : ""}
                      </span>
                      {showStudent && item.student_name && <span className="truncate">{item.student_name}</span>}
                    </div>
                    <p className="mt-1 text-sm font-medium">
                      {item.company_name ? `${item.company_name} ・ ` : ""}
                      {item.title}
                    </p>
                    {item.location && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" />
                        {item.location}
                      </p>
                    )}
                  </>
                );
                return (
                  <li key={itemKey(item)}>
                    {item.kind === "EVENT" ? (
                      <button type="button" onClick={() => openItem(item)} className="w-full rounded-lg border p-3 text-left hover:bg-muted/60">
                        {content}
                      </button>
                    ) : (
                      <Link href={`${applicationBasePath}/${item.application_id}`} className="block rounded-lg border p-3 hover:bg-muted/60">
                        {content}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {dialog && (
        <EventDialog
          target={dialog}
          students={students}
          applications={applications}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void load(ym.year, ym.month);
          }}
        />
      )}
    </div>
  );
}
