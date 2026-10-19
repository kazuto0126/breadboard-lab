import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { NOTE_MAX } from '../../editor/notes';
import { bodyRect } from '../../logic/shapes';
import type { LogicDiagram, LogicNote } from '../../logic/types';
import { LOGIC_CELL as C, useLogic } from '../../state/logic';
import { NOTE_FILL } from '../Breadboard/NoteLayer';

/** 最寬 12 格（和麵包板的便條一樣寬）、最窄 3 格。 */
const WIDTH = 12 * C;
const MIN_WIDTH = 3 * C;
const MAX_HEIGHT = 600;

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
function Editor({ note }: { note: LogicNote }) {
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
    useLogic.getState().finishNoteEdit(ref.current?.value ?? '');
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

/**
 * 子專案 29（規格 2026-10-18 small-features 第 29 節）：邏輯圖上的便條（畫在元件上層）與指向元件的虛線。
 * 拖曳移動、點一下選取、雙擊直接改字；寬度跟著文字。
 */
export function LogicNoteLayer({ diagram }: { diagram: LogicDiagram }) {
  const selection = useLogic((s) => s.selection);
  const editing = useLogic((s) => s.editingNote);
  const [drag, setDrag] = useState<Drag | null>(null);
  const notes = diagram.notes ?? [];
  if (notes.length === 0) return null;

  const onDown = (e: ReactPointerEvent<HTMLDivElement>, note: LogicNote) => {
    if (useLogic.getState().placing || e.button !== 0 || editing === note.id) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: note.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false });
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const scale = useLogic.getState().viewport.scale;
    setDrag({ ...drag, dx: (e.clientX - drag.startX) / scale, dy: (e.clientY - drag.startY) / scale, moved: drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 3 });
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>, note: LogicNote) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const s = useLogic.getState();
    if (drag.moved) s.moveNote(note.id, note.x + drag.dx / C, note.y + drag.dy / C);
    else s.select({ kind: 'note', id: note.id });
    setDrag(null);
  };
  const at = (note: LogicNote) => {
    const moving = drag?.id === note.id && drag.moved;
    return { x: note.x * C + (moving ? drag.dx : 0), y: note.y * C + (moving ? drag.dy : 0), moving };
  };

  return (
    <g data-ui="logic-notes">
      {notes.map((note) => {
        const target = note.target ? diagram.nodes.find((n) => n.id === note.target) : undefined;
        if (!target) return null;
        const r = bodyRect(target);
        const { x, y } = at(note);
        return (
          <line
            key={`arrow-${note.id}`}
            data-logic-note-arrow={note.id}
            x1={x + 16}
            y1={y + 12}
            x2={((r.x0 + r.x1) / 2) * C}
            y2={((r.y0 + r.y1) / 2) * C}
            stroke={NOTE_FILL[note.color].edge}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            pointerEvents="none"
          />
        );
      })}
      {notes.map((note) => {
        const { x, y, moving } = at(note);
        const selected = selection?.kind === 'note' && selection.id === note.id;
        const fill = NOTE_FILL[note.color];
        return (
          <foreignObject key={note.id} x={x} y={y} width={WIDTH} height={MAX_HEIGHT} style={{ pointerEvents: 'none', overflow: 'visible' }}>
            <div
              data-logic-note={note.id}
              onPointerDown={(e) => onDown(e, note)}
              onPointerMove={onMove}
              onPointerUp={(e) => onUp(e, note)}
              onPointerCancel={() => setDrag(null)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                useLogic.getState().startNoteEdit(note.id);
              }}
              style={{
                pointerEvents: 'auto',
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
