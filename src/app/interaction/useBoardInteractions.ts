import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import { addWire, moveComponent, placeComponent } from '../commands/commands';
import { hitTest, type Hit } from '../geometry/hitTest';
import { checkPlacement, isFreeHole } from '../geometry/placement';
import { anchorCenteredAt, snapAnchor } from '../geometry/snap';
import { lPath } from '../geometry/wirePath';
import type { Viewport } from '../model/editorTypes';
import { BOARD_ID } from '../model/projectFile';
import { useEditor } from '../store/editorStore';
import { CLICK_TOLERANCE_PX, LONG_PRESS_MS, planPress, restrictPlan, wireOrientation, type PressPlan } from './pressPlan';
import { isTextTarget } from './useKeyboardShortcuts';
import { panBy, pinchViewport, screenToGridPoint, screenToLattice, WHEEL_FACTOR, zoomAt, type ScreenPoint } from './viewport';

export interface ContextMenuState {
  x: number;
  y: number;
  hit: Hit;
}

export interface BoardInteractionOptions {
  circuit: Circuit;
  editable: boolean;
  selectable: boolean;
}

interface Session {
  pointerId: number;
  start: ScreenPoint;
  plan: PressPlan;
  startPoint: GridPoint;
  dragging: boolean;
  grab: { dx: number; dy: number } | null;
  horizontalFirst: boolean | null;
  startViewport: Viewport;
  longPress: ReturnType<typeof setTimeout> | null;
}

interface Pinch {
  ids: [number, number];
  start: [ScreenPoint, ScreenPoint];
  startViewport: Viewport;
}

const PAN_ONLY: PressPlan = { click: null, drag: 'pan', componentId: null };

/** 規格第 6.2 節的指標狀態機：點擊選取、拖曳移動元件／接線／平移、滾輪縮放、兩指縮放、長按與右鍵選單。 */
export function useBoardInteractions({ circuit, editable, selectable }: BoardInteractionOptions) {
  const svg = useRef<SVGSVGElement | null>(null);
  const [svgElement, setSvgElement] = useState<SVGSVGElement | null>(null);
  const session = useRef<Session | null>(null);
  const pinch = useRef<Pinch | null>(null);
  const pointers = useRef(new Map<number, ScreenPoint>());
  const spaceHeld = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const ref = useCallback((el: SVGSVGElement | null) => {
    svg.current = el;
    setSvgElement(el);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTextTarget(e.target)) spaceHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (!svgElement) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svgElement.getBoundingClientRect();
      const s = useEditor.getState();
      s.setViewport(zoomAt(s.viewport, e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR, e.clientX - rect.left, e.clientY - rect.top));
    };
    svgElement.addEventListener('wheel', onWheel, { passive: false });
    return () => svgElement.removeEventListener('wheel', onWheel);
  }, [svgElement]);

  const local = (e: { clientX: number; clientY: number }): ScreenPoint => {
    const rect = svg.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const clearTransient = () => {
    const s = useEditor.getState();
    s.setGhost(null);
    s.setWirePreview(null);
  };

  const endSession = () => {
    const current = session.current;
    if (current?.longPress) clearTimeout(current.longPress);
    session.current = null;
  };

  const openMenu = (clientX: number, clientY: number, point: GridPoint) => {
    if (!editable) return;
    const hit = hitTest(circuit, point);
    if (hit.kind !== 'pin' && hit.kind !== 'component' && hit.kind !== 'wire') return;
    useEditor.getState().select(hit.kind === 'wire' ? { kind: 'wire', id: hit.wireId } : { kind: 'component', id: hit.componentId });
    setContextMenu({ x: clientX, y: clientY, hit });
  };

  const placeArmedPart = (at: ScreenPoint) => {
    const s = useEditor.getState();
    const part = s.armedPart;
    const def = part ? getComponentDefinition(part.defId) : undefined;
    if (!part || !def) return;
    const anchor = anchorCenteredAt(def, 0, undefined, screenToLattice(s.viewport, at.x, at.y));
    if (s.run((doc) => placeComponent(doc, part.defId, anchor, part.props))) s.setArmedPart(null);
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 合成事件或已結束的指標
    }
    setContextMenu(null);
    if (pointers.current.size >= 2) {
      endSession();
      clearTransient();
      const [[idA, a], [idB, b]] = [...pointers.current.entries()];
      pinch.current = { ids: [idA, idB], start: [a, b], startViewport: useEditor.getState().viewport };
      return;
    }
    const s = useEditor.getState();
    const point = screenToGridPoint(s.viewport, p.x, p.y, BOARD_ID);
    const panOnly = e.button === 1 || spaceHeld.current;
    let plan = PAN_ONLY;
    if (!panOnly) {
      const hit = hitTest(circuit, point);
      plan = restrictPlan(planPress(hit, hit.kind === 'hole' && isFreeHole(circuit, point)), editable, selectable);
    }
    let grab: Session['grab'] = null;
    if (plan.drag === 'move' && plan.componentId) {
      const c = circuit.components.find((x) => x.id === plan.componentId);
      const lattice = screenToLattice(s.viewport, p.x, p.y);
      if (c) grab = { dx: lattice.x - c.anchor.x, dy: lattice.y - c.anchor.y };
    }
    const { clientX, clientY } = e;
    const longPress =
      e.pointerType === 'touch' && !panOnly
        ? setTimeout(() => {
            if (session.current && !session.current.dragging) {
              endSession();
              openMenu(clientX, clientY, point);
            }
          }, LONG_PRESS_MS)
        : null;
    session.current = { pointerId: e.pointerId, start: p, plan, startPoint: point, dragging: false, grab, horizontalFirst: null, startViewport: s.viewport, longPress };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const pz = pinch.current;
    if (pz) {
      const a = pointers.current.get(pz.ids[0]);
      const b = pointers.current.get(pz.ids[1]);
      if (a && b) useEditor.getState().setViewport(pinchViewport(pz.startViewport, pz.start, [a, b]));
      return;
    }
    const ses = session.current;
    if (!ses || ses.pointerId !== e.pointerId) return;
    if (!ses.dragging) {
      if (Math.hypot(p.x - ses.start.x, p.y - ses.start.y) < CLICK_TOLERANCE_PX) return;
      ses.dragging = true;
      if (ses.longPress) clearTimeout(ses.longPress);
      ses.longPress = null;
    }
    const s = useEditor.getState();
    if (ses.plan.drag === 'pan') {
      s.setViewport(panBy(ses.startViewport, p.x - ses.start.x, p.y - ses.start.y));
    } else if (ses.plan.drag === 'move') {
      const c = circuit.components.find((x) => x.id === ses.plan.componentId);
      const def = c ? getComponentDefinition(c.defId) : undefined;
      if (!c || !def || !ses.grab) return;
      const lattice = screenToLattice(s.viewport, p.x, p.y);
      const instance = { ...c, anchor: snapAnchor(def, c.rotation, { x: lattice.x - ses.grab.dx, y: lattice.y - ses.grab.dy }) };
      const check = checkPlacement(circuit, instance, c.id);
      s.setGhost({ instance, valid: check.ok, reason: check.ok ? null : check.reason });
    } else {
      const lattice = screenToLattice(s.viewport, p.x, p.y);
      if (ses.horizontalFirst === null) ses.horizontalFirst = wireOrientation(lattice.x - ses.startPoint.x, lattice.y - ses.startPoint.y);
      const end = screenToGridPoint(s.viewport, p.x, p.y, BOARD_ID);
      const same = end.x === ses.startPoint.x && end.y === ses.startPoint.y;
      s.setWirePreview({
        start: ses.startPoint,
        end,
        path: lPath(ses.startPoint, end, ses.horizontalFirst ?? true),
        valid: !same && isFreeHole(circuit, end),
      });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 已經釋放
    }
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const ses = session.current;
    if (!ses || ses.pointerId !== e.pointerId) return;
    endSession();
    const s = useEditor.getState();
    if (!ses.dragging) {
      if (s.armedPart && editable) {
        placeArmedPart(ses.start);
        return;
      }
      s.select(ses.plan.click);
      if (ses.plan.click) s.setRightTab('selection');
      return;
    }
    if (ses.plan.drag === 'move') {
      const ghost = s.ghost;
      const id = ses.plan.componentId;
      s.setGhost(null);
      if (!ghost || !id) return;
      if (ghost.valid) s.run((doc) => moveComponent(doc, id, ghost.instance.anchor));
      else if (ghost.reason) s.notify(`這裡放不下：${ghost.reason}`, 'error');
    } else if (ses.plan.drag === 'wire') {
      const preview = s.wirePreview;
      s.setWirePreview(null);
      if (preview?.valid) s.run((doc) => addWire(doc, preview.start, preview.end, ses.horizontalFirst ?? true, s.wireColor));
    }
  };

  const onPointerCancel = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (session.current?.pointerId === e.pointerId) {
      endSession();
      clearTransient();
    }
  };

  const onContextMenu = (e: ReactMouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    const p = local(e);
    openMenu(e.clientX, e.clientY, screenToGridPoint(useEditor.getState().viewport, p.x, p.y, BOARD_ID));
  };

  return {
    ref,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu },
    contextMenu,
    closeContextMenu: () => setContextMenu(null),
  };
}
