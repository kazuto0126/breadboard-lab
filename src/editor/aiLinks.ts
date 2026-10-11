import { parseHoleName } from '../core/breadboard/naming';
import { getBoard, getLayout } from '../core/breadboard/registry';
import { resolveFootprint } from '../core/circuit/footprint';
import { getComponentDefinition } from '../core/circuit/library';
import type { Circuit } from '../types/circuit';
import type { GridPoint } from '../types/geometry';

/** 文字裡可以點的一段：點了在板上閃 points。 */
export interface AiLink {
  text: string;
  points: GridPoint[];
}

// 規格第 2 節：腳位（U1 第 3 腳、U1 的第 3 腳、U1 pin 3）、接線柱（紅柱、紅色接線柱）、孔位（A10、T+10、P3+12、2-F30、b2:A12）。
const PIN = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]*)(?:\s*的)?\s*第\s*(\d+)\s*腳|(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]*)\s+[Pp][Ii][Nn]\s*(\d+)/g;
const POST = /(紅|黑|黃|綠)(?:色接線柱|柱)/g;
const HOLE = /(?<![A-Za-z0-9+\-−–:])(?:([A-Za-z]+\d*):)?((?:[TB][+\-−–]|P[1-5][+\-−–]|[1-3]-[A-J]|[A-J])\d+)(?![A-Za-z0-9+\-−–])/g;

function pinPointOf(circuit: Circuit, id: string, pinNumber: number): GridPoint | null {
  const instance = circuit.components.find((c) => c.id === id);
  const def = instance ? getComponentDefinition(instance.defId) : undefined;
  return (instance && def && resolveFootprint(instance, def).pins.find((p) => p.pinNumber === pinNumber)?.point) || null;
}

/** 接線柱：依 circuit.boards 順序第一塊有這支柱子的板。 */
function postPoint(circuit: Circuit, name: string): GridPoint | null {
  for (const b of circuit.boards) {
    const post = getLayout(b.layoutId).posts?.find((p) => p.name === name);
    if (post) return { boardId: b.id, x: post.x, y: post.y };
  }
  return null;
}

/** 有前綴只找那塊板；沒有前綴時只有一塊板有這個孔名才算，和元件 ID 同名的不算。 */
function holePoint(circuit: Circuit, prefix: string | undefined, name: string): GridPoint | null {
  if (prefix) {
    const b = circuit.boards.find((x) => x.id === prefix);
    return b ? parseHoleName(getBoard(b.layoutId, b.id), name) : null;
  }
  if (circuit.components.some((c) => c.id === name)) return null;
  const hits = circuit.boards.map((b) => parseHoleName(getBoard(b.layoutId, b.id), name)).filter((p): p is GridPoint => p !== null);
  return hits.length === 1 ? hits[0] : null;
}

interface Hit {
  start: number;
  end: number;
  priority: number;
  points: GridPoint[];
}

/** 規格第 2 節：把文字切成一般文字與可以點的片段；只有電路裡真的存在的孔或腳才變成連結。 */
export function linkify(circuit: Circuit, text: string): Array<string | AiLink> {
  const hits: Hit[] = [];
  const scan = (re: RegExp, priority: number, resolve: (m: RegExpExecArray) => GridPoint | null) => {
    for (const m of text.matchAll(re)) {
      const p = resolve(m);
      if (p) hits.push({ start: m.index!, end: m.index! + m[0].length, priority, points: [p] });
    }
  };
  scan(PIN, 0, (m) => pinPointOf(circuit, m[1] ?? m[3], Number(m[2] ?? m[4])));
  scan(POST, 1, (m) => postPoint(circuit, m[1]));
  scan(HOLE, 2, (m) => holePoint(circuit, m[1], m[2]));

  const taken: Hit[] = [];
  for (const h of hits.sort((a, b) => a.priority - b.priority || a.start - b.start)) {
    if (taken.every((t) => h.end <= t.start || h.start >= t.end)) taken.push(h);
  }
  taken.sort((a, b) => a.start - b.start);
  const out: Array<string | AiLink> = [];
  let at = 0;
  for (const h of taken) {
    if (h.start > at) out.push(text.slice(at, h.start));
    out.push({ text: text.slice(h.start, h.end), points: h.points });
    at = h.end;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
