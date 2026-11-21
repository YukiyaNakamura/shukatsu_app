"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** 表のセル間を矢印キーで移動する */
export function moveFocus(from: HTMLElement, key: string): boolean {
  const pos = from.dataset.cell?.split(":").map(Number);
  if (!pos) return false;
  let [r, c] = pos;
  if (key === "ArrowUp") r -= 1;
  else if (key === "ArrowDown") r += 1;
  else if (key === "ArrowLeft") c -= 1;
  else if (key === "ArrowRight") c += 1;
  else return false;
  const grid = from.closest("[data-grid]");
  const target = grid?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`);
  if (target) {
    target.focus();
    return true;
  }
  return false;
}

const cellBase =
  "flex h-9 w-full items-center gap-1.5 rounded-sm px-2 text-left text-sm outline-none transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-60";

type Option<V extends string> = { value: V; label: string; node?: React.ReactNode };

/** プルダウン型セル。Enter / Space で開き、矢印キーでセル移動 */
export function SelectCell<V extends string>({
  value,
  display,
  options,
  onChange,
  cell,
  disabled,
  ariaLabel,
  placeholder,
}: {
  value: V | null;
  display?: React.ReactNode;
  options: Option<V>[];
  onChange: (value: V) => void;
  cell: string;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
}) {
  return (
    <Select value={value ?? undefined} onValueChange={(v) => v !== value && onChange(v as V)} disabled={disabled}>
      <SelectTrigger
        data-cell={cell}
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && moveFocus(e.currentTarget, e.key)) {
            e.preventDefault();
          }
        }}
        className={cn(cellBase, "border-0 bg-transparent shadow-none data-[size=default]:h-9 dark:bg-transparent [&>svg:last-child]:opacity-0 hover:[&>svg:last-child]:opacity-60 focus-visible:[&>svg:last-child]:opacity-60")}
      >
        <span className="min-w-0 flex-1 truncate">
          {display ?? options.find((o) => o.value === value)?.node ?? options.find((o) => o.value === value)?.label ?? (
            <span className="text-muted-foreground">{placeholder ?? "選択"}</span>
          )}
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="min-w-[var(--radix-select-trigger-width)]">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.node ?? o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * 企業名セル。名前クリックで詳細へ、Enter / F2 / ダブルクリック / 鉛筆アイコン / 文字入力で編集。
 * Enter・フォーカス移動で確定、Esc で取り消し。
 */
export function CompanyNameCell({
  value,
  href,
  onCommit,
  cell,
  disabled,
  badge,
}: {
  value: string;
  href: string;
  onCommit: (value: string) => void;
  cell: string;
  disabled?: boolean;
  badge?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function start(initial?: string) {
    if (disabled) return;
    cancelled.current = false;
    setDraft(initial ?? value);
    setError("");
    setEditing(true);
  }

  function commit() {
    if (cancelled.current) return;
    const v = draft.trim();
    if (!v) {
      setError("企業名を入力してください");
      inputRef.current?.focus();
      return;
    }
    if (v.length > 200) {
      setError("200文字以内で入力してください");
      inputRef.current?.focus();
      return;
    }
    setEditing(false);
    if (v !== value) onCommit(v);
    requestAnimationFrame(() => cellRef.current?.focus());
  }

  if (editing) {
    return (
      <div className="relative">
        <input
          ref={inputRef}
          value={draft}
          aria-label="企業名"
          aria-invalid={Boolean(error)}
          maxLength={200}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              cancelled.current = true;
              setEditing(false);
              requestAnimationFrame(() => cellRef.current?.focus());
            }
          }}
          className="h-9 w-full rounded-sm border border-ring bg-background px-2 text-sm outline-none ring-2 ring-ring/30"
        />
        {error && <p className="absolute left-0 top-full z-10 mt-1 rounded bg-destructive px-2 py-1 text-xs text-white shadow">{error}</p>}
      </div>
    );
  }

  return (
    <div
      ref={cellRef}
      tabIndex={0}
      role="gridcell"
      data-cell={cell}
      aria-label={`企業名: ${value}`}
      onDoubleClick={() => start()}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
          if (moveFocus(e.currentTarget, e.key)) e.preventDefault();
        } else if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          start();
        } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          start(e.key);
        }
      }}
      className={cn(cellBase, "group cursor-default")}
    >
      <Link
        href={href}
        tabIndex={-1}
        className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {value}
      </Link>
      {badge}
      {!disabled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="企業名を編集"
          onClick={() => start()}
          className="ml-auto rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function ChevronHint() {
  return <ChevronDown className="size-3.5 opacity-50" />;
}
