import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MM_TO_PX } from '../../editor/geometry';
import { screenToWorld } from '../../editor/viewport';
import { useStore } from '../../state/store';

/** 拖曳多遠才算拿起來（px）；沒拖就放開 = 放在畫面中間。 */
const PICK_DISTANCE = 6;

/** 放開的位置在麵包板畫布上時，回傳世界座標（mm）。 */
function dropPoint(clientX: number, clientY: number): { x: number; y: number } | null {
  const svg = document.getElementById('bbl-board-svg');
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
  const w = screenToWorld(useStore.getState().viewport, clientX - r.left, clientY - r.top);
  return { x: w.x / MM_TO_PX, y: w.y / MM_TO_PX };
}

/** 規格（2026-10-13 notes）子專案 20：元件庫裡的便條，拖到麵包板上放置，或點一下放在畫面中間。 */
export function NoteCard() {
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const origin = { x: e.clientX, y: e.clientY };
    const pointerId = e.pointerId;
    let dragging = false;
    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      setGhost(null);
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - origin.x;
      const dy = ev.clientY - origin.y;
      // 觸控時上下滑是捲動清單，只有往旁邊拖才拿起來。
      if (!dragging && (Math.hypot(dx, dy) < PICK_DISTANCE || (ev.pointerType !== 'mouse' && Math.abs(dx) < Math.abs(dy)))) return;
      dragging = true;
      setGhost({ x: ev.clientX, y: ev.clientY });
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      finish();
      const s = useStore.getState();
      if (!dragging) {
        s.addNoteAtCenter();
        if (s.drawer === 'library') s.toggleDrawer(null);
        return;
      }
      const at = dropPoint(ev.clientX, ev.clientY);
      // 游標在便條左上角附近一點，放下的位置和拖曳時看到的一樣。
      if (at) s.addNoteAt(at.x - 1.27, at.y - 1.27);
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  return (
    <section className="mx-2 mb-3 mt-1">
      <button
        type="button"
        data-library-item="note"
        onPointerDown={onPointerDown}
        title="拖曳到麵包板上放一張便條，或點一下放在畫面中間（快捷鍵 N）"
        className="flex w-full cursor-grab items-center gap-2 rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-left hover:bg-slate-800 active:cursor-grabbing"
      >
        <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-sm bg-yellow-200 text-[10px] font-bold text-yellow-900 shadow">文字</span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-slate-100">便條 Note</span>
          <span className="block text-[11px] leading-4 text-slate-400">拖到麵包板上，寫實驗步驟或提醒</span>
        </span>
      </button>
      {ghost && (
        <div
          data-testid="note-ghost"
          className="pointer-events-none fixed z-50 rounded-md border border-yellow-600 bg-yellow-200/90 px-2 py-1 text-xs text-yellow-900 shadow-lg"
          style={{ left: ghost.x - 6, top: ghost.y - 6 }}
        >
          便條
        </div>
      )}
    </section>
  );
}
