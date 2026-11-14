import { BLOCK_NAMES, BLOCK_PINS } from '../../logic/blocks';
import type { Bit } from '../../logic/evaluate';
import { bodyRect, inputDir, inputPins, outputDir, outputPins, type Facing } from '../../logic/shapes';
import type { LogicNode } from '../../logic/types';
import { LOGIC_CELL as C } from '../../state/logic';
import { upright } from './GateSymbol';

const pinColor = (b: Bit | undefined) => (b === 1 ? '#dc2626' : b === 0 ? '#2563eb' : '#94a3b8');
/** 腳朝外的方向（格子）。 */
const STEP: Record<Facing, [number, number]> = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
/** 腳的短線長度（格）。 */
const INSET = 0.6;

/** 腳名的位置與對齊：在腳往裡一點的地方；左右兩邊的腳靠邊對齊，上下的腳置中。 */
function labelAt(p: { x: number; y: number }, facing: Facing): { x: number; y: number; anchor: 'start' | 'end' | 'middle' } {
  const [dx, dy] = STEP[facing];
  if (dy === 0) return { x: (p.x - dx * (INSET + 0.15)) * C, y: p.y * C, anchor: dx < 0 ? 'start' : 'end' };
  return { x: p.x * C, y: (p.y - dy * (INSET + 0.3)) * C, anchor: 'middle' };
}

/**
 * 規格（2026-10-13 logic-blocks）第 6 節：IC 方塊。沒轉時左邊輸入腳、右邊輸出腳，腳旁寫腳名；上方寫 IC 型號。
 * 子專案 26：轉向時腳跟著換邊，字一律正著寫（腳在上下兩邊時，型號寫在方框中間）。
 */
/** 子專案 65：自訂方塊用 labels（名稱、說明、腳名）；IC 方塊照 IC 型號。 */
export function BlockBody({
  node,
  inputs = [],
  outputs = [],
  selected = false,
  labels,
}: {
  node: LogicNode;
  inputs?: Array<Bit | undefined>;
  outputs?: Array<Bit | undefined>;
  selected?: boolean;
  labels?: { title: string; subtitle: string; inputs: string[]; outputs: string[] };
}) {
  const pins = labels ?? (node.chip ? { title: node.chip, subtitle: BLOCK_NAMES[node.chip], ...BLOCK_PINS[node.chip] } : null);
  if (!pins) return null;
  const custom = labels !== undefined;
  const local = { ...node, x: 0, y: 0 };
  const ins = inputPins(local);
  const outs = outputPins(local);
  const inFacing = inputDir(node);
  const outFacing = outputDir(node);
  const r = bodyRect(local);
  const sideways = inFacing === 'W' || inFacing === 'E';
  const box = sideways ? { x0: r.x0 + INSET, x1: r.x1 - INSET, y0: r.y0, y1: r.y1 } : { x0: r.x0, x1: r.x1, y0: r.y0 + INSET, y1: r.y1 - INSET };
  const cx = ((box.x0 + box.x1) / 2) * C;
  const cy = ((box.y0 + box.y1) / 2) * C;
  const stub = (p: { x: number; y: number }, facing: Facing) => {
    const [dx, dy] = STEP[facing];
    return { x1: p.x * C, y1: p.y * C, x2: (p.x - dx * INSET) * C, y2: (p.y - dy * INSET) * C };
  };
  return (
    <g data-logic-block={node.id}>
      {ins.map((p, k) => (
        <line key={`i${k}`} {...stub(p, inFacing)} stroke={pinColor(inputs[k])} strokeWidth={2} />
      ))}
      {outs.map((p, k) => (
        <line key={`o${k}`} {...stub(p, outFacing)} stroke={pinColor(outputs[k])} strokeWidth={2} />
      ))}
      <rect x={box.x0 * C} y={box.y0 * C} width={(box.x1 - box.x0) * C} height={(box.y1 - box.y0) * C} rx={3} fill={custom ? '#f0fdf4' : '#ffffff'} stroke={selected ? '#0284c7' : custom ? '#15803d' : '#1e293b'} strokeWidth={selected ? 2.4 : 1.6} />
      <text x={cx} y={sideways ? (box.y0 - 0.45) * C : cy - 0.3 * C} fontSize={0.5 * C} fontWeight={700} fill="#1e293b" textAnchor="middle" dominantBaseline="central">
        {pins.title}
      </text>
      <text x={cx} y={sideways ? (box.y1 - 0.5) * C : cy + 0.35 * C} fontSize={0.36 * C} fill="#64748b" textAnchor="middle" dominantBaseline="central">
        {pins.subtitle}
      </text>
      {pins.inputs.map((name, k) => {
        const l = labelAt(ins[k], inFacing);
        return (
          <text key={`ti${k}`} x={l.x} y={l.y} fontSize={0.4 * C} fill="#334155" textAnchor={l.anchor} dominantBaseline="central">
            {name}
          </text>
        );
      })}
      {pins.outputs.map((name, k) => {
        const l = labelAt(outs[k], outFacing);
        return (
          <text key={`to${k}`} x={l.x} y={l.y} fontSize={0.4 * C} fill="#334155" textAnchor={l.anchor} dominantBaseline="central" data-logic-out={`${node.id}:${k}`} data-value={outputs[k] ?? ''}>
            {name}
          </text>
        );
      })}
    </g>
  );
}

/**
 * 子專案 66（規格 2026-11-14 bus 第 4 節）：合起來 / 拆開：中間一條粗線，一位元那一邊每一位一條細線（寫位元編號），匯流排那一邊一條粗線。
 */
export function BusBody({ node, selected = false }: { node: LogicNode; selected?: boolean }) {
  const local = { ...node, x: 0, y: 0 };
  const ins = inputPins(local);
  const outs = outputPins(local);
  const merge = node.kind === 'MERGE';
  const bits = merge ? ins : outs;
  const bus = merge ? outs[0] : ins[0];
  const r = bodyRect(local);
  const mid = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  const sideways = r.x1 - r.x0 < r.y1 - r.y0;
  const color = selected ? '#0284c7' : '#7c3aed';
  // 粗線沿著位元那一排（沒轉時是直的）。
  const bar = sideways ? { x1: mid.x, y1: r.y0 + 0.4, x2: mid.x, y2: r.y1 - 0.4 } : { x1: r.x0 + 0.4, y1: mid.y, x2: r.x1 - 0.4, y2: mid.y };
  const onBar = (p: { x: number; y: number }) => (sideways ? { x: mid.x, y: p.y } : { x: p.x, y: mid.y });
  return (
    <g data-logic-bus={node.id}>
      <line x1={bar.x1 * C} y1={bar.y1 * C} x2={bar.x2 * C} y2={bar.y2 * C} stroke={color} strokeWidth={4} strokeLinecap="round" />
      {bits.map((p, k) => {
        const q = onBar(p);
        return (
          <g key={k}>
            <line x1={p.x * C} y1={p.y * C} x2={q.x * C} y2={q.y * C} stroke="#475569" strokeWidth={1.4} />
            <text x={((p.x + q.x) / 2) * C} y={((p.y + q.y) / 2) * C - 0.22 * C} fontSize={0.34 * C} fill="#475569" textAnchor="middle">
              {k}
            </text>
          </g>
        );
      })}
      {bus && (() => {
        const q = onBar(bus);
        return <line x1={bus.x * C} y1={bus.y * C} x2={q.x * C} y2={q.y * C} stroke={color} strokeWidth={4} />;
      })()}
      <text x={mid.x * C} y={(r.y0 - 0.15) * C} fontSize={0.34 * C} fill="#6d28d9" textAnchor="middle">
        {merge ? '合' : '拆'}
      </text>
    </g>
  );
}

/** 5V（常數 1）、GND（常數 0）。 */
export function ConstantBody({ node, selected = false }: { node: LogicNode; selected?: boolean }) {
  const high = node.kind === 'HIGH';
  return (
    <g data-logic-constant={node.id}>
      <rect x={0} y={-0.45 * C} width={1.6 * C} height={0.9 * C} rx={3} fill={high ? '#fee2e2' : '#dbeafe'} stroke={selected ? '#0284c7' : high ? '#dc2626' : '#2563eb'} strokeWidth={selected ? 2.4 : 1.6} />
      <text x={0.8 * C} y={0} transform={upright(node, 0.8 * C, 0)} fontSize={0.42 * C} fontWeight={700} fill={high ? '#b91c1c' : '#1d4ed8'} textAnchor="middle" dominantBaseline="central">
        {high ? '5V' : 'GND'}
      </text>
      <line x1={1.6 * C} y1={0} x2={2 * C} y2={0} stroke={high ? '#dc2626' : '#2563eb'} strokeWidth={2} />
    </g>
  );
}
