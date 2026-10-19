import { NOTE_COLORS, NOTE_MAX } from '../editor/notes';
import type { NoteColor } from '../types/circuit';
import type { LogicDiagram, LogicNote } from './types';

/**
 * 子專案 29（規格 2026-10-18 small-features 第 29 節）：邏輯圖上的便條。和麵包板的便條一樣（文字、顏色、指向一個元件），
 * 但位置是格子座標（整數）。沒有改變時回傳原本的圖。
 */
function withNotes(d: LogicDiagram, notes: LogicNote[]): LogicDiagram {
  if (notes.length > 0) return { ...d, notes };
  const { notes: _gone, ...rest } = d;
  return rest;
}

function update(d: LogicDiagram, id: string, change: (n: LogicNote) => LogicNote): LogicDiagram {
  const list = d.notes ?? [];
  const i = list.findIndex((n) => n.id === id);
  if (i < 0) return d;
  const next = change(list[i]);
  if (next === list[i]) return d;
  const notes = list.slice();
  notes[i] = next;
  return { ...d, notes };
}

export function addLogicNote(d: LogicDiagram, x: number, y: number): { diagram: LogicDiagram; id: string } {
  const used = new Set((d.notes ?? []).map((n) => n.id));
  let k = 1;
  while (used.has(`n${k}`)) k++;
  const id = `n${k}`;
  const note: LogicNote = { id, x: Math.round(x), y: Math.round(y), text: '', color: 'yellow' };
  return { diagram: { ...d, notes: [...(d.notes ?? []), note] }, id };
}

export function moveLogicNote(d: LogicDiagram, id: string, x: number, y: number): LogicDiagram {
  const nx = Math.round(x);
  const ny = Math.round(y);
  return update(d, id, (n) => (n.x === nx && n.y === ny ? n : { ...n, x: nx, y: ny }));
}

export function setLogicNoteText(d: LogicDiagram, id: string, text: string): LogicDiagram {
  const value = text.trim().slice(0, NOTE_MAX);
  return update(d, id, (n) => (n.text === value ? n : { ...n, text: value }));
}

export function setLogicNoteColor(d: LogicDiagram, id: string, color: NoteColor): LogicDiagram {
  if (!NOTE_COLORS.includes(color)) return d;
  return update(d, id, (n) => (n.color === color ? n : { ...n, color }));
}

/** 指向一個元件（null 是不指向）；元件不存在時不變。 */
export function setLogicNoteTarget(d: LogicDiagram, id: string, target: string | null): LogicDiagram {
  if (target !== null && !d.nodes.some((n) => n.id === target)) return d;
  return update(d, id, (n) => {
    if ((n.target ?? null) === target) return n;
    const { target: _old, ...rest } = n;
    return target === null ? rest : { ...rest, target };
  });
}

export function removeLogicNote(d: LogicDiagram, id: string): LogicDiagram {
  const list = d.notes ?? [];
  if (!list.some((n) => n.id === id)) return d;
  return withNotes(d, list.filter((n) => n.id !== id));
}

/** 元件刪除後，指向它的便條拿掉指向（沒有受影響時回傳原本的陣列）。 */
export function dropLogicNoteTargets(notes: LogicNote[] | undefined, removed: Set<string>): LogicNote[] | undefined {
  if (!notes || !notes.some((n) => n.target !== undefined && removed.has(n.target))) return notes;
  return notes.map((n) => {
    if (n.target === undefined || !removed.has(n.target)) return n;
    const { target: _old, ...rest } = n;
    return rest;
  });
}

/** 讀檔時檢查便條；格式不對時回傳原因。指向不存在的元件時忽略指向，文字太長截斷。 */
export function parseLogicNotes(raw: unknown, nodeIds: Set<string>): { ok: true; notes: LogicNote[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw)) return { ok: false, reason: '便條格式不對' };
  const notes: LogicNote[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || typeof (item as { id?: unknown }).id !== 'string') return { ok: false, reason: '便條格式不對' };
    const n = item as Record<string, unknown>;
    const id = n.id as string;
    if (ids.has(id)) return { ok: false, reason: `便條 id ${id} 重複` };
    ids.add(id);
    if (!Number.isInteger(n.x) || !Number.isInteger(n.y)) return { ok: false, reason: `便條 ${id} 的位置要是整數` };
    if (typeof n.text !== 'string') return { ok: false, reason: `便條 ${id} 的文字格式不對` };
    if (!NOTE_COLORS.includes(n.color as NoteColor)) return { ok: false, reason: `便條 ${id} 的顏色不認得（${String(n.color)}）` };
    const note: LogicNote = { id, x: n.x as number, y: n.y as number, text: (n.text as string).slice(0, NOTE_MAX), color: n.color as NoteColor };
    if (typeof n.target === 'string' && nodeIds.has(n.target)) note.target = n.target;
    notes.push(note);
  }
  return { ok: true, notes };
}
