import type { RoutingProblem } from './problem';

/** 一條直線導線（格子索引）：a、b 是兩端，o = 0 水平、1 垂直；cells 是兩端之間經過的格子。 */
export interface PlacedWire {
  id: string;
  netId: string;
  a: number;
  b: number;
  o: 0 | 1;
  cells: number[];
}

/** end：一個孔插了兩個以上的線端；pass：線經過有線端的孔；line：同一格同方向有兩條線（共線重疊）；via：兩個 Net 用同一排轉接。 */
export type Conflict =
  | { kind: 'end'; cell: number }
  | { kind: 'pass'; cell: number }
  | { kind: 'line'; cell: number; o: 0 | 1 }
  | { kind: 'via'; group: string };

/** 協商佈線時已放的直線導線、每個資源的使用者，以及歷史擁擠成本。 */
export class StraightState {
  readonly ends: string[][];
  readonly lines: string[][];
  readonly histEnd: Float64Array;
  readonly histLine: Float64Array;
  readonly histVia = new Map<string, number>();
  private readonly viaUse = new Map<string, Map<string, number>>();
  private readonly wires = new Map<string, PlacedWire>();
  private readonly byNet = new Map<string, string[]>();
  private readonly terminals: Map<string, Set<string>>;

  constructor(private readonly problem: RoutingProblem) {
    this.ends = Array.from({ length: problem.size }, () => []);
    this.lines = Array.from({ length: problem.size * 2 }, () => []);
    this.histEnd = new Float64Array(problem.size);
    this.histLine = new Float64Array(problem.size * 2);
    this.terminals = new Map(problem.nets.map((n) => [n.netId, new Set(n.terminalGroups)]));
  }

  /** 這一排是不是這個 Net 的終端排，或它的線已經插在這一排（轉接排）。 */
  owns(netId: string, group: string): boolean {
    return this.terminals.get(netId)?.has(group) === true || (this.viaUse.get(group)?.get(netId) ?? 0) > 0;
  }

  /** 把這一排當轉接排的其他 Net 數。 */
  viaOthers(netId: string, group: string): number {
    let n = 0;
    for (const [id, count] of this.viaUse.get(group) ?? []) if (id !== netId && count > 0) n++;
    return n;
  }

  private bumpVia(netId: string, cell: number, delta: number): void {
    const g = this.problem.groupAt[cell];
    if (!g || this.terminals.get(netId)?.has(g)) return;
    const m = this.viaUse.get(g) ?? new Map<string, number>();
    const next = (m.get(netId) ?? 0) + delta;
    if (next > 0) m.set(netId, next);
    else m.delete(netId);
    if (m.size > 0) this.viaUse.set(g, m);
    else this.viaUse.delete(g);
  }

  addWire(w: PlacedWire): void {
    if (this.wires.has(w.id)) throw new Error(`Wire ${w.id} is already placed`);
    this.wires.set(w.id, w);
    const list = this.byNet.get(w.netId);
    if (list) list.push(w.id);
    else this.byNet.set(w.netId, [w.id]);
    for (const end of [w.a, w.b]) {
      this.ends[end].push(w.id);
      this.bumpVia(w.netId, end, 1);
    }
    for (const c of w.cells) this.lines[c * 2 + w.o].push(w.id);
  }

  removeWire(id: string): void {
    const w = this.wires.get(id);
    if (!w) return;
    for (const end of [w.a, w.b]) {
      this.ends[end] = this.ends[end].filter((x) => x !== id);
      this.bumpVia(w.netId, end, -1);
    }
    for (const c of w.cells) this.lines[c * 2 + w.o] = this.lines[c * 2 + w.o].filter((x) => x !== id);
    this.wires.delete(id);
    const rest = (this.byNet.get(w.netId) ?? []).filter((x) => x !== id);
    if (rest.length > 0) this.byNet.set(w.netId, rest);
    else this.byNet.delete(w.netId);
  }

  removeNet(netId: string): void {
    for (const id of [...(this.byNet.get(netId) ?? [])]) this.removeWire(id);
  }

  wiresOf(netId: string): PlacedWire[] {
    return (this.byNet.get(netId) ?? []).map((id) => this.wires.get(id)!);
  }

  conflicts(): Conflict[] {
    const out: Conflict[] = [];
    for (let c = 0; c < this.ends.length; c++) {
      if (this.ends[c].length > 1) out.push({ kind: 'end', cell: c });
      if (this.ends[c].length > 0 && this.lines[c * 2].length + this.lines[c * 2 + 1].length > 0) out.push({ kind: 'pass', cell: c });
      for (const o of [0, 1] as const) if (this.lines[c * 2 + o].length > 1) out.push({ kind: 'line', cell: c, o });
    }
    for (const [group, m] of [...this.viaUse].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))) {
      if (m.size > 1) out.push({ kind: 'via', group });
    }
    return out;
  }

  netsIn(conflicts: Conflict[]): Set<string> {
    const nets = new Set<string>();
    const add = (ids: string[]) => ids.forEach((id) => nets.add(this.wires.get(id)!.netId));
    for (const x of conflicts) {
      if (x.kind === 'end') add(this.ends[x.cell]);
      else if (x.kind === 'pass') add([...this.ends[x.cell], ...this.lines[x.cell * 2], ...this.lines[x.cell * 2 + 1]]);
      else if (x.kind === 'line') add(this.lines[x.cell * 2 + x.o]);
      else for (const id of this.viaUse.get(x.group)?.keys() ?? []) nets.add(id);
    }
    return nets;
  }

  bumpHistory(conflicts: Conflict[], increment: number): void {
    for (const x of conflicts) {
      if (x.kind === 'end' || x.kind === 'pass') this.histEnd[x.cell] += increment;
      else if (x.kind === 'line') this.histLine[x.cell * 2 + x.o] += increment;
      else this.histVia.set(x.group, (this.histVia.get(x.group) ?? 0) + increment);
    }
  }
}
