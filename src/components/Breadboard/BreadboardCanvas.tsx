import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { buildLattice } from '../../core/breadboard/lattice';
import { getNode, nodeIdOf } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import { placeAt } from '../../core/icPlacement/relocate';
import { analyzeCircuit, groupIdAt, netOfPin, occupancyOf } from '../../editor/analysis';
import { explainIssue } from '../../editor/explain';
import { groupMembers, moveBoards, snapBoardMove, snapUnits, type BoardMovePlan } from '../../editor/boards';
import { boardFrames, fromWorld, PITCH, toWorld, type BoardFrame, type GridHit, type Point } from '../../editor/geometry';
import { nextComponentId } from '../../editor/ids';
import { isChecked } from '../../editor/checklist';
import { defaultWireColor, straightWireProblem } from '../../editor/manualWire';
import { centeredAnchor, findPlacement } from '../../editor/placement';
import { panBy, pinchViewport, screenToWorld, zoomAt, type Viewport } from '../../editor/viewport';
import { UI } from '../../render/theme';
import { useStore, type WireAnimation } from '../../state/store';
import type { Circuit, Net, Wire } from '../../types/circuit';
import type { ComponentInstance, Rotation } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import type { Level } from '../../types/logic';
import { groupOf } from '../common/describe';
import { BoardBackground } from './BoardBackground';
import { BoardSelection, GroupOutlines, MovingBoards, SnapPreview } from './boardOverlays';
import { CanvasHud, ContextMenu, HoverTooltip, type Hover, type MenuState } from './CanvasHud';
import { ComponentGraphic, type ComponentSim } from './ComponentGraphic';
import { componentRect, FlashRings, GroupStrip, groupRect, Outline, PathPreview, PinTargets, Ring, SuggestionMarks, WireGlow, WireHandles } from './overlays';
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
  /** 預覽：[start] 或 [start, current]（直線）。 */
  path: GridPoint[];
  valid: boolean;
};
/** 拖曳選取的導線的一端（規格 2026-10-10 straight-wires 3.2）。 */
type WireEndDrag = {
  kind: 'wire-end';
  pointerId: number;
  wireId: string;
  which: 'start' | 'end';
  /** 不動的另一端。 */
  fixed: GridPoint;
  startX: number;
  startY: number;
  started: boolean;
  current: GridPoint | null;
  valid: boolean;
};
/** 拖曳麵包板（或整個群組）。 */
type BoardDrag = {
  kind: 'board';
  pointerId: number;
  /** 按下的那塊板。 */
  boardId: string;
  /** 一起移動的板子：整個群組，或按住 Alt / Shift 時只有這一塊。 */
  ids: string[];
  startX: number;
  startY: number;
  started: boolean;
  plan: BoardMovePlan | null;
};
/** 觸控：兩指縮放與平移。pointerId 是第一指（和其他拖曳共用欄位）。 */
type PinchDrag = { kind: 'pinch'; pointerId: number; ids: [number, number]; origin: Viewport; a0: Point; b0: Point };
type Drag = PanDrag | MoveDrag | WireDrag | WireEndDrag | BoardDrag | PinchDrag;

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
    case 'board':
      return a.id === (b as typeof a).id;
  }
}

function samePlan(a: BoardMovePlan | null, b: BoardMovePlan | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.dx === b.dx && a.dy === b.dy && a.blocked === b.blocked && a.snap?.side === b.snap?.side && a.snap?.targetId === b.snap?.targetId && a.snap?.movingId === b.snap?.movingId;
}

/** 可以從這個孔開始拉線：不是元件腳、沒被本體蓋住（手動接線可以一孔多線）。 */
function canStartWire(circuit: Circuit, p: GridPoint): boolean {
  const occ = occupancyOf(circuit, p.boardId);
  const id = nodeIdOf(p);
  return !occ.pins.has(id) && !occ.bodies.has(id);
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
  dimmed,
  levels,
}: {
  wires: Wire[];
  frames: BoardFrame[];
  animation: WireAnimation | null;
  faded: boolean;
  dimmed: Set<string>;
  levels: Map<string, Level> | null;
}) {
  return (
    <g data-layer="wires">
      {wires.map((w) => {
        const delay = animation?.delays[w.id];
        const anim = animation && delay !== undefined ? { delay, duration: animation.drawMs } : undefined;
        return (
          <WireGraphic
            key={anim ? `${w.id}@${animation!.key}` : w.id}
            wire={w}
            frames={frames}
            anim={anim}
            faded={faded}
            dim={dimmed.has(w.id)}
            level={levels?.get(w.id)}
          />
        );
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
  const simulating = useStore((s) => s.simulation !== null);
  const pressedButton = useRef<{ id: string; pointerId: number } | null>(null);
  const wireColor = useStore((s) => s.wireColor);
  const checklist = useStore((s) => s.checklist);
  const checklistOpen = useStore((s) => s.rightTab === 'checklist');

  const boards = circuit.boards;
  const baseFrames = useMemo(() => boardFrames({ boards }), [boards]);
  const multiBoard = boards.length > 1;
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
      map.set(c.id, { levels, lit: lit.has(c.id), unpowered: unpowered.has(c.id), pressed: simPressed?.[c.id] ?? false, segments: simResult.litSegments[c.id] });
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

  // 拖曳麵包板時，畫面上的板子（連同元件、導線）跟著吸附後的位置移動；放開前電路本身不變。
  const boardDrag = drag?.kind === 'board' && drag.started && drag.plan ? drag : null;
  const boardPlan = boardDrag?.plan ?? null;
  const boardIds = boardDrag?.ids ?? null;
  const displayBoards = useMemo(
    () => (boardPlan && boardIds ? moveBoards({ version: 1, boards, components: [], wires: [] }, boardIds, boardPlan.dx, boardPlan.dy).boards : boards),
    [boards, boardPlan, boardIds],
  );
  const frames = useMemo(() => (displayBoards === boards ? baseFrames : boardFrames({ boards: displayBoards })), [displayBoards, boards, baseFrames]);
  const [ghost, setGhostState] = useState<Ghost | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const setGhost = useCallback((g: Ghost | null) => {
    ghostRef.current = g;
    setGhostState(g);
  }, []);
  const [menu, setMenu] = useState<MenuState | null>(null);
  /** 放置中：計算某個螢幕位置的 ghost（並更新畫面）。 */
  const ghostAtRef = useRef<((clientX: number, clientY: number) => Ghost | null) | null>(null);
  /** 目前按在畫布上的觸控點（螢幕座標），用來偵測兩指手勢。 */
  const touches = useRef(new Map<number, Point>());
  /** 觸控放置：按下時先記住，放開時才放（中途滑動變成平移、第二指變成縮放）。 */
  const pendingTap = useRef<{ pointerId: number; x: number; y: number; origin: Viewport } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  const pointerInside = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;
  const framesRef = useRef(baseFrames);
  framesRef.current = baseFrames;

  const clientToHit = useCallback((clientX: number, clientY: number): GridHit | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const world = screenToWorld(useStore.getState().viewport, clientX - rect.left, clientY - rect.top);
    return fromWorld(framesRef.current, world.x, world.y);
  }, []);

  // 畫布大小；第一次量到大小時 Fit to Screen，之後使用者還沒自己縮放或平移時，大小改變會重新 Fit（setCanvasSize）。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let fitted = false;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      useStore.getState().setCanvasSize(Math.round(width), Math.round(height));
      if (!fitted && width > 0 && height > 0) {
        fitted = true;
        if (useStore.getState().viewportAuto) useStore.getState().fitToScreen();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 保險：手指在畫布外放開（沒有被 svg 捕捉）時，svg 收不到 pointerup，也要從 touches 拿掉。
  useEffect(() => {
    const forget = (e: PointerEvent) => {
      if (e.pointerType === 'touch') touches.current.delete(e.pointerId);
    };
    window.addEventListener('pointerup', forget, true);
    window.addEventListener('pointercancel', forget, true);
    return () => {
      window.removeEventListener('pointerup', forget, true);
      window.removeEventListener('pointercancel', forget, true);
    };
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
      if (hit) {
        // 所有板子同一種版型，抓取點的板內位移在另一塊板上也適用：元件可以直接拖到另一塊板。
        const anchor =
          d.rotation === original.rotation
            ? { x: Math.round(hit.fx - d.grabX), y: Math.round(hit.fy - d.grabY) }
            : centeredAnchor(def, d.rotation, original.span, hit.fx, hit.fy);
        const desired: ComponentInstance = { ...original, boardId: hit.boardId, rotation: d.rotation, anchor };
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
    const compute = (clientX: number, clientY: number): Ghost | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      const hit = inside ? clientToHit(clientX, clientY) : null;
      if (!hit) {
        setGhost(null);
        return null;
      }
      const c = circuitRef.current;
      const base: ComponentInstance = {
        id: nextComponentId(c, def.category),
        defId: def.id,
        boardId: hit.boardId,
        anchor: centeredAnchor(def, placing.rotation, placing.item.span, hit.fx, hit.fy),
        rotation: placing.rotation,
        props: { ...placing.item.props },
        ...(placing.item.span !== undefined ? { span: placing.item.span } : {}),
      };
      const snapped = findPlacement(c, base, { ignoreId: base.id });
      const ghost = { instance: snapped ?? base, valid: snapped !== null };
      setGhost(ghost);
      return ghost;
    };
    ghostAtRef.current = compute;
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
    // 觸控拖曳中瀏覽器接手（例如改成捲動元件庫）會送 pointercancel，這時取消拿起的元件。
    const onCancel = () => {
      const store = useStore.getState();
      if (store.placing?.dragging) store.cancelPlacing();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    if (lastPointer.current) compute(lastPointer.current.x, lastPointer.current.y);
    return () => {
      ghostAtRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [placing, clientToHit, setGhost]);

  const startPan = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: 'pan', pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origin: useStore.getState().viewport });
  };

  /** 畫布座標（相對於 svg 左上角）。 */
  const canvasPoint = (p: Point): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? { x: p.x - rect.left, y: p.y - rect.top } : p;
  };

  /** 第二指按下：放棄第一指正在做的事（還沒完成的接線、移動、平移），改成兩指縮放與平移。 */
  const startPinch = (svg: SVGSVGElement): boolean => {
    // 已經放開的手指 setPointerCapture 會丟出錯誤：從清單拿掉，當成一般的單指操作。
    for (const id of touches.current.keys()) {
      try {
        svg.setPointerCapture(id);
      } catch {
        touches.current.delete(id);
      }
    }
    if (touches.current.size !== 2) return false;
    const [[idA, a], [idB, b]] = [...touches.current.entries()];
    pendingTap.current = null;
    const held = pressedButton.current;
    if (held) {
      pressedButton.current = null;
      useStore.getState().pressButton(held.id, false);
    }
    setHover(null);
    setDrag({ kind: 'pinch', pointerId: idA, ids: [idA, idB], origin: useStore.getState().viewport, a0: canvasPoint(a), b0: canvasPoint(b) });
    return true;
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    setMenu(null);
    if (e.pointerType === 'touch') {
      // 第一根手指（isPrimary）按下時，之前的手指一定都放開了：清掉沒收到放開事件的舊紀錄。
      if (e.isPrimary) touches.current.clear();
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2 && startPinch(e.currentTarget)) return;
      if (touches.current.size > 2) return;
    }
    const store = useStore.getState();
    if (store.routing) return;
    if (store.simulation) {
      onSimulationPointerDown(e);
      return;
    }
    if (store.placing) {
      // 觸控與觸控筆：按下時沒有游標位置可以預覽，放開時才放置（中途滑動 = 平移）。
      if (e.pointerType !== 'mouse' && !store.placing.dragging) {
        e.currentTarget.setPointerCapture(e.pointerId);
        pendingTap.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, origin: store.viewport };
        return;
      }
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
    const handleEl = target.closest('[data-wire-handle]');
    if (handleEl) {
      const wireId = handleEl.getAttribute('data-wire-handle-of')!;
      const which = handleEl.getAttribute('data-wire-handle') as 'start' | 'end';
      const w = circuitRef.current.wires.find((x) => x.id === wireId);
      if (w) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ kind: 'wire-end', pointerId: e.pointerId, wireId, which, fixed: which === 'start' ? w.end : w.start, startX: e.clientX, startY: e.clientY, started: false, current: null, valid: false });
      }
      return;
    }
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
    const wireId = wireEl?.getAttribute('data-wire-id');
    // 按在沒被選取的導線端點上：當成按在孔上，可以從這裡再拉一條線（手動接線可以一孔多線）。
    const onEnd = !!target.closest('[data-wire-end]') && !(store.selection?.kind === 'wire' && store.selection.id === wireId);
    if (wireEl && wireId && !onEnd) {
      store.select({ kind: 'wire', id: wireId });
      return;
    }
    const hit = clientToHit(e.clientX, e.clientY);
    const point = hit ? { boardId: hit.boardId, x: hit.x, y: hit.y } : null;
    if (point && isHole(circuitRef.current, point)) {
      if (canStartWire(circuitRef.current, point)) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ kind: 'wire', pointerId: e.pointerId, start: point, startX: e.clientX, startY: e.clientY, started: false, current: null, path: [point], valid: false });
      } else {
        store.select({ kind: 'hole', point });
      }
      return;
    }
    // 有多塊板時，拖曳板子沒有孔的地方 = 移動這塊板所在的整個群組（Alt / Shift：只移動這一塊）。
    if (hit && circuitRef.current.boards.length > 1) {
      const single = e.altKey || e.shiftKey;
      const ids = single ? [hit.boardId] : groupMembers(circuitRef.current, hit.boardId);
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ kind: 'board', pointerId: e.pointerId, boardId: hit.boardId, ids, startX: e.clientX, startY: e.clientY, started: false, plan: null });
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

  /** 游標所在的格點；要和 from 在同一個 Board Group（直線可以跨過兩板之間的接縫）。 */
  const pointUnder = (clientX: number, clientY: number, from: GridPoint): GridPoint | null => {
    const hit = clientToHit(clientX, clientY);
    const groupOf = buildLattice(circuitRef.current.boards).groupOf;
    return hit && groupOf.get(hit.boardId) === groupOf.get(from.boardId) ? { boardId: hit.boardId, x: hit.x, y: hit.y } : null;
  };

  const updateWire = (d: WireDrag, clientX: number, clientY: number) => {
    const current = pointUnder(clientX, clientY, d.start);
    if (d.started && samePoint(current, d.current)) return;
    const valid = !!current && !straightWireProblem(circuitRef.current, d.start, current);
    setDrag({ ...d, started: true, current, path: current ? [d.start, current] : [d.start], valid });
  };

  const updateWireEnd = (d: WireEndDrag, clientX: number, clientY: number) => {
    const current = pointUnder(clientX, clientY, d.fixed);
    if (d.started && samePoint(current, d.current)) return;
    const [start, end] = d.which === 'start' ? [current, d.fixed] : [d.fixed, current];
    const valid = !!current && !!start && !!end && !straightWireProblem(circuitRef.current, start, end, d.wireId);
    setDrag({ ...d, started: true, current, valid });
  };

  const updateBoardDrag = (d: BoardDrag, clientX: number, clientY: number) => {
    const scale = useStore.getState().viewport.scale;
    const dx = (clientX - d.startX) / (scale * PITCH);
    const dy = (clientY - d.startY) / (scale * PITCH);
    const plan = snapBoardMove(circuitRef.current, d.ids, dx, dy, snapUnits(scale));
    if (d.started && samePlan(plan, d.plan)) return;
    setDrag({ ...d, started: true, plan });
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
      else if (hit && circuitRef.current.boards.length > 1) next = { kind: 'board', id: hit.boardId, x: e.clientX, y: e.clientY };
    }
    if (!sameHover(next, hoverRef.current)) setHover(next);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = dragRef.current;
    if (d?.kind === 'pinch') {
      const [a, b] = d.ids.map((id) => touches.current.get(id));
      if (a && b) useStore.getState().setViewport(pinchViewport(d.origin, d.a0, d.b0, canvasPoint(a), canvasPoint(b)));
      return;
    }
    const tap = pendingTap.current;
    if (tap && tap.pointerId === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >= DRAG_THRESHOLD * 2) {
      pendingTap.current = null;
      setDrag({ kind: 'pan', pointerId: e.pointerId, startX: tap.x, startY: tap.y, origin: tap.origin });
      return;
    }
    if (d) {
      if (d.kind === 'pan') {
        useStore.getState().setViewport(panBy(d.origin, e.clientX - d.startX, e.clientY - d.startY));
        return;
      }
      if (!d.started && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      if (hoverRef.current) setHover(null);
      if (d.kind === 'move') updateMove(d, e.clientX, e.clientY);
      else if (d.kind === 'board') updateBoardDrag(d, e.clientX, e.clientY);
      else if (d.kind === 'wire-end') updateWireEnd(d, e.clientX, e.clientY);
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
    touches.current.delete(e.pointerId);
    const tap = pendingTap.current;
    if (tap && tap.pointerId === e.pointerId) {
      pendingTap.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      const store = useStore.getState();
      if (store.placing && !store.placing.dragging) {
        const g = ghostAtRef.current?.(e.clientX, e.clientY) ?? null;
        if (g?.valid) store.placeComponent(store.placing.item, g.instance.rotation, g.instance.boardId, g.instance.anchor);
        else store.toast('warning', '這裡放不下：腳必須插在空孔上，而且不能和其他元件重疊');
      }
      return;
    }
    if (releaseButton(e)) return;
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'pinch') {
      // 任一指放開就結束兩指手勢；剩下的那一指不再做任何事，但仍由 svg 捕捉，
      // 它放開時才會收到 pointerup，從 touches 拿掉。
      if (!d.ids.includes(e.pointerId)) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      setDrag(null);
      return;
    }
    if (e.currentTarget.hasPointerCapture(d.pointerId)) e.currentTarget.releasePointerCapture(d.pointerId);
    setDrag(null);
    const store = useStore.getState();
    if (d.kind === 'move' && d.started) {
      const original = circuitRef.current.components.find((c) => c.id === d.id);
      const p = d.preview;
      if (!d.valid || !p) store.toast('warning', '這裡放不下，元件已放回原位');
      else if (original && (original.boardId !== p.boardId || original.anchor.x !== p.anchor.x || original.anchor.y !== p.anchor.y || original.rotation !== p.rotation)) {
        store.moveComponent(d.id, p.anchor, p.rotation, p.boardId !== original.boardId ? p.boardId : undefined);
      }
    } else if (d.kind === 'board') {
      const plan = d.plan;
      if (!d.started || !plan) store.select({ kind: 'board', id: d.boardId });
      else if (plan.dx !== 0 || plan.dy !== 0 || plan.blocked) store.moveBoards(d.ids, plan.dx, plan.dy);
    } else if (d.kind === 'wire') {
      if (!d.started) store.select({ kind: 'hole', point: d.start });
      // 不合法時由 store 跳出原因（經過元件、重疊、接在元件腳上…）。
      else if (d.current) store.addWire(d.start, d.current);
    } else if (d.kind === 'wire-end') {
      if (d.started && d.current) store.moveWireEnd(d.wireId, d.which, d.current);
    }
  };

  const onContextMenu = (e: ReactMouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    const store = useStore.getState();
    if (store.placing) {
      // Android 長按也會送 contextmenu：手指還按著（等放開才放置）時不取消，只有滑鼠右鍵取消。
      if (!pendingTap.current && touches.current.size === 0) store.cancelPlacing();
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
      const hit = clientToHit(e.clientX, e.clientY);
      if (hit && circuitRef.current.boards.length > 1 && !isHole(circuitRef.current, { boardId: hit.boardId, x: hit.x, y: hit.y })) {
        store.select({ kind: 'board', id: hit.boardId });
        setMenu({ x, y, target: { kind: 'board', id: hit.boardId } });
      } else {
        setMenu({ x, y, target: { kind: 'canvas' } });
      }
    }
  };

  // ---------- 高亮 ----------
  // 在接線清單裡點選的導線：只標出那一條，不高亮整個 Net。
  const checklistFocus = checklistOpen && selection?.kind === 'wire' ? selection.id : null;
  const selectedNet: Net | null = useMemo(() => {
    if (!selection) return null;
    switch (selection.kind) {
      case 'pin':
        return netOfPin(analysis, selection) ?? null;
      case 'wire':
        return checklistFocus ? null : (analysis.netByWire.get(selection.id) ?? null);
      case 'net':
        return analysis.netById.get(selection.netId) ?? null;
      case 'hole': {
        const g = groupOf(circuit, selection.point);
        return g ? (analysis.netByGroup.get(g) ?? null) : null;
      }
      default:
        return null;
    }
  }, [selection, analysis, circuit, checklistFocus]);

  const shownIssues = useMemo(() => {
    const list = showCheck ? analysis.issues.filter((i) => i.severity !== 'info') : [];
    if (selection?.kind === 'issue') {
      const picked = analysis.issues[selection.index];
      if (picked && !list.includes(picked)) list.push(picked);
    }
    return list;
  }, [showCheck, analysis, selection]);

  const flash = useStore((s) => s.flash);

  // 選取一個檢查錯誤時：解說的建議孔位、建議導線與要拔掉的導線（規格：子專案 5 第 2.2 節）。
  const explanation = useMemo(() => {
    const picked = selection?.kind === 'issue' ? analysis.issues[selection.index] : undefined;
    return picked ? explainIssue(circuit, picked) : null;
  }, [selection, analysis, circuit]);

  const hoverGroup = hover?.kind === 'hole' ? groupOf(circuit, hover.point) : null;
  const hoverFree = hover?.kind === 'hole' && canStartWire(circuit, hover.point);
  const movingId = drag?.kind === 'move' && drag.started ? drag.id : undefined;
  const wiresById = useMemo(() => new Map(circuit.wires.map((w) => [w.id, w])), [circuit.wires]);
  // 接線清單：已打勾的線變淡；在清單裡點了一條線時，其他線都變淡，方便在板上找到它。
  const dimmedWires = useMemo(() => {
    const set = new Set<string>();
    for (const w of circuit.wires) if (checklistFocus ? w.id !== checklistFocus : isChecked(checklist, w)) set.add(w.id);
    return set;
  }, [circuit.wires, checklist, checklistFocus]);
  const componentsById = useMemo(() => new Map(circuit.components.map((c) => [c.id, c])), [circuit.components]);

  const preview = drag?.kind === 'move' && drag.started ? drag.preview : ghost?.instance ?? null;
  const previewValid = drag?.kind === 'move' && drag.started ? drag.valid : !!ghost?.valid;
  const previewDef = preview ? getComponentDefinition(preview.defId) : undefined;
  const previewAt = preview ? toWorld(frames, { boardId: preview.boardId, ...preview.anchor }) : null;
  const previewPins = preview && previewDef ? resolveFootprint(preview, previewDef).pins : [];

  const cursor =
    drag?.kind === 'pan' || boardDrag
      ? 'grabbing'
      : spaceDown
        ? 'grab'
        : placing
          ? 'copy'
          : drag?.kind === 'wire'
            ? 'crosshair'
            : hoverFree
              ? 'crosshair'
              : hover?.kind === 'board'
                ? 'grab'
                : 'default';
  const selectedBoardId = selection?.kind === 'board' ? selection.id : null;

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
          touches.current.delete(e.pointerId);
          if (pendingTap.current?.pointerId === e.pointerId) pendingTap.current = null;
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
          <GroupOutlines boards={displayBoards} activeBoardId={selectedBoardId ?? (boardDrag ? boardDrag.boardId : null)} />
          {frames.map((f) => (
            <BoardBackground key={f.id} frame={f} label={multiBoard ? f.id : undefined} />
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

          <WiresLayer wires={circuit.wires} frames={frames} animation={animation} faded={routing !== null} dimmed={dimmedWires} levels={wireLevels} />

          <g data-ui="over">
            <PinTargets components={circuit.components} frames={frames} hiddenId={movingId} />
            {selectedNet?.pins.map((ref) => {
              const p = pinPoint(circuit, ref.componentId, ref.pinNumber);
              return p ? <Ring key={`${ref.componentId}#${ref.pinNumber}`} frames={frames} point={p} color={UI.net} r={0.4} width={2} /> : null;
            })}
            {animation?.moves.map((m) => {
              const c = componentsById.get(m.componentId);
              if (!c) return null;
              return (
                <g key={`moved-${m.componentId}`} pointerEvents="none" data-moved-ic={m.componentId}>
                  <Outline rect={componentRect(frames, placeAt(c, m.from), 0.75)} color={UI.warning} />
                  <Outline rect={componentRect(frames, c, 0.75)} color={UI.warning} dashed={false} width={2.6} />
                </g>
              );
            })}
            {selection?.kind === 'component' && selection.id !== movingId && componentsById.get(selection.id) && (
              <Outline rect={componentRect(frames, componentsById.get(selection.id)!)} color={UI.select} />
            )}
            {selection?.kind === 'pin' && (
              <Ring frames={frames} point={pinPoint(circuit, selection.componentId, selection.pinNumber) ?? { boardId: '', x: 0, y: 0 }} color={UI.select} r={0.5} width={2.6} />
            )}
            {selection?.kind === 'hole' && <Ring frames={frames} point={selection.point} color={UI.select} r={0.45} width={2.4} />}
            {selection?.kind === 'wire' && !simulating && !routing && drag?.kind !== 'wire-end' && wiresById.get(selection.id) && (
              <WireHandles frames={frames} wire={wiresById.get(selection.id)!} />
            )}

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
            {explanation && <SuggestionMarks frames={frames} circuit={circuit} explanation={explanation} />}
            <FlashRings frames={frames} flash={flash} />

            {hover?.kind === 'hole' && <Ring frames={frames} point={hover.point} color={hoverFree ? UI.hover : '#94a3b8'} r={0.36} width={2} />}
            {selectedBoardId && !boardDrag && <BoardSelection boards={displayBoards} id={selectedBoardId} />}
            {boardDrag && boardPlan && (
              <>
                <MovingBoards boards={displayBoards} ids={boardDrag.ids} plan={boardPlan} />
                <SnapPreview boards={displayBoards} plan={boardPlan} />
              </>
            )}

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
            {drag?.kind === 'wire-end' && drag.started && (
              <g pointerEvents="none">
                <PathPreview frames={frames} path={drag.current ? [drag.fixed, drag.current] : [drag.fixed]} color={wiresById.get(drag.wireId)?.color ?? wireColor} valid={drag.valid} />
                <Ring frames={frames} point={drag.fixed} color={UI.ok} r={0.42} width={2.4} />
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
      <CanvasHud drawingWire={drag?.kind === 'wire' && drag.started} movingBoards={boardDrag !== null} />
    </div>
  );
}
