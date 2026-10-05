import type { Circuit, Net, PinRef, Wire } from '../../types/circuit';
import { groupInfo, groupOfPoint, indexCircuit, pinDefinition, pinPoint, type CircuitIndex } from './circuitIndex';
import { UnionFind } from './unionFind';

export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function comparePinRefs(a: PinRef, b: PinRef): number {
  return compareIds(a.componentId, b.componentId) || a.pinNumber - b.pinNumber;
}

export function pinKey(ref: PinRef): string {
  return `${ref.componentId}#${ref.pinNumber}`;
}

export function extractNets(circuit: Circuit): Net[] {
  return extractNetsWith(indexCircuit(circuit), circuit.wires);
}

/** 用指定的導線分析 Net。導線只有兩個端點導電。 */
export function extractNetsWith(index: CircuitIndex, wires: Wire[]): Net[] {
  const uf = new UnionFind();
  const seen = new Set<string>();
  const touch = (groupId: string | null): string | null => {
    if (groupId) seen.add(groupId);
    return groupId;
  };

  for (const w of wires) {
    const a = touch(groupOfPoint(index, w.start));
    const b = touch(groupOfPoint(index, w.end));
    if (a && b) uf.union(a, b);
  }

  const pinGroups: Array<{ ref: PinRef; groupId: string }> = [];
  for (const pc of index.placed) {
    for (const pin of pc.footprint.pins) {
      const groupId = touch(groupOfPoint(index, pin.point));
      if (groupId) pinGroups.push({ ref: { componentId: pc.instance.id, pinNumber: pin.pinNumber }, groupId });
    }
  }
  const groupOfPin = new Map(pinGroups.map((p) => [pinKey(p.ref), p.groupId]));
  for (const pc of index.placed) {
    for (const set of pc.def.internalConnections) {
      const groups = set
        .map((n) => groupOfPin.get(pinKey({ componentId: pc.instance.id, pinNumber: n })))
        .filter((g): g is string => g !== undefined);
      for (let i = 1; i < groups.length; i++) uf.union(groups[0], groups[i]);
    }
  }

  const buckets = new Map<string, { groupIds: string[]; pins: PinRef[] }>();
  const bucket = (root: string) => {
    let b = buckets.get(root);
    if (!b) {
      b = { groupIds: [], pins: [] };
      buckets.set(root, b);
    }
    return b;
  };
  for (const groupId of [...seen].sort(compareIds)) bucket(uf.find(groupId)).groupIds.push(groupId);
  for (const { ref, groupId } of pinGroups) bucket(uf.find(groupId)).pins.push(ref);

  const raw = [...buckets.values()].filter((b) => b.pins.length > 0);
  for (const b of raw) b.pins.sort(comparePinRefs);
  raw.sort((a, b) => comparePinRefs(a.pins[0], b.pins[0]));

  let power = 0;
  let ground = 0;
  let signal = 0;
  return raw.map((b) => {
    const roles = b.pins.map((ref) => pinDefinition(index, ref)?.role);
    const kind: Net['kind'] = roles.includes('vcc-source') ? 'power' : roles.includes('gnd-source') ? 'ground' : 'signal';
    let name: string;
    if (kind === 'power') name = ++power === 1 ? 'VCC' : `VCC_${power}`;
    else if (kind === 'ground') name = ++ground === 1 ? 'GND' : `GND_${ground}`;
    else name = `NET_${++signal}`;
    return { id: name, name, kind, groupIds: b.groupIds, pins: b.pins };
  });
}

/** 這個 Net 需要用導線連起來的群組：有元件腳的群組，加上屬於這個 Net 的電源軌。 */
export function terminalGroupIds(net: Net, index: CircuitIndex): string[] {
  const set = new Set<string>();
  for (const ref of net.pins) {
    const p = pinPoint(index, ref);
    const g = p ? groupOfPoint(index, p) : null;
    if (g) set.add(g);
  }
  for (const g of net.groupIds) if (groupInfo(index, g)?.kind === 'rail') set.add(g);
  return [...set].sort(compareIds);
}

/** 把終端群組依元件內部導通（例如 Push Button 跨凹槽的兩腳）分簇；同一簇內不需要導線。 */
export function terminalClusters(net: Net, index: CircuitIndex): string[][] {
  const groups = terminalGroupIds(net, index);
  const inNet = new Set(groups);
  const uf = new UnionFind();
  for (const pc of index.placed) {
    for (const set of pc.def.internalConnections) {
      const linked = set
        .map((n) => pinPoint(index, { componentId: pc.instance.id, pinNumber: n }))
        .map((p) => (p ? groupOfPoint(index, p) : null))
        .filter((g): g is string => g !== null && inNet.has(g));
      for (let i = 1; i < linked.length; i++) uf.union(linked[0], linked[i]);
    }
  }
  const clusters = new Map<string, string[]>();
  for (const g of groups) {
    const root = uf.find(g);
    const list = clusters.get(root);
    if (list) list.push(g);
    else clusters.set(root, [g]);
  }
  return [...clusters.values()].sort((a, b) => compareIds(a[0], b[0]));
}

export function netByPin(nets: Net[]): Map<string, Net> {
  const map = new Map<string, Net>();
  for (const net of nets) for (const ref of net.pins) map.set(pinKey(ref), net);
  return map;
}
