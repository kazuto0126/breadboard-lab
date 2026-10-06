import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { getNode } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import { analyzeCircuit, groupIdAt, netOfPin, occupancyOf } from '../../editor/analysis';
import { boardFrames, fromWorld, toWorld, type BoardFrame, type GridHit } from '../../editor/geometry';
import { nextComponentId } from '../../editor/ids';
import { defaultWireColor, isFreeHoleWith, planWirePath, type Axis } from '../../editor/manualWire';
import { centeredAnchor, findPlacement } from '../../editor/placement';
import { panBy, screenToWorld, zoomAt, type Viewport } from '../../editor/viewport';
import { UI } from '../../render/theme';
import { useStore, type WireAnimation } from '../../state/store';
import type { Circuit, Net, Wire } from '../../types/circuit';
import type { ComponentInstance, Rotation } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import type { Level } from '../../types/logic';
import { groupOf } from '../common/describe';
import { BoardBackground } from './BoardBackground';
import { CanvasHud, ContextMenu, HoverTooltip, type Hover, type MenuState } from './CanvasHud';
import { ComponentGraphic, type ComponentSim } from './ComponentGraphic';
import { componentRect, GroupStrip, groupRect, Outline, PathPreview, PinTargets, Ring, WireGlow } from './overlays';
import { WireGraphic } from './WireGraphic';

const DRAG_THRESHOLD = 4;

type PanDrag = { kind: 'pan'; pointerId: number; startX: number; startY: number; origin: Viewport };
type MoveDrag = {
  kind: 'move';
  pointerId: number;
  id: string;
  startX: number;
  startY: number;
  started: boolean;
  /** 按下時游標相對於 anchor 的位置（格），拖曳時元件不會跳到游標中心。 */
  grabX: number;
  grabY: number;
  rotation: Rotation;
  lastX: number;
  lastY: number;
  preview: ComponentInstance | null;
  valid: boolean;
};
type WireDrag = {
  kind: 'wire';
  pointerId: number;
  start: GridPoint;
  startX: number;
  startY: number;
  started: boolean;
  current: GridPoint | null;
  axis: Axis | null;
  path: GridPoint[];
  valid: boolean;
};
type Drag = PanDrag | MoveDrag | WireDrag;

interface Ghost {
  instance: ComponentInstance;
  valid: boolean;
}

function samePoint(a: GridPoint | null, b: GridPoint | null): boolean {
  return a === b || (!!a && !!b && a.boardId === b.boardId && a.x === b.x && a.y === b.y);
}

function sameHover(a: Hover | null, b: Hover | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'hole':
      return samePoint(a.point, (b as typeof a).point);
    case 'pin':
      return a.componentId === (b as typeof a).componentId && a.pinNumber === (b as typeof a).pinNumber;
    case 'wire':
    case 'component':
      return a.id === (b as typeof a).id;
  }
}

function isHole(circuit: Circuit, p: GridPoint): boolean {
  const instance = circuit.boards.find((b) => b.id === p.boardId);
  return !!instance && getNode(getBoard(instance.layoutId, instance.id), p.x, p.y)?.kind === 'hole';
}

function pinPoint(circuit: Circuit, componentId: string, pinNumber: number): GridPoint | null {
  const c = circuit.components.find((x) => x.id === componentId);
  const def = c ? getComponentDefinition(c.defId) : undefined;
  if (!c || !def) return null;
  return resolveFootprint(c, def).pins.find((p) => p.pinNumber === pinNumber)?.point ?? null;
}

const ComponentsLayer = memo(function ComponentsLayer({
  components,
  frames,
  fadedId,
  sims,
}: {
  components: ComponentInstance[];
  frames: BoardFrame[];
  fadedId?: string;
  sims: Map<string, ComponentSim> | null;
}) {
  return (
    <g data-layer="components">
      {components.map((c) => {
        const def = getComponentDefinition(c.defId);
        const at = toWorld(frames, { boardId: c.boardId, ...c.anchor });
        if (!def || !at) return null;
        return <ComponentGraphic key={c.id} instance={c} def={def} at={at} faded={c.id === fadedId} sim={sims?.get(c.id)} />;
      })}
    </g>
  );
});

const WiresLayer = memo(function WiresLayer({
  wires,
  frames,
  animation,
  faded,
  levels,
}: {
  wires: Wire[];
  frames: BoardFrame[];
  animation: WireAnimation | null;
  faded: boolean;
  levels: Map<string, Level> | null;
}) {
  return (
    <g data-layer="wires">
      {wires.map((w) => {
        const delay = animation?.delays[w.id];
        const anim = animation && delay !== undefined ? { delay, duration: animation.drawMs } : undefined;
        return <WireGraphic key={anim ? `${w.id}@${animation!.key}` : w.id} wire={w} frames={frames} anim={anim} faded={faded} level={levels?.get(w.id)} />;
      })}
    </g>
  );
});

/** 互動式麵包板畫布：放置、移動、接線、選取、縮放與平移。 */
export function BreadboardCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const circuit = useStore((s) => s.circuit);
  const viewport = useStore((s) => s.viewport);
  const selection = useStore((s) => s.selection);
  const placing = useStore((s) => s.placing);
  const showCheck = useStore((s) => s.showCheck);
  const routing = useStore((s) => s.routing);
  const animation = useStore((s) => s.animation);
  const simResult = useStore((s) => s.simulation?.result ?? null);
  const simPressed = useStore((s) => s.simulation?.pressed ?? null);
  const pressedButton = useRef<{ id: string; pointerId: number } | null>(null);
  const wireColor = useStore((s) => s.wireColor);

  const boards = circuit.boards;
  const frames = useMemo(() => boardFrames({ boards }), [boards]);
  const analysis = useMemo(() => analyzeCircuit(circuit), [circuit]);

  // 模擬中每個元件的腳位電位 / LED 發光 / 供電，以及每條導線所在節點的電位。
  const components = circuit.components;
  const componentSims = useMemo(() => {
    if (!simResult) return null;
    const lit = new Set(simResult.litLeds);
    const unpowered = new Set(simResult.unpowered);
    const map = new Map<string, ComponentSim>();
    for (const c of components) {
      const def = getComponentDefinition(c.defId);
      if (!def) continue;
      const levels: Record<number, Level> = {};
      for (const pin of def.pins) levels[pin.number] = simResult.pinLevels[`${c.id}#${pin.number}`] ?? 'Z';
      map.set(c.id, { levels, lit: lit.has(c.id), unpowered: unpowered.has(c.id), pressed: simPressed?.[c.id] ?? false });
    }
    return map;
  }, [simResult, simPressed, components]);
  const wireLevels = useMemo(() => {
    if (!simResult) return null;
    const map = new Map<string, Level>();
    for (const w of circuit.wires) {
      const g = groupIdAt(circuit, w.start);
      if (g) map.set(w.id, simResult.groupLevels[g] ?? 'Z');
    }
    return map;
  }, [simResult, circuit]);

  const [hover, setHoverState] = useState<Hover | null>(null);
  const hoverRef = useRef<Hover | null>(null);
  const setHover = (h: Hover | null) => {
    hoverRef.current = h;
    setHoverState(h);
  };
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);
  const [ghost, setGhostState] = useState<Ghost | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const setGhost = useCallback((g: Ghost | null) => {
    ghostRef.current = g;
    setGhostState(g);
  }, []);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  const pointerInside = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;
  const framesRef = useRef(frames);
  framesRef.current = frames;

  const clientToHit = useCallback((clientX: number, clientY: number): GridHit | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const world = screenToWorld(useStore.getState().viewport, clientX - rect.left, clientY - rect.top);
    return fromWorld(framesRef.current, world.x, world.y);
  }, []);

  // 畫布大小；第一次量到大小時 Fit to Screen。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let fitted = false;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      useStore.getState().setCanvasSize(Math.round(width), Math.round(height));
      if (!fitted && width > 0 && height > 0) {
        fitted = true;
        useStore.getState().fitToScreen();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 滾輪縮放（需要 passive: false 才能阻止瀏覽器捲動 / 縮放整頁）。
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015));
      const s = useStore.getState();
      s.setViewport(zoomAt(s.viewport, factor, e.clientX - rect.left, e.clientY - rect.top));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const updateMove = useCallback(
    (d: MoveDrag, clientX: number, clientY: number) => {
      const c = circuitRef.current;
      const original = c.components.find((x) => x.id === d.id);
      const def = original ? getComponentDefinition(original.defId) : undefined;
      if (!original || !def) {
        setDrag(null);
        return;
      }
      const hit = clientToHit(clientX, clientY);
      let preview: ComponentInstance | null = null;
      let valid = false;
      if (hit && hit.boardId === original.boardId) {
        const anchor =
          d.rotation === original.rotation
            ? { x: Math.round(hit.fx - d.grabX), y: Math.round(hit.fy - d.grabY) }
            : centeredAnchor(def, d.rotation, original.span, hit.fx, hit.fy);
        const desired: ComponentInstance = { ...original, rotation: d.rotation, anchor };
        const snapped = findPlacement(c, desired, { ignoreId: d.id });
        preview = snapped ?? desired;
        valid = snapped !== null;
      }
      setDrag({ ...d, started: true, lastX: clientX, lastY: clientY, preview, valid });
    },
    [clientToHit, setDrag],
  );

  // 鍵盤：Space 平移；拖曳中 Esc 取消、R 旋轉（在 capture 階段攔截，避免觸發全域快捷鍵）。
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === 'Space' && pointerInside.current) {
        e.preventDefault();
        if (!spaceRef.current) {
          spaceRef.current = true;
          setSpaceDown(true);
        }
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      if (e.key === 'Escape') {
        setDrag(null);
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if ((e.key === 'r' || e.key === 'R') && d.kind === 'move' && !e.ctrlKey && !e.metaKey) {
        updateMove({ ...d, rotation: ((d.rotation + 90) % 360) as Rotation }, d.lastX, d.lastY);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceRef.current) {
        spaceRef.current = false;
        setSpaceDown(false);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [setDrag, updateMove]);

  // 從元件庫拿起的元件：ghost 跟著游標（游標可能從畫布外進來，所以監聽 window）。
  useEffect(() => {
    if (!placing) {
      setGhost(null);
      return;
    }
    const def = getComponentDefinition(placing.item.defId);
    if (!def) return;
    const compute = (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      const hit = inside ? clientToHit(clientX, clientY) : null;
      if (!hit) {
        setGhost(null);
        return;
      }
      const c = circuitRef.current;
      const base: ComponentInstance = {
        id: nextComponentId(c, def.category),
        defId: def.id,
        boardId: hit.boardId,
        anchor: centeredAnchor(def, placing.rotation, undefined, hit.fx, hit.fy),
        rotation: placing.rotation,
        props: { ...placing.item.props },
      };
      const snapped = findPlacement(c, base, { ignoreId: base.id });
      setGhost({ instance: snapped ?? base, valid: snapped !== null });
    };
    const onMove = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      compute(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      const store = useStore.getState();
      const p = store.placing;
      if (!p || !p.dragging) return;
      const g = ghostRef.current;
      const moved = p.origin ? Math.hypot(e.clientX - p.origin.x, e.clientY - p.origin.y) > DRAG_THRESHOLD : true;
      if (!moved) store.setPlacingDragging(false);
      else if (g?.valid) store.placeComponent(p.item, g.instance.rotation, g.instance.boardId, g.instance.anchor);
      else {
        if (g) store.toast('warning', '這裡放不下：腳必須插在空孔上，而且不能和其他元件重疊');
        store.cancelPlacing();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    if (lastPointer.current) compute(lastPointer.current.x, lastPointer.current.y);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [placing, clientToHit, setGhost]);

  const startPan = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origin: useStore.getState().viewport });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    setMenu(null);
    const store = useStore.getState();
    if (store.routing) return;
    if (store.simulation) {
      onSimulationPointerDown(e);
      return;
    }
    if (store.placing) {
      if (e.button === 0 && !store.placing.dragging) {
        const g = ghostRef.current;
        if (g?.valid) store.placeComponent(store.placing.item, g.instance.rotation, g.instance.boardId, g.instance.anchor);
        else store.toast('warning', '這裡放不下：腳必須插在空孔上，而且不能和其他元件重疊');
      }
      return;
    }
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const target = e.target as Element;
    const compEl = target.closest('[data-component-id]');
    if (compEl) {
      const id = compEl.getAttribute('data-component-id')!;
      const pinAttr = compEl.getAttribute('data-pin');
      store.select(pinAttr ? { kind: 'pin', componentId: id, pinNumber: Number(pinAttr) } : { kind: 'component', id });
      const instance = circuitRef.current.components.find((c) => c.id === id);
      const hit = clientToHit(e.clientX, e.clientY);
      if (instance && hit) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({
          kind: 'move',
          pointerId: e.pointerId,
          id,
          startX: e.clientX,
          startY: e.clientY,
          started: false,
          grabX: hit.fx - instance.anchor.x,
          grabY: hit.fy - instance.anchor.y,
          rotation: instance.rotation,
          lastX: e.clientX,
          lastY: e.clientY,
          preview: null,
          valid: false,
        });
      }
      return;
    }
    const wireEl = target.closest('[data-wire-id]');
    if (wireEl) {
      store.select({ kind: 'wire', id: wireEl.getAttribute('data-wire-id')! });
      return;
    }
    const hit = clientToHit(e.clientX, e.clientY);
    const point = hit ? { boardId: hit.boardId, x: hit.x, y: hit.y } : null;
    if (point && isHole(circuitRef.current, point)) {
      if (isFreeHoleWith(occupancyOf(circuitRef.current, point.boardId), point)) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ kind: 'wire', pointerId: e.pointerId, start: point, startX: e.clientX, startY: e.clientY, started: false, current: null, axis: null, path: [point], valid: false });
      } else {
        store.select({ kind: 'hole', point });
      }
      return;
    }
    store.select(null);
    startPan(e);
  };

  /** 模擬模式：可以撥指撥開關、按住按鈕、選取與平移，不能改變電路結構。 */
  const onSimulationPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const store = useStore.getState();
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const target = e.target as Element;
    const compEl = target.closest('[data-component-id]');
    const id = compEl?.getAttribute('data-component-id');
    const switchEl = target.closest('[data-switch]');
    if (id && switchEl) {
      store.toggleSwitch(id, Number(switchEl.getAttribute('data-switch')));
      return;
    }
    if (id && target.closest('[data-button]')) {
      e.currentTarget.setPointerCapture(e.pointerId);
      pressedButton.current = { id, pointerId: e.pointerId };
      store.pressButton(id, true);
      return;
    }
    if (compEl && id) {
      const pinAttr = compEl.getAttribute('data-pin');
      store.select(pinAttr ? { kind: 'pin', componentId: id, pinNumber: Number(pinAttr) } : { kind: 'component', id });
      return;
    }
    const wireEl = target.closest('[data-wire-id]');
    if (wireEl) {
      store.select({ kind: 'wire', id: wireEl.getAttribute('data-wire-id')! });
      return;
    }
    const hit = clientToHit(e.clientX, e.clientY);
    const point = hit ? { boardId: hit.boardId, x: hit.x, y: hit.y } : null;
    if (point && isHole(circuitRef.current, point)) {
      store.select({ kind: 'hole', point });
      return;
    }
    store.select(null);
    startPan(e);
  };

  const releaseButton = (e: ReactPointerEvent<SVGSVGElement>) => {
    const held = pressedButton.current;
    if (!held) return false;
    pressedButton.current = null;
    if (e.currentTarget.hasPointerCapture(held.pointerId)) e.currentTarget.releasePointerCapture(held.pointerId);
    useStore.getState().pressButton(held.id, false);
    return true;
  };

  const updateWire = (d: WireDrag, clientX: number, clientY: number) => {
    const hit = clientToHit(clientX, clientY);
    const current = hit && hit.boardId === d.start.boardId ? { boardId: hit.boardId, x: hit.x, y: hit.y } : null;
    const axis: Axis = d.axis ?? (Math.abs(clientX - d.startX) >= Math.abs(clientY - d.startY) ? 'h' : 'v');
    if (d.started && samePoint(current, d.current)) return;
    const c = circuitRef.current;
    const valid = !!current && !samePoint(current, d.start) && isFreeHoleWith(occupancyOf(c, current.boardId), current);
    const path = current ? planWirePath(c, d.start, current, axis) : d.path;
    setDrag({ ...d, started: true, current, axis, path, valid });
  };

  const updateHover = (e: ReactPointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    const compEl = target.closest('[data-component-id]');
    const wireEl = target.closest('[data-wire-id]');
    let next: Hover | null = null;
    if (compEl) {
      const id = compEl.getAttribute('data-component-id')!;
      const pin = compEl.getAttribute('data-pin');
      next = pin ? { kind: 'pin', componentId: id, pinNumber: Number(pin), x: e.clientX, y: e.clientY } : { kind: 'component', id, x: e.clientX, y: e.clientY };
    } else if (wireEl) {
      next = { kind: 'wire', id: wireEl.getAttribute('data-wire-id')!, x: e.clientX, y: e.clientY };
    } else {
      const hit = clientToHit(e.clientX, e.clientY);
      const point = hit ? { boardId: hit.boardId, x: hit.x, y: hit.y } : null;
      if (point && isHole(circuitRef.current, point)) next = { kind: 'hole', point, x: e.clientX, y: e.clientY };
    }
    if (!sameHover(next, hoverRef.current)) setHover(next);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (d) {
      if (d.kind === 'pan') {
        useStore.getState().setViewport(panBy(d.origin, e.clientX - d.startX, e.clientY - d.startY));
        return;
      }
      if (!d.started && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      if (hoverRef.current) setHover(null);
      if (d.kind === 'move') updateMove(d, e.clientX, e.clientY);
      else updateWire(d, e.clientX, e.clientY);
      return;
    }
    if (useStore.getState().placing) {
      if (hoverRef.current) setHover(null);
      return;
    }
    updateHover(e);
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (releaseButton(e)) return;
    const d = dragRef.current;
    if (!d) return;
    if (e.currentTarget.hasPointerCapture(d.pointerId)) e.currentTarget.releasePointerCapture(d.pointerId);
    setDrag(null);
    const store = useStore.getState();
    if (d.kind === 'move' && d.started) {
      const original = circuitRef.current.components.find((c) => c.id === d.id);
      if (!d.valid || !d.preview) store.toast('warning', '這裡放不下，元件已放回原位');
      else if (original && (original.anchor.x !== d.preview.anchor.x || original.anchor.y !== d.preview.anchor.y || original.rotation !== d.preview.rotation)) {
        store.moveComponent(d.id, d.preview.anchor, d.preview.rotation);
      }
    } else if (d.kind === 'wire') {
      if (!d.started) store.select({ kind: 'hole', point: d.start });
      else if (d.valid && d.path.length >= 2) store.addWire(d.path);
      else if (d.current && !samePoint(d.current, d.start)) store.toast('info', '導線的終點必須是空孔：沒有元件腳、沒有被元件蓋住，也沒有其他導線');
    }
  };

  const onContextMenu = (e: ReactMouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    const store = useStore.getState();
    if (store.placing) {
      store.cancelPlacing();
      return;
    }
    if (dragRef.current || store.routing || store.simulation) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const target = e.target as Element;
    const compEl = target.closest('[data-component-id]');
    const wireEl = target.closest('[data-wire-id]');
    if (compEl) {
      const id = compEl.getAttribute('data-component-id')!;
      store.select({ kind: 'component', id });
      setMenu({ x, y, target: { kind: 'component', id } });
    } else if (wireEl) {
      const id = wireEl.getAttribute('data-wire-id')!;
      store.select({ kind: 'wire', id });
      setMenu({ x, y, target: { kind: 'wire', id } });
    } else {
      setMenu({ x, y, target: { kind: 'canvas' } });
    }
  };

  // ---------- 高亮 ----------
  const selectedNet: Net | null = useMemo(() => {
    if (!selection) return null;
    switch (selection.kind) {
      case 'pin':
        return netOfPin(analysis, selection) ?? null;
      case 'wire':
        return analysis.netByWire.get(selection.id) ?? null;
      case 'net':
        return analysis.netById.get(selection.netId) ?? null;
      case 'hole': {
        const g = groupOf(circuit, selection.point);
        return g ? (analysis.netByGroup.get(g) ?? null) : null;
      }
      default:
        return null;
    }
  }, [selection, analysis, circuit]);

  const shownIssues = useMemo(() => {
    const list = showCheck ? analysis.issues.filter((i) => i.severity !== 'info') : [];
    if (selection?.kind === 'issue') {
      const picked = analysis.issues[selection.index];
      if (picked && !list.includes(picked)) list.push(picked);
    }
    return list;
  }, [showCheck, analysis, selection]);

  const hoverGroup = hover?.kind === 'hole' ? groupOf(circuit, hover.point) : null;
  const hoverFree = hover?.kind === 'hole' && isFreeHoleWith(occupancyOf(circuit, hover.point.boardId), hover.point);
  const movingId = drag?.kind === 'move' && drag.started ? drag.id : undefined;
  const wiresById = useMemo(() => new Map(circuit.wires.map((w) => [w.id, w])), [circuit.wires]);
  const componentsById = useMemo(() => new Map(circuit.components.map((c) => [c.id, c])), [circuit.components]);

  const preview = drag?.kind === 'move' && drag.started ? drag.preview : ghost?.instance ?? null;
  const previewValid = drag?.kind === 'move' && drag.started ? drag.valid : !!ghost?.valid;
  const previewDef = preview ? getComponentDefinition(preview.defId) : undefined;
  const previewAt = preview ? toWorld(frames, { boardId: preview.boardId, ...preview.anchor }) : null;
  const previewPins = preview && previewDef ? resolveFootprint(preview, previewDef).pins : [];

  const cursor = drag?.kind === 'pan' ? 'grabbing' : spaceDown ? 'grab' : placing ? 'copy' : drag?.kind === 'wire' ? 'crosshair' : hoverFree ? 'crosshair' : 'default';

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden" style={{ background: '#0f172a' }}>
      <svg
        ref={svgRef}
        id="bbl-board-svg"
        fontFamily="Inter, 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif"
        className="block h-full w-full touch-none select-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          releaseButton(e);
          setDrag(null);
        }}
        onPointerEnter={() => (pointerInside.current = true)}
        onPointerLeave={() => {
          pointerInside.current = false;
          setHover(null);
        }}
        onContextMenu={onContextMenu}
      >
        <defs>
          <pattern id="bbl-dots" width={24} height={24} patternUnits="userSpaceOnUse">
            <circle cx={12} cy={12} r={1} fill="#1e293b" />
          </pattern>
        </defs>
        <rect data-ui="backdrop" width="100%" height="100%" fill="url(#bbl-dots)" />
        <g data-viewport="" transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
          {frames.map((f) => (
            <BoardBackground key={f.id} frame={f} />
          ))}

          <g data-ui="under">
            {hoverGroup && <GroupStrip rect={groupRect(frames, circuit, hoverGroup)} color={UI.hover} />}
            {selectedNet?.groupIds.map((g) => (
              <GroupStrip key={g} rect={groupRect(frames, circuit, g)} color={UI.net} opacity={0.16} />
            ))}
          </g>

          <ComponentsLayer components={circuit.components} frames={frames} fadedId={movingId} sims={componentSims} />

          <g data-ui="wire-glow">
            {selectedNet &&
              circuit.wires
                .filter((w) => analysis.netByWire.get(w.id) === selectedNet)
                .map((w) => <WireGlow key={w.id} frames={frames} wire={w} color={UI.net} width={0.7} opacity={0.4} />)}
            {selection?.kind === 'wire' && wiresById.get(selection.id) && (
              <WireGlow frames={frames} wire={wiresById.get(selection.id)!} color={UI.select} width={0.95} opacity={0.6} />
            )}
            {shownIssues.flatMap((issue, i) =>
              issue.wireIds.map((id) => {
                const w = wiresById.get(id);
                return w ? <WireGlow key={`${i}-${id}`} frames={frames} wire={w} color={issue.severity === 'error' ? UI.error : UI.warning} width={0.8} opacity={0.5} /> : null;
              }),
            )}
          </g>

          <WiresLayer wires={circuit.wires} frames={frames} animation={animation} faded={routing !== null} levels={wireLevels} />

          <g data-ui="over">
            <PinTargets components={circuit.components} frames={frames} hiddenId={movingId} />
            {selectedNet?.pins.map((ref) => {
              const p = pinPoint(circuit, ref.componentId, ref.pinNumber);
              return p ? <Ring key={`${ref.componentId}#${ref.pinNumber}`} frames={frames} point={p} color={UI.net} r={0.4} width={2} /> : null;
            })}
            {selection?.kind === 'component' && selection.id !== movingId && componentsById.get(selection.id) && (
              <Outline rect={componentRect(frames, componentsById.get(selection.id)!)} color={UI.select} />
            )}
            {selection?.kind === 'pin' && (
              <Ring frames={frames} point={pinPoint(circuit, selection.componentId, selection.pinNumber) ?? { boardId: '', x: 0, y: 0 }} color={UI.select} r={0.5} width={2.6} />
            )}
            {selection?.kind === 'hole' && <Ring frames={frames} point={selection.point} color={UI.select} r={0.45} width={2.4} />}

            {shownIssues.map((issue, i) => {
              const color = issue.severity === 'error' ? UI.error : UI.warning;
              return (
                <g key={i} pointerEvents="none">
                  {issue.componentIds.map((id) => {
                    const c = componentsById.get(id);
                    return c ? <Outline key={id} rect={componentRect(frames, c, 0.75)} color={color} width={2.2} /> : null;
                  })}
                  {issue.points.map((p, k) => (
                    <Ring key={k} frames={frames} point={p} color={color} r={0.55} width={2.2} fill={color} />
                  ))}
                </g>
              );
            })}

            {hover?.kind === 'hole' && <Ring frames={frames} point={hover.point} color={hoverFree ? UI.hover : '#94a3b8'} r={0.36} width={2} />}

            {preview && previewDef && previewAt && (
              <g pointerEvents="none">
                <ComponentGraphic instance={preview} def={previewDef} at={previewAt} ghost />
                {previewPins.map((p) => (
                  <Ring key={p.pinNumber} frames={frames} point={p.point} color={previewValid ? UI.ok : UI.bad} r={0.3} width={2} />
                ))}
              </g>
            )}

            {drag?.kind === 'wire' && drag.started && (
              <g pointerEvents="none">
                <PathPreview
                  frames={frames}
                  path={drag.path}
                  color={drag.current ? defaultWireColor(circuit, drag.start, drag.current, wireColor) : wireColor}
                  valid={drag.valid}
                />
                <Ring frames={frames} point={drag.start} color={UI.ok} r={0.42} width={2.4} />
                {drag.current && <Ring frames={frames} point={drag.current} color={drag.valid ? UI.ok : UI.bad} r={0.46} width={2.6} />}
              </g>
            )}
          </g>
        </g>
      </svg>

      {hover && !drag && !placing && !menu && (
        <HoverTooltip hover={hover} container={containerRef.current} circuit={circuit} analysis={analysis} sim={simResult} />
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      <CanvasHud drawingWire={drag?.kind === 'wire' && drag.started} />
    </div>
  );
}
