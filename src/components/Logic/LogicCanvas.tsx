import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { panBy, screenToWorld, zoomAt } from '../../editor/viewport';
import { canPlace, connect, moveNode } from '../../logic/edit';
import { evaluate, type Bit } from '../../logic/evaluate';
import { inputPins, nodeSize, outputPin, type GridXY } from '../../logic/shapes';
import { isGate, type LogicNode } from '../../logic/types';
import { busColumns, junctions, wireRoute } from '../../logic/wiring';
import { LOGIC_CELL, useLogic } from '../../state/logic';
import { bitColor, GateBody } from './GateSymbol';

const C = LOGIC_CELL;

/** 腳的識別：`g1:out` 或 `g1:in:0`。 */
type PinId = { node: string; out: true } | { node: string; out: false; pin: number };

function parsePin(text: string | null | undefined): PinId | null {
  if (!text) return null;
  const [node, side, pin] = text.split(':');
  if (side === 'out') return { node, out: true };
  if (side === 'in') return { node, out: false, pin: Number(pin) };
  return null;
}

type Drag =
  | { kind: 'pan'; x: number; y: number; moved: boolean }
  | { kind: 'move'; id: string; startX: number; startY: number; node: LogicNode; dx: number; dy: number }
  | { kind: 'wire'; from: PinId; at: GridXY; to: PinId | null };

/** 輸入端：名稱、開關（點了切換 0 / 1）。 */
function InputTerminal({ node, selected }: { node: LogicNode; selected: boolean }) {
  const v = node.value ?? 0;
  return (
    <g>
      <rect x={-0.9 * C} y={-0.45 * C} width={2.3 * C} height={0.9 * C} rx={4} fill="#ffffff" stroke={selected ? '#0284c7' : '#1e293b'} strokeWidth={selected ? 2.4 : 1.6} />
      <text x={-0.45 * C} y={0} fontSize={0.5 * C} fontWeight={700} fill="#1e293b" textAnchor="middle" dominantBaseline="central">
        {node.name}
      </text>
      <g
        data-logic-switch={node.id}
        style={{ cursor: 'pointer' }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          useLogic.getState().toggleInput(node.id);
        }}
      >
        <rect x={0.05 * C} y={-0.32 * C} width={1.1 * C} height={0.64 * C} rx={0.32 * C} fill={v === 1 ? '#fecaca' : '#dbeafe'} stroke={bitColor(v)} strokeWidth={1.5} />
        <circle cx={v === 1 ? 0.83 * C : 0.37 * C} cy={0} r={0.24 * C} fill={bitColor(v)} />
        <text x={v === 1 ? 0.37 * C : 0.83 * C} y={0} fontSize={0.36 * C} fontWeight={700} fill="#334155" textAnchor="middle" dominantBaseline="central">
          {v}
        </text>
      </g>
      <line x1={1.4 * C} y1={0} x2={2 * C} y2={0} stroke={bitColor(v)} strokeWidth={2} />
    </g>
  );
}

/** 輸出端：燈號（1 / 0 / ?）與名稱。 */
function OutputTerminal({ node, value, selected }: { node: LogicNode; value: Bit | undefined; selected: boolean }) {
  const text = value === 1 ? '1' : value === 0 ? '0' : '?';
  return (
    <g>
      <line x1={0} y1={0} x2={0.5 * C} y2={0} stroke={bitColor(value)} strokeWidth={2} />
      <rect x={0.5 * C} y={-0.45 * C} width={2.2 * C} height={0.9 * C} rx={4} fill="#ffffff" stroke={selected ? '#0284c7' : '#1e293b'} strokeWidth={selected ? 2.4 : 1.6} />
      <circle cx={0.95 * C} cy={0} r={0.3 * C} fill={value === 1 ? '#ef4444' : value === 0 ? '#bfdbfe' : '#e2e8f0'} stroke={bitColor(value)} strokeWidth={1.5} />
      <text data-logic-lamp={node.id} x={0.95 * C} y={0} fontSize={0.36 * C} fontWeight={700} fill={value === 1 ? '#ffffff' : '#334155'} textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
      <text x={1.85 * C} y={0} fontSize={0.5 * C} fontWeight={700} fill="#1e293b" textAnchor="middle" dominantBaseline="central">
        {node.name}
      </text>
    </g>
  );
}

/** 規格（2026-10-11 logic-diagram）第 5 節：邏輯圖畫布。 */
export function LogicCanvas() {
  const diagram = useLogic((s) => s.diagram);
  const viewport = useLogic((s) => s.viewport);
  const selection = useLogic((s) => s.selection);
  const placing = useLogic((s) => s.placing);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<GridXY | null>(null);
  const fitted = useRef(false);

  const values = useMemo(() => evaluate(diagram), [diagram]);
  const valueOf = (id: string): Bit | undefined => (values.loop ? undefined : values.nodes.get(id));
  const driver = useMemo(() => new Map(diagram.wires.map((w) => [`${w.to.node}#${w.to.pin}`, w.from])), [diagram]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      useLogic.getState().setCanvasSize(r.width, r.height);
      if (!fitted.current) {
        fitted.current = true;
        useLogic.getState().fit();
      }
    });
    ro.observe(svg);
    // e2e 用：讀目前的縮放與平移（唯讀）。
    (window as unknown as { __logicViewport?: () => unknown }).__logicViewport = () => useLogic.getState().viewport;
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const s = useLogic.getState();
      s.setViewport(zoomAt(s.viewport, e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  /** 螢幕座標 → 格子（小數）。 */
  const toGrid = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const w = screenToWorld(useLogic.getState().viewport, clientX - r.left, clientY - r.top);
    return { x: w.x / C, y: w.y / C };
  };
  const cellAt = (clientX: number, clientY: number): GridXY => {
    const g = toGrid(clientX, clientY);
    return { x: Math.round(g.x), y: Math.round(g.y) };
  };
  const pinUnder = (clientX: number, clientY: number): PinId | null =>
    parsePin((document.elementFromPoint(clientX, clientY) as Element | null)?.closest('[data-logic-pin]')?.getAttribute('data-logic-pin'));

  const onBackgroundDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    if (!placing) setDrag({ kind: 'pan', x: e.clientX, y: e.clientY, moved: false });
  };
  const onNodeDown = (e: ReactPointerEvent, node: LogicNode) => {
    if (e.button !== 0 || placing) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    const g = toGrid(e.clientX, e.clientY);
    setDrag({ kind: 'move', id: node.id, startX: g.x, startY: g.y, node, dx: 0, dy: 0 });
  };
  const onPinDown = (e: ReactPointerEvent, pin: PinId) => {
    if (e.button !== 0 || placing) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag({ kind: 'wire', from: pin, at: toGrid(e.clientX, e.clientY), to: null });
  };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (placing) setHover(cellAt(e.clientX, e.clientY));
    if (!drag) return;
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      const s = useLogic.getState();
      s.setViewport(panBy(s.viewport, dx, dy));
      setDrag({ ...drag, x: e.clientX, y: e.clientY, moved: true });
    } else if (drag.kind === 'move') {
      const g = toGrid(e.clientX, e.clientY);
      setDrag({ ...drag, dx: Math.round(g.x - drag.startX), dy: Math.round(g.y - drag.startY) });
    } else {
      setDrag({ ...drag, at: toGrid(e.clientX, e.clientY), to: pinUnder(e.clientX, e.clientY) });
    }
  };

  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = useLogic.getState();
    if (s.placing) {
      const c = cellAt(e.clientX, e.clientY);
      if (!s.place(s.placing, c.x, c.y)) s.startPlacing(s.placing); // 放不下：繼續拿著
      setDrag(null);
      return;
    }
    if (!drag) return;
    if (drag.kind === 'pan' && !drag.moved) s.select(null);
    if (drag.kind === 'move') {
      if (drag.dx === 0 && drag.dy === 0) s.select({ kind: 'node', id: drag.id });
      else s.apply(moveNode(s.diagram, drag.id, drag.node.x + drag.dx, drag.node.y + drag.dy), `移動 ${drag.id}`, { kind: 'node', id: drag.id });
    }
    if (drag.kind === 'wire') {
      const to = pinUnder(e.clientX, e.clientY);
      const pair = wirePair(drag.from, to);
      if (pair) s.apply(connect(s.diagram, pair.from, pair.to), '連線');
    }
    setDrag(null);
  };

  /** 一端是輸出腳、另一端是輸入腳才能連。 */
  const wirePair = (a: PinId, b: PinId | null): { from: string; to: { node: string; pin: number } } | null => {
    if (!b || a.node === b.node) return null;
    if (a.out && !b.out) return { from: a.node, to: { node: b.node, pin: b.pin } };
    if (!a.out && b.out) return { from: b.node, to: { node: a.node, pin: a.pin } };
    return null;
  };

  const placed = (node: LogicNode): LogicNode => (drag?.kind === 'move' && drag.id === node.id ? { ...node, x: node.x + drag.dx, y: node.y + drag.dy } : node);
  const view = { ...diagram, nodes: diagram.nodes.map(placed) };
  const pinXY = (p: PinId): GridXY | null => {
    const node = view.nodes.find((n) => n.id === p.node);
    if (!node) return null;
    return p.out ? outputPin(node) : (inputPins(node)[p.pin] ?? null);
  };

  const ghost: LogicNode | null =
    placing && hover ? { id: '__ghost', kind: placing, x: hover.x, y: hover.y, inputs: isGate(placing) ? (placing === 'NOT' ? 1 : 2) : undefined, name: placing === 'INPUT' ? '?' : placing === 'OUTPUT' ? '?' : undefined, value: 0 } : null;
  const ghostOk = ghost ? canPlace(diagram, ghost) : true;
  const moveOk = drag?.kind === 'move' ? canPlace(diagram, placed(drag.node), drag.id) : true;
  const wireOk = drag?.kind === 'wire' ? drag.to === null || wirePair(drag.from, drag.to) !== null : true;
  const columns = busColumns(view);
  const dots = junctions(view, columns);
  const pattern = C * viewport.scale;

  return (
    <svg
      ref={svgRef}
      data-testid="logic-canvas"
      className="h-full w-full touch-none select-none bg-slate-100"
      style={{ cursor: placing ? 'crosshair' : drag?.kind === 'pan' && drag.moved ? 'grabbing' : 'default' }}
      onPointerDown={onBackgroundDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setHover(null)}
    >
      <defs>
        <pattern id="logic-grid" width={pattern} height={pattern} patternUnits="userSpaceOnUse" x={viewport.x % pattern} y={viewport.y % pattern}>
          <circle cx={0} cy={0} r={1.1} fill="#cbd5e1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#logic-grid)" />
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
        {/* 線（在元件下面） */}
        {view.wires.map((w) => {
          const pts = wireRoute(view, w, columns);
          if (pts.length < 2) return null;
          const sel = selection?.kind === 'wire' && selection.id === w.id;
          const color = bitColor(valueOf(w.from));
          const d = pts.map((p) => `${p.x * C},${p.y * C}`).join(' ');
          return (
            <g key={w.id} data-logic-wire={w.id}>
              <polyline
                points={d}
                fill="none"
                stroke="transparent"
                strokeWidth={10}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => {
                  if (placing) return;
                  e.stopPropagation();
                  useLogic.getState().select({ kind: 'wire', id: w.id });
                }}
              />
              <polyline points={d} fill="none" stroke={sel ? '#0284c7' : color} strokeWidth={sel ? 3.5 : 2} strokeLinejoin="round" pointerEvents="none" />
            </g>
          );
        })}
        {dots.map((p, i) => (
          <circle key={i} cx={p.x * C} cy={p.y * C} r={0.18 * C} fill="#1e293b" pointerEvents="none" />
        ))}

        {view.nodes.map((node) => {
          const sel = selection?.kind === 'node' && selection.id === node.id;
          const moving = drag?.kind === 'move' && drag.id === node.id;
          const { w, h } = nodeSize(node);
          const ins = inputPins(node).map((_, i) => {
            const from = driver.get(`${node.id}#${i}`);
            return from === undefined ? undefined : valueOf(from);
          });
          return (
            <g key={node.id} data-logic-node={node.id} transform={`translate(${node.x * C} ${node.y * C})`} opacity={moving && !moveOk ? 0.5 : 1}>
              {/* 拖曳與選取的範圍 */}
              <rect
                x={0.3 * C - (node.kind === 'INPUT' ? 1.2 * C : 0)}
                y={-0.5 * C}
                width={(w - 0.6) * C + (node.kind === 'INPUT' ? 1.2 * C : 0) + (node.kind === 'OUTPUT' ? 0.7 * C : 0)}
                height={h * C}
                fill="transparent"
                style={{ cursor: 'move' }}
                onPointerDown={(e) => onNodeDown(e, node)}
              />
              <g pointerEvents="none">
                {node.kind === 'INPUT' ? null : node.kind === 'OUTPUT' ? (
                  <OutputTerminal node={node} value={values.loop ? undefined : values.nodes.get(node.id)} selected={sel} />
                ) : (
                  <GateBody node={node} value={valueOf(node.id)} inputs={ins} selected={sel} />
                )}
              </g>
              {node.kind === 'INPUT' && (
                <g onPointerDown={(e) => onNodeDown(e, node)}>
                  <InputTerminal node={node} selected={sel} />
                </g>
              )}
              {/* 腳（拖曳連線的起點與終點） */}
              {inputPins({ ...node, x: 0, y: 0 }).map((p, i) => (
                <circle
                  key={`in${i}`}
                  data-logic-pin={`${node.id}:in:${i}`}
                  cx={p.x * C}
                  cy={p.y * C}
                  r={0.32 * C}
                  fill={drag?.kind === 'wire' && drag.to?.node === node.id && !drag.to.out && drag.to.pin === i ? (wireOk ? '#7dd3fc' : '#fca5a5') : 'transparent'}
                  stroke="transparent"
                  style={{ cursor: 'crosshair' }}
                  onPointerDown={(e) => onPinDown(e, { node: node.id, out: false, pin: i })}
                />
              ))}
              {(() => {
                const o = outputPin({ ...node, x: 0, y: 0 });
                return o ? (
                  <circle
                    data-logic-pin={`${node.id}:out`}
                    cx={o.x * C}
                    cy={o.y * C}
                    r={0.32 * C}
                    fill={drag?.kind === 'wire' && drag.to?.node === node.id && drag.to.out ? (wireOk ? '#7dd3fc' : '#fca5a5') : 'transparent'}
                    style={{ cursor: 'crosshair' }}
                    onPointerDown={(e) => onPinDown(e, { node: node.id, out: true })}
                  />
                ) : null;
              })()}
            </g>
          );
        })}

        {drag?.kind === 'wire' &&
          (() => {
            const a = pinXY(drag.from);
            return a ? (
              <line x1={a.x * C} y1={a.y * C} x2={drag.at.x * C} y2={drag.at.y * C} stroke={wireOk ? '#0284c7' : '#ef4444'} strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
            ) : null;
          })()}

        {ghost && (
          <g transform={`translate(${ghost.x * C} ${ghost.y * C})`} opacity={0.55} pointerEvents="none">
            {ghost.kind === 'INPUT' ? <InputTerminal node={ghost} selected={false} /> : ghost.kind === 'OUTPUT' ? <OutputTerminal node={ghost} value={undefined} selected={false} /> : <GateBody node={ghost} />}
            {!ghostOk && <rect x={0} y={-0.5 * C} width={nodeSize(ghost).w * C} height={nodeSize(ghost).h * C} fill="#ef4444" opacity={0.35} />}
          </g>
        )}
      </g>
    </svg>
  );
}

