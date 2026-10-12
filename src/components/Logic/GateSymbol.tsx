import type { Bit } from '../../logic/evaluate';
import { inputCountOf, nodeSize } from '../../logic/shapes';
import { isGate, type GateKind, type LogicNode, type NodeKind } from '../../logic/types';
import { LOGIC_CELL } from '../../state/logic';

const C = LOGIC_CELL;

/** 值的顏色：1 紅、0 藍、不確定灰。 */
export const BIT_COLOR: Record<string, string> = { '1': '#ef4444', '0': '#3b82f6', X: '#94a3b8' };
export const bitColor = (b: Bit | undefined) => BIT_COLOR[String(b ?? 'X')];

const BUBBLE = 0.16 * C;
const negated = (kind: GateKind) => kind === 'NAND' || kind === 'NOR' || kind === 'NOT';

/** 規格 2.1：IEEE 形狀的外框（區域座標：原點在節點左上角那個格點）。 */
function gatePath(kind: GateKind, w: number, h: number): string {
  const left = 0.5 * C;
  const right = (w - 0.5) * C;
  const top = -0.5 * C;
  const bottom = (h - 0.5) * C;
  const midY = (top + bottom) / 2;
  const tip = right - (negated(kind) ? 2 * BUBBLE : 0);
  const bw = tip - left;
  if (kind === 'NOT') return `M ${left} ${top + 0.05 * C} L ${tip} ${midY} L ${left} ${bottom - 0.05 * C} Z`;
  if (kind === 'AND' || kind === 'NAND') {
    const ry = (bottom - top) / 2;
    const rx = Math.min(ry, bw * 0.55);
    const mid = tip - rx;
    return `M ${left} ${top} H ${mid} A ${rx} ${ry} 0 0 1 ${mid} ${bottom} H ${left} Z`;
  }
  // OR / NOR / XOR：盾形。XOR 本體往右挪一點，左邊多一條弧線（另外畫）。
  const l = kind === 'XOR' ? left + 0.25 * C : left;
  const c1 = l + (tip - l) * 0.55;
  return `M ${l} ${top} Q ${c1} ${top} ${tip} ${midY} Q ${c1} ${bottom} ${l} ${bottom} Q ${l + (tip - l) * 0.28} ${midY} ${l} ${top} Z`;
}

/** 閘的本體與腳的短線；value 是輸出值，inputs 是每個輸入腳的值（決定短線顏色）。 */
export function GateBody({ node, value, inputs, selected }: { node: LogicNode; value?: Bit; inputs?: Bit[]; selected?: boolean }) {
  const kind = node.kind as GateKind;
  const { w, h } = nodeSize(node);
  const n = inputCountOf(node);
  const offsets = n === 4 ? [0, 1, 3, 4] : n === 3 ? [0, 1, 2] : n === 2 ? [0, 2] : [0];
  const outY = Math.floor(h / 2) * C;
  const left = 0.5 * C;
  const right = (w - 0.5) * C;
  const top = -0.5 * C;
  const bottom = (h - 0.5) * C;
  const stroke = selected ? '#0284c7' : '#1e293b';
  return (
    <g>
      {offsets.map((dy, i) => (
        <line key={i} x1={0} y1={dy * C} x2={left + (kind === 'XOR' ? 0.1 * C : 0.15 * C)} y2={dy * C} stroke={bitColor(inputs?.[i])} strokeWidth={2} />
      ))}
      <line x1={right} y1={outY} x2={w * C} y2={outY} stroke={bitColor(value)} strokeWidth={2} />
      <path d={gatePath(kind, w, h)} fill="#ffffff" stroke={stroke} strokeWidth={selected ? 2.6 : 1.8} strokeLinejoin="round" />
      {kind === 'XOR' && <path d={`M ${left} ${top} Q ${left + (right - left) * 0.28} ${(top + bottom) / 2} ${left} ${bottom}`} fill="none" stroke={stroke} strokeWidth={selected ? 2.6 : 1.8} />}
      {negated(kind) && <circle cx={right - BUBBLE} cy={outY} r={BUBBLE} fill="#ffffff" stroke={stroke} strokeWidth={1.6} />}
    </g>
  );
}

/** 元件庫的小圖示。 */
export function PartIcon({ kind }: { kind: NodeKind }) {
  if (!isGate(kind)) {
    return (
      <svg viewBox="0 0 40 24" className="h-6 w-10" aria-hidden>
        <rect x={4} y={5} width={22} height={14} rx={3} fill="#ffffff" stroke="#1e293b" strokeWidth={1.5} />
        <text x={15} y={15.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#1e293b">
          {kind === 'INPUT' ? 'A' : 'X'}
        </text>
        <line x1={kind === 'INPUT' ? 26 : 0} y1={12} x2={kind === 'INPUT' ? 38 : 4} y2={12} stroke="#1e293b" strokeWidth={1.5} />
      </svg>
    );
  }
  const node: LogicNode = { id: 'p', kind, x: 0, y: 0, inputs: kind === 'NOT' ? 1 : 2 };
  const { w, h } = nodeSize(node);
  return (
    <svg viewBox={`${-0.2 * C} ${-0.7 * C} ${(w + 0.4) * C} ${(h + 0.4) * C}`} className="h-6 w-10" aria-hidden>
      <GateBody node={node} />
    </svg>
  );
}
