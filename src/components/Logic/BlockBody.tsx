import { BLOCK_NAMES, BLOCK_PINS } from '../../logic/blocks';
import type { Bit } from '../../logic/evaluate';
import { nodeSize } from '../../logic/shapes';
import type { LogicNode } from '../../logic/types';
import { LOGIC_CELL as C } from '../../state/logic';

const pinColor = (b: Bit | undefined) => (b === 1 ? '#dc2626' : b === 0 ? '#2563eb' : '#94a3b8');

/** 規格（2026-10-13 logic-blocks）第 6 節：IC 方塊。左邊輸入腳、右邊輸出腳，腳旁寫腳名；上方寫 IC 型號。 */
export function BlockBody({ node, inputs = [], outputs = [], selected = false }: { node: LogicNode; inputs?: Array<Bit | undefined>; outputs?: Array<Bit | undefined>; selected?: boolean }) {
  if (!node.chip) return null;
  const pins = BLOCK_PINS[node.chip];
  const { w, h } = nodeSize(node);
  const left = 0.6 * C;
  const right = (w - 0.6) * C;
  return (
    <g data-logic-block={node.id}>
      {pins.inputs.map((_, k) => (
        <line key={`i${k}`} x1={0} y1={k * C} x2={left} y2={k * C} stroke={pinColor(inputs[k])} strokeWidth={2} />
      ))}
      {pins.outputs.map((_, k) => (
        <line key={`o${k}`} x1={right} y1={k * C} x2={w * C} y2={k * C} stroke={pinColor(outputs[k])} strokeWidth={2} />
      ))}
      <rect x={left} y={-0.5 * C} width={right - left} height={h * C} rx={3} fill="#ffffff" stroke={selected ? '#0284c7' : '#1e293b'} strokeWidth={selected ? 2.4 : 1.6} />
      <text x={(w * C) / 2} y={-0.95 * C} fontSize={0.5 * C} fontWeight={700} fill="#1e293b" textAnchor="middle" dominantBaseline="central">
        {node.chip}
      </text>
      <text x={(w * C) / 2} y={(h - 1) * C} fontSize={0.36 * C} fill="#64748b" textAnchor="middle" dominantBaseline="central">
        {BLOCK_NAMES[node.chip]}
      </text>
      {pins.inputs.map((name, k) => (
        <text key={`ti${k}`} x={left + 0.15 * C} y={k * C} fontSize={0.4 * C} fill="#334155" dominantBaseline="central">
          {name}
        </text>
      ))}
      {pins.outputs.map((name, k) => (
        <text key={`to${k}`} x={right - 0.15 * C} y={k * C} fontSize={0.4 * C} fill="#334155" textAnchor="end" dominantBaseline="central" data-logic-out={`${node.id}:${k}`} data-value={outputs[k] ?? ''}>
          {name}
        </text>
      ))}
    </g>
  );
}

/** 5V（常數 1）、GND（常數 0）。 */
export function ConstantBody({ node, selected = false }: { node: LogicNode; selected?: boolean }) {
  const high = node.kind === 'HIGH';
  return (
    <g data-logic-constant={node.id}>
      <rect x={0} y={-0.45 * C} width={1.6 * C} height={0.9 * C} rx={3} fill={high ? '#fee2e2' : '#dbeafe'} stroke={selected ? '#0284c7' : high ? '#dc2626' : '#2563eb'} strokeWidth={selected ? 2.4 : 1.6} />
      <text x={0.8 * C} y={0} fontSize={0.42 * C} fontWeight={700} fill={high ? '#b91c1c' : '#1d4ed8'} textAnchor="middle" dominantBaseline="central">
        {high ? '5V' : 'GND'}
      </text>
      <line x1={1.6 * C} y1={0} x2={2 * C} y2={0} stroke={high ? '#dc2626' : '#2563eb'} strokeWidth={2} />
    </g>
  );
}
