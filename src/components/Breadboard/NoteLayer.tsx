import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { MM_TO_PX, type BoardFrame } from '../../editor/geometry';
import { NOTE_MAX, NOTE_WIDTH_MM } from '../../editor/notes';
import { useStore } from '../../state/store';
import type { Circuit, Note, NoteColor } from '../../types/circuit';
import { componentRect } from './overlays';

export const NOTE_FILL: Record<NoteColor, { bg: string; edge: string }> = {
  yellow: { bg: '#fef08a', edge: '#ca8a04' },
  blue: { bg: '#bfdbfe', edge: '#2563eb' },
  green: { bg: '#bbf7d0', edge: '#16a34a' },
  pink: { bg: '#fbcfe8', edge: '#db2777' },
};
const WIDTH = NOTE_WIDTH_MM * MM_TO_PX;
/** foreignObject 的高度上限（實際高度由內容決定）。 */
const MAX_HEIGHT = 600;
/** 最窄 3 格。 */
const MIN_WIDTH = 3 * 2.54 * MM_TO_PX;

interface Drag {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
}

/** 編輯中的便條：textarea；失焦、Esc、Ctrl+Enter 結束。 */
function Editor({ note }: { note: Note }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    useStore.getState().finishNoteEdit(ref.current?.value ?? '');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      finish();
    }
  };
  return (
    <textarea
      ref={ref}
      aria-label="便條內容"
      defaultValue={note.text}
      maxLength={NOTE_MAX}
      rows={4}
      onBlur={finish}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      className="block w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-[18px] text-slate-900 outline-none"
    />
  );
}

/** 規格（2026-10-13 notes）第 5 節：便條（畫在導線上層）與指向元件的虛線。 */
export function NoteLayer({ circuit, frames }: { circuit: Circuit; frames: BoardFrame[] }) {
  const selection = useStore((s) => s.selection);
  const editing = useStore((s) => s.editingNote);
  const [drag, setDrag] = useState<Drag | null>(null);
  const notes = circuit.notes ?? [];
  if (notes.length === 0) return null;

  const onDown = (e: ReactPointerEvent<HTMLDivElement>, note: Note) => {
    const s = useStore.getState();
    // 正在放置元件：讓畫布照常處理（放在便條底下的位置）。
    if (s.placing || e.button !== 0 || editing === note.id) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: note.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false });
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const scale = useStore.getState().viewport.scale;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3 });
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>, note: Note) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const s = useStore.getState();
    if (drag.moved) s.moveNote(note.id, note.x + drag.dx / MM_TO_PX, note.y + drag.dy / MM_TO_PX);
    else s.select({ kind: 'note', id: note.id });
    setDrag(null);
  };

  return (
    <g data-ui="notes">
      {notes.map((note) => {
        const moving = drag?.id === note.id && drag.moved;
        const x = note.x * MM_TO_PX + (moving ? drag.dx : 0);
        const y = note.y * MM_TO_PX + (moving ? drag.dy : 0);
        const target = note.target ? circuit.components.find((c) => c.id === note.target) : undefined;
        const rect = target ? componentRect(frames, target) : null;
        return rect ? (
          <line
            key={`arrow-${note.id}`}
            data-note-arrow={note.id}
            x1={x + 16}
            y1={y + 12}
            x2={rect.x + rect.width / 2}
            y2={rect.y + rect.height / 2}
            stroke={NOTE_FILL[note.color].edge}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            pointerEvents="none"
          />
        ) : null;
      })}
      {notes.map((note) => {
        const moving = drag?.id === note.id && drag.moved;
        const x = note.x * MM_TO_PX + (moving ? drag.dx : 0);
        const y = note.y * MM_TO_PX + (moving ? drag.dy : 0);
        const selected = selection?.kind === 'note' && selection.id === note.id;
        const fill = NOTE_FILL[note.color];
        return (
          <foreignObject key={note.id} x={x} y={y} width={WIDTH} height={MAX_HEIGHT} style={{ pointerEvents: 'none', overflow: 'visible' }}>
            <div
              data-note={note.id}
              onPointerDown={(e) => onDown(e, note)}
              onPointerMove={onMove}
              onPointerUp={(e) => onUp(e, note)}
              onPointerCancel={() => setDrag(null)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                useStore.getState().startNoteEdit(note.id);
              }}
              style={{
                pointerEvents: 'auto',
                // 子專案 20：寬度跟著文字（最寬 12 格，超過換行）；編輯中固定最寬，方便打字。
                width: editing === note.id ? WIDTH : 'max-content',
                maxWidth: WIDTH,
                minWidth: MIN_WIDTH,
                background: fill.bg,
                borderColor: selected ? '#0284c7' : fill.edge,
                opacity: moving ? 0.7 : 0.9,
                cursor: editing === note.id ? 'text' : 'move',
              }}
              className={`whitespace-pre-wrap break-words rounded-md px-2 py-1.5 text-[13px] leading-[18px] text-slate-900 shadow-md ${selected ? 'border-2' : 'border'}`}
            >
              {editing === note.id ? <Editor note={note} /> : note.text || <span className="text-slate-500">（空白便條，雙擊輸入文字）</span>}
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}
