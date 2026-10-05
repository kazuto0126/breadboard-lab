/** E = 端點、H = 水平直穿、V = 垂直直穿、T = 轉彎。 */
export type Usage = 'E' | 'H' | 'V' | 'T';

export interface StoredWire {
  id: string;
  netId: string;
  path: number[];
}

export interface NodeUse {
  wireId: string;
  usage: Usage;
}

export function pathUsages(path: number[]): Usage[] {
  return path.map((node, k) => {
    if (k === 0 || k === path.length - 1) return 'E';
    const into = node - path[k - 1];
    const out = path[k + 1] - node;
    if (into !== out) return 'T';
    return Math.abs(into) === 1 ? 'H' : 'V';
  });
}

export function isCrossPair(a: Usage, b: Usage): boolean {
  return (a === 'H' && b === 'V') || (a === 'V' && b === 'H');
}

/** 協商佈線時每個格點被哪些線、以什麼方式使用，以及每個格點的歷史擁擠成本。 */
export class RouteState {
  readonly uses: NodeUse[][];
  readonly history: Float64Array;
  private readonly wires = new Map<string, StoredWire>();
  private readonly byNet = new Map<string, string[]>();

  constructor(size: number) {
    this.uses = Array.from({ length: size }, () => []);
    this.history = new Float64Array(size);
  }

  addWire(wire: StoredWire): void {
    if (this.wires.has(wire.id)) throw new Error(`Wire ${wire.id} is already placed`);
    this.wires.set(wire.id, wire);
    const list = this.byNet.get(wire.netId);
    if (list) list.push(wire.id);
    else this.byNet.set(wire.netId, [wire.id]);
    pathUsages(wire.path).forEach((usage, k) => this.uses[wire.path[k]].push({ wireId: wire.id, usage }));
  }

  removeWire(id: string): void {
    const wire = this.wires.get(id);
    if (!wire) return;
    for (const node of wire.path) this.uses[node] = this.uses[node].filter((u) => u.wireId !== id);
    this.wires.delete(id);
    const rest = (this.byNet.get(wire.netId) ?? []).filter((w) => w !== id);
    if (rest.length > 0) this.byNet.set(wire.netId, rest);
    else this.byNet.delete(wire.netId);
  }

  removeNet(netId: string): void {
    for (const id of [...(this.byNet.get(netId) ?? [])]) this.removeWire(id);
  }

  wiresOf(netId: string): StoredWire[] {
    return (this.byNet.get(netId) ?? []).map((id) => this.wires.get(id)!);
  }

  /** 使用方式不合法的格點：兩條以上的線共用，而且不是「恰好兩條、一橫一直」的交叉。 */
  conflictedNodes(): number[] {
    const out: number[] = [];
    this.uses.forEach((list, node) => {
      if (list.length < 2) return;
      if (list.length === 2 && isCrossPair(list[0].usage, list[1].usage)) return;
      out.push(node);
    });
    return out;
  }

  netsAt(nodes: number[]): Set<string> {
    const nets = new Set<string>();
    for (const node of nodes) for (const u of this.uses[node]) nets.add(this.wires.get(u.wireId)!.netId);
    return nets;
  }
}
