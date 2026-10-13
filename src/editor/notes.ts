import type { Circuit, Note, NoteColor } from '../types/circuit';

/** 規格（2026-10-13 notes）第 2 節：便條的編輯動作。沒有改變時回傳原本的 Circuit。 */
export const NOTE_MAX = 200;
export const NOTE_WIDTH_MM = 30.48;
export const NOTE_COLORS: NoteColor[] = ['yellow', 'blue', 'green', 'pink'];

const PITCH = 2.54;
/** 對齊 0.1 吋格點（避免浮點誤差，取到 0.01 mm）。 */
const snap = (mm: number) => Math.round(Math.round(mm / PITCH) * PITCH * 100) / 100 || 0;

function withNotes(circuit: Circuit, notes: Note[]): Circuit {
  if (notes.length > 0) return { ...circuit, notes };
  const { notes: _gone, ...rest } = circuit;
  return rest;
}

function update(circuit: Circuit, id: string, change: (n: Note) => Note): Circuit {
  const list = circuit.notes ?? [];
  const i = list.findIndex((n) => n.id === id);
  if (i < 0) return circuit;
  const next = change(list[i]);
  if (next === list[i]) return circuit;
  const notes = list.slice();
  notes[i] = next;
  return { ...circuit, notes };
}

export function nextNoteId(circuit: Circuit): string {
  const used = new Set((circuit.notes ?? []).map((n) => n.id));
  for (let i = 1; ; i++) if (!used.has(`n${i}`)) return `n${i}`;
}

export function addNote(circuit: Circuit, x: number, y: number): { circuit: Circuit; id: string } {
  const id = nextNoteId(circuit);
  const note: Note = { id, x: snap(x), y: snap(y), text: '', color: 'yellow' };
  return { circuit: { ...circuit, notes: [...(circuit.notes ?? []), note] }, id };
}

export function moveNote(circuit: Circuit, id: string, x: number, y: number): Circuit {
  const nx = snap(x);
  const ny = snap(y);
  return update(circuit, id, (n) => (n.x === nx && n.y === ny ? n : { ...n, x: nx, y: ny }));
}

export function setNoteText(circuit: Circuit, id: string, text: string): Circuit {
  const value = text.trim().slice(0, NOTE_MAX);
  return update(circuit, id, (n) => (n.text === value ? n : { ...n, text: value }));
}

export function setNoteColor(circuit: Circuit, id: string, color: NoteColor): Circuit {
  if (!NOTE_COLORS.includes(color)) return circuit;
  return update(circuit, id, (n) => (n.color === color ? n : { ...n, color }));
}

/** 指向一個元件（null 是不指向）；元件不存在時不變。 */
export function setNoteTarget(circuit: Circuit, id: string, target: string | null): Circuit {
  if (target !== null && !circuit.components.some((c) => c.id === target)) return circuit;
  return update(circuit, id, (n) => {
    if ((n.target ?? null) === target) return n;
    const { target: _old, ...rest } = n;
    return target === null ? rest : { ...rest, target };
  });
}

export function removeNote(circuit: Circuit, id: string): Circuit {
  const list = circuit.notes ?? [];
  if (!list.some((n) => n.id === id)) return circuit;
  return withNotes(circuit, list.filter((n) => n.id !== id));
}

/** 元件刪除後，指向它的便條拿掉指向（沒有受影響時回傳原本的陣列）。 */
export function dropNoteTargets(notes: Note[] | undefined, removed: Set<string>): Note[] | undefined {
  if (!notes || !notes.some((n) => n.target !== undefined && removed.has(n.target))) return notes;
  return notes.map((n) => {
    if (n.target === undefined || !removed.has(n.target)) return n;
    const { target: _old, ...rest } = n;
    return rest;
  });
}
