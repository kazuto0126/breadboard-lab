import type { StateTask } from './stateTask';

/**
 * 子專案 63（規格 2026-11-14 state-diagram）：從狀態表題目畫狀態圖（只顯示）。
 * 每個狀態一個圓圈，每一列一個箭頭（現在狀態 → 下一個狀態）；同一對狀態之間的箭頭合成一條，標籤用逗號隔開。
 */
export interface StateEdge {
  from: number;
  to: number;
  /** 例如「1/0」（輸入 / 輸出）；Moore 形式時只有輸入。 */
  labels: string[];
}

export interface StateDiagram {
  /** 每個狀態的輸出都和輸入無關時是 Moore 形式：輸出寫在圓圈裡（S0/1），箭頭只寫輸入。 */
  moore: boolean;
  /** 圓圈裡的字（S0 或 S0/1）。 */
  names: string[];
  edges: StateEdge[];
  /** 下一個狀態是 X（不在乎）的列：沒有畫箭頭。 */
  dontCare: Array<{ from: number; label: string }>;
}

const bitsOf = (i: number, m: number) => Array.from({ length: m }, (_, b) => (i >> (m - 1 - b)) & 1).join('');

export function stateDiagram(task: StateTask): StateDiagram {
  const m = task.inputs.length;
  const per = 1 << m;
  const outText = (out: StateTask['rows'][number]['out']) => out.map(String).join('');
  const rowsOf = (s: number) => task.rows.slice(s * per, (s + 1) * per);
  const moore = task.outputs.length > 0 && Array.from({ length: task.states }, (_, s) => rowsOf(s)).every((rows) => rows.every((r) => outText(r.out) === outText(rows[0].out)));
  const names = Array.from({ length: task.states }, (_, s) => (moore ? `S${s}/${outText(rowsOf(s)[0].out)}` : `S${s}`));
  const edges: StateEdge[] = [];
  const dontCare: StateDiagram['dontCare'] = [];
  task.rows.forEach((row, i) => {
    const from = i >> m;
    const input = bitsOf(i & (per - 1), m);
    const label = moore || task.outputs.length === 0 ? input : `${input}/${outText(row.out)}`;
    if (row.next === 'X') {
      dontCare.push({ from, label });
      return;
    }
    const edge = edges.find((e) => e.from === from && e.to === row.next);
    if (edge) edge.labels.push(label);
    else edges.push({ from, to: row.next, labels: [label] });
  });
  // 沒有輸入時每個狀態只有一個箭頭，標籤是空的（Moore）或「/輸出」。
  for (const e of edges) e.labels = e.labels.filter((l) => l !== '');
  return { moore, names, edges, dontCare };
}

/** 標籤怎麼讀（例如「X/Z」「X Y」），放在圖的說明。 */
export function labelLegend(task: StateTask, moore: boolean): string {
  const ins = task.inputs.join('');
  const outs = task.outputs.join('');
  if (task.outputs.length === 0) return ins ? `箭頭上寫輸入 ${ins}` : '每次脈衝走一個箭頭';
  if (moore) return `圓圈裡寫 狀態/${outs}（Moore：輸出只看狀態）${ins ? `，箭頭上寫輸入 ${ins}` : ''}`;
  return `箭頭上寫 ${ins}/${outs}（Mealy：輸入/輸出）`;
}

/** MCP 用的文字版：每個箭頭一行。 */
export function stateDiagramText(task: StateTask): string[] {
  const d = stateDiagram(task);
  const lines = [`狀態圖（${labelLegend(task, d.moore)}）：`];
  for (const e of d.edges) lines.push(`- ${d.names[e.from]} → ${d.names[e.to]}${e.labels.length > 0 ? `：${e.labels.join('、')}` : ''}`);
  for (const x of d.dontCare) lines.push(`- ${d.names[x.from]}${x.label ? `（${x.label}）` : ''} → 任意（不在乎，沒有畫箭頭）`);
  return lines;
}

/** 圓圈的位置：排在一個圓上，S0 在最上面，順時針。2 個狀態時左右各一個。 */
export function stateLayout(states: number, size: number): Array<{ x: number; y: number }> {
  const c = size / 2;
  const r = size / 2 - 40;
  return Array.from({ length: states }, (_, s) => {
    const a = states === 2 ? Math.PI + s * Math.PI : -Math.PI / 2 + (2 * Math.PI * s) / states;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  });
}
