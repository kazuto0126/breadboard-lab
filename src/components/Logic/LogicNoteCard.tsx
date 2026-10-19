import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { screenToWorld } from '../../editor/viewport';
import { LOGIC_CELL, useLogic } from '../../state/logic';
import { useStore } from '../../state/store';

/** 拖曳多遠才算拿起來（px）；沒拖就放開 = 放在畫面中間。 */
const PICK_DISTANCE = 6;

/** 放開的位置在邏輯圖畫布上時，回傳格子座標。 */
function dropPoint(clientX: number, clientY: number): { x: number; y: number } | null {
  const svg = document.querySelector('[data-testid="logic-canvas"]');
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
  const w = screenToWorld(useLogic.getState().viewport, clientX - r.left, clientY - r.top);
  return { x: w.x / LOGIC_CELL, y: w.y / LOGIC_CELL };
}

/** 子專案 29：邏輯圖元件庫的便條，拖到畫布上放置，或點一下放在畫面中間（和麵包板的便條一樣）。 */
export function LogicNoteCard() {
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
      const l = useLogic.getState();
      if (!dragging) {
        l.addNoteAtCenter();
        if (useStore.getState().drawer === 'library') useStore.getState().toggleDrawer(null);
        return;
      }
      const at = dropPoint(ev.clientX, ev.clientY);
      if (at) l.addNoteAt(at.x - 0.5, at.y - 0.5);
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        data-logic-part="NOTE"
        onPointerDown={onPointerDown}
        title="拖曳到邏輯圖上放一張便條，或點一下放在畫面中間"
        className="flex w-full cursor-grab items-center gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-left hover:bg-slate-800 active:cursor-grabbing"
      >
        <span className="flex h-6 w-10 shrink-0 items-center justify-center rounded-sm bg-yellow-200 text-[10px] font-bold text-yellow-900 shadow">文字</span>
        <span className="min-w-0">
          <span className="block text-[12px] font-medium leading-4 text-slate-100">便條</span>
          <span className="block truncate text-[10px] leading-4 text-slate-400">寫說明或提醒，可以指向一個元件</span>
        </span>
      </button>
      {ghost && (
        <div
          data-testid="logic-note-ghost"
          className="pointer-events-none fixed z-50 rounded-md border border-yellow-600 bg-yellow-200/90 px-2 py-1 text-xs text-yellow-900 shadow-lg"
          style={{ left: ghost.x - 6, top: ghost.y - 6 }}
        >
          便條
        </div>
      )}
    </div>
  );
}
