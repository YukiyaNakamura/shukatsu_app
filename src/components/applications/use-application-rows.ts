"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ClientApiError, errorMessage } from "@/lib/api-client";
import { STEP_TYPE_LABELS } from "@/lib/constants";
import type { ApplicationFieldsInput } from "@/lib/validations/application";
import type { ApplicationOverviewRow, ApplicationStatus, SelectionType, StepType } from "@/types/database";

export type Row = ApplicationOverviewRow;

export type RowChange =
  | { kind: "fields"; changes: Pick<ApplicationFieldsInput, "companyName" | "selectionType" | "status"> }
  | { kind: "stage"; stepType: StepType };

export type SaveState =
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string; change: RowChange }
  | { status: "conflict"; change: RowChange; latest: Row | null };

function applyLocal(row: Row, change: RowChange): Row {
  if (change.kind === "stage") {
    return { ...row, current_step_type: change.stepType, current_step_name: STEP_TYPE_LABELS[change.stepType] };
  }
  const c = change.changes;
  return {
    ...row,
    company_name: c.companyName ?? row.company_name,
    selection_type: c.selectionType ?? row.selection_type,
    is_early_selection: c.selectionType === "INTERNSHIP" ? false : row.is_early_selection,
    status: c.status ?? row.status,
  };
}

export type CreateInput = {
  companyName: string;
  selectionType: SelectionType;
  status: ApplicationStatus;
  studentId?: string;
};

/**
 * 応募一覧の状態管理。
 *  - 行ごとに保存をキューイングし、自分自身の連続編集で競合しないようにする
 *  - version は ref で同期的に追跡し、常に最新の expectedVersion を送る
 *  - 409 のときは入力内容 (change) を保持したまま最新データを取得してユーザーに判断を委ねる
 */
export function useApplicationRows(initialRows: Row[]) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState | undefined>>({});
  const versions = useRef<Record<string, number>>(Object.fromEntries(initialRows.map((r) => [r.id, r.version])));
  const queues = useRef<Record<string, Promise<void>>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setState = useCallback((id: string, state: SaveState | undefined) => {
    clearTimeout(timers.current[id]);
    setSaveStates((prev) => ({ ...prev, [id]: state }));
    if (state?.status === "saved") {
      timers.current[id] = setTimeout(() => setSaveStates((prev) => ({ ...prev, [id]: undefined })), 2500);
    }
  }, []);

  const replaceRow = useCallback((row: Row) => {
    versions.current[row.id] = row.version;
    setRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [row, ...prev]));
  }, []);

  const fetchLatest = useCallback(async (id: string): Promise<Row | null> => {
    try {
      const detail = await api<{ overview: Row | null }>(`/api/v1/applications/${id}`);
      return detail.overview;
    } catch {
      return null;
    }
  }, []);

  const runSave = useCallback(
    async (id: string, change: RowChange) => {
      const expectedVersion = versions.current[id];
      setState(id, { status: "saving" });
      try {
        const res =
          change.kind === "fields"
            ? await api<{ overview: Row | null }>(`/api/v1/applications/${id}`, {
                method: "PATCH",
                body: { expectedVersion, changes: change.changes },
              })
            : await api<{ overview: Row | null }>(`/api/v1/applications/${id}/current-step`, {
                method: "PATCH",
                body: { expectedVersion, stepType: change.stepType },
              });
        if (res.overview) replaceRow(res.overview);
        setState(id, { status: "saved" });
      } catch (error) {
        if (error instanceof ClientApiError && error.isConflict) {
          setState(id, { status: "conflict", change, latest: await fetchLatest(id) });
        } else if (error instanceof ClientApiError && (error.status === 404 || error.status === 410)) {
          setState(id, { status: "error", message: error.message, change });
        } else {
          setState(id, { status: "error", message: errorMessage(error), change });
        }
      }
    },
    [fetchLatest, replaceRow, setState],
  );

  const save = useCallback(
    (id: string, change: RowChange) => {
      setRows((prev) => prev.map((r) => (r.id === id ? applyLocal(r, change) : r)));
      const prevQueue = queues.current[id] ?? Promise.resolve();
      const next = prevQueue.then(() => runSave(id, change));
      queues.current[id] = next;
      return next;
    },
    [runSave],
  );

  const retry = useCallback(
    (id: string) => {
      const state = saveStates[id];
      if (state && (state.status === "error" || state.status === "conflict")) void save(id, state.change);
    },
    [save, saveStates],
  );

  /** 競合: 自分の変更を破棄して最新を表示 */
  const discardMine = useCallback(
    async (id: string) => {
      const state = saveStates[id];
      const latest = (state?.status === "conflict" && state.latest) || (await fetchLatest(id));
      if (latest) replaceRow(latest);
      setState(id, undefined);
    },
    [fetchLatest, replaceRow, saveStates, setState],
  );

  /** 競合: 最新の version を確認したうえで自分の変更を適用 */
  const overwrite = useCallback(
    async (id: string) => {
      const state = saveStates[id];
      if (state?.status !== "conflict") return;
      const latest = state.latest ?? (await fetchLatest(id));
      if (latest) versions.current[id] = latest.version;
      void save(id, state.change);
    },
    [fetchLatest, save, saveStates],
  );

  const create = useCallback(
    async (input: CreateInput) => {
      const row = await api<Row>("/api/v1/applications", { method: "POST", body: input });
      replaceRow(row);
      return row;
    },
    [replaceRow],
  );

  const restore = useCallback(
    async (id: string) => {
      try {
        const row = await api<Row>(`/api/v1/applications/${id}/restore`, { method: "POST" });
        replaceRow(row);
        toast.success("応募を復元しました");
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [replaceRow],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const res = await api<{ deletedAt: string; version: number }>(`/api/v1/applications/${id}`, { method: "DELETE" });
        versions.current[id] = res.version;
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, deleted_at: res.deletedAt, version: res.version } : r)));
        toast("応募を削除しました", { action: { label: "元に戻す", onClick: () => void restore(id) } });
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [restore],
  );

  return { rows, saveStates, save, retry, discardMine, overwrite, create, remove, restore };
}
