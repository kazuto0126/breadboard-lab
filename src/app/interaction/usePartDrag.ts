import { useCallback, type PointerEvent as ReactPointerEvent } from 'react';
import { getComponentDefinition } from '../../core/circuit/library';
import type { ComponentInstance } from '../../types/component';
import { placeComponent } from '../commands/commands';
import { checkPlacement } from '../geometry/placement';
import { anchorCenteredAt } from '../geometry/snap';
import type { Ghost, PartTemplate } from '../model/editorTypes';
import { BOARD_ID } from '../model/projectFile';
import { useEditor } from '../store/editorStore';
import { clientToBoardLattice } from './boardRegistry';
import { CLICK_TOLERANCE_PX } from './pressPlan';

/** 元件庫方塊：拖到板子上放置；原地點一下則拿起元件，之後點板子放置。 */
export function usePartDrag(part: PartTemplate) {
  return useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || useEditor.getState().mode !== 'edit') return;
      const def = getComponentDefinition(part.defId);
      if (!def) return;
      e.preventDefault();
      const pointerId = e.pointerId;
      const start = { x: e.clientX, y: e.clientY };
      let dragging = false;

      const ghostAt = (clientX: number, clientY: number): Ghost | null => {
        const s = useEditor.getState();
        const lattice = clientToBoardLattice(clientX, clientY, s.viewport);
        if (!lattice) return null;
        const instance: ComponentInstance = {
          id: '__ghost__',
          defId: part.defId,
          boardId: BOARD_ID,
          anchor: anchorCenteredAt(def, 0, undefined, lattice),
          rotation: 0,
          props: { ...part.props },
        };
        const check = checkPlacement(s.doc.circuit, instance);
        return { instance, valid: check.ok, reason: check.ok ? null : check.reason };
      };

      const detach = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < CLICK_TOLERANCE_PX) return;
        dragging = true;
        useEditor.getState().setGhost(ghostAt(ev.clientX, ev.clientY));
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        detach();
        const s = useEditor.getState();
        if (!dragging) {
          s.setArmedPart(part);
          s.notify(`點一下麵包板放置 ${part.label}`, 'info');
          return;
        }
        const ghost = ghostAt(ev.clientX, ev.clientY);
        s.setGhost(null);
        if (!ghost) return;
        if (!ghost.valid) {
          s.notify(`這裡放不下：${ghost.reason}`, 'error');
          return;
        }
        s.run((doc) => placeComponent(doc, part.defId, ghost.instance.anchor, part.props));
      };

      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        detach();
        useEditor.getState().setGhost(null);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [part],
  );
}
