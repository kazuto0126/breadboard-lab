/** 一筆歷史紀錄：執行 label 這個動作「之前」（undo 堆疊）或「之後」（redo 堆疊）的狀態。 */
export interface HistoryEntry<T> {
  state: T;
  label: string;
}

export interface History<T> {
  past: HistoryEntry<T>[];
  future: HistoryEntry<T>[];
}

export const HISTORY_LIMIT = 200;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** 記錄一個動作：把目前狀態推進 undo 堆疊，並清空 redo 堆疊。 */
export function record<T>(history: History<T>, present: T, label: string, limit = HISTORY_LIMIT): History<T> {
  const past = [...history.past, { state: present, label }];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

export interface HistoryStep<T> {
  history: History<T>;
  state: T;
  label: string;
}

export function undo<T>(history: History<T>, present: T): HistoryStep<T> | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, { state: present, label: entry.label }] },
    state: entry.state,
    label: entry.label,
  };
}

export function redo<T>(history: History<T>, present: T): HistoryStep<T> | null {
  const entry = history.future[history.future.length - 1];
  if (!entry) return null;
  return {
    history: { past: [...history.past, { state: present, label: entry.label }], future: history.future.slice(0, -1) },
    state: entry.state,
    label: entry.label,
  };
}

export function undoLabel<T>(history: History<T>): string | null {
  return history.past[history.past.length - 1]?.label ?? null;
}

export function redoLabel<T>(history: History<T>): string | null {
  return history.future[history.future.length - 1]?.label ?? null;
}
