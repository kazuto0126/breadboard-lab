import { indexCircuit, groupOfPoint, propsOf } from '../circuit/circuitIndex';
import { pinKey } from '../circuit/nets';
import { UnionFind } from '../circuit/unionFind';
import type { Circuit } from '../../types/circuit';
import type { Level, Logic } from '../../types/logic';
import { createModel, OSC_PIN, type LogicModel, type ModelState } from './models';

/** 超過這個輪數還沒有穩定，就判定電路在震盪。 */
export const MAX_ITERATIONS = 100;

interface SimIC {
  componentId: string;
  defId: string;
  model: LogicModel;
  /** 腳位名稱 → 靜態節點（腳沒有插在孔上時沒有）。 */
  pinNodes: Map<string, string>;
  vccNodes: string[];
  gndNodes: string[];
}

/** 編譯好的模擬電路：節點是「被導線與元件內部導通合併後的導通群組」。 */
export interface SimCircuit {
  circuit: Circuit;
  /** 導通群組 ID → 靜態節點。 */
  nodeOfGroup: Map<string, string>;
  /** `${componentId}#${pinNumber}` → 靜態節點。 */
  nodeOfPin: Map<string, string>;
  /** 指撥開關的每一個開關（index 從 0 起算）。 */
  switches: Array<{ componentId: string; index: number; a: string; b: string; closed: boolean }>;
  /** 按鈕：按下時接通 a、b。 */
  buttons: Array<{ componentId: string; a: string; b: string }>;
  resistors: Array<{ componentId: string; a: string; b: string }>;
  sources: Array<{ componentId: string; node: string; level: 0 | 1 }>;
  clocks: Array<{ componentId: string; node: string; frequency: number }>;
  ics: SimIC[];
  leds: Array<{ componentId: string; anode: string | null; cathode: string | null }>;
}

/** 模擬的外部輸入：按鈕是否按下、每個時脈目前的電位。 */
export interface SimInputs {
  pressed: Record<string, boolean>;
  clocks: Record<string, 0 | 1>;
}

/** 模擬狀態（純資料）：每顆 IC 的內部狀態與目前驅動的輸出。 */
export interface SimState {
  models: Record<string, { defId: string; state: ModelState }>;
  outputs: Record<string, Record<string, Level>>;
}

export interface SimResult {
  stable: boolean;
  iterations: number;
  /** 導通群組 ID → 電位。 */
  groupLevels: Record<string, Level>;
  /** `${componentId}#${pinNumber}` → 電位。 */
  pinLevels: Record<string, Level>;
  litLeds: string[];
  /** 沒有供電（VCC 腳不是強驅動 1 或 GND 腳不是強驅動 0）的 IC。 */
  unpowered: string[];
  /** 電位衝突（X）的導通群組。 */
  conflicts: string[];
}

const cache = new WeakMap<Circuit, SimCircuit>();

/** 依電路參照快取；電路一改（包括切換指撥開關）就重新編譯，成本很低。 */
export function compileSimulation(circuit: Circuit): SimCircuit {
  const cached = cache.get(circuit);
  if (cached) return cached;

  const index = indexCircuit(circuit);
  const uf = new UnionFind();
  const groups = new Set<string>();
  const touch = (g: string | null): string | null => {
    if (g) {
      groups.add(g);
      uf.find(g);
    }
    return g;
  };

  for (const w of circuit.wires) {
    const a = touch(groupOfPoint(index, w.start));
    const b = touch(groupOfPoint(index, w.end));
    if (a && b) uf.union(a, b);
  }
  const groupOfPin = new Map<string, string>();
  for (const pc of index.placed) {
    for (const pin of pc.footprint.pins) {
      const g = touch(groupOfPoint(index, pin.point));
      if (g) groupOfPin.set(pinKey({ componentId: pc.instance.id, pinNumber: pin.pinNumber }), g);
    }
    for (const set of pc.def.internalConnections) {
      const linked = set.map((n) => groupOfPin.get(pinKey({ componentId: pc.instance.id, pinNumber: n }))).filter((g): g is string => !!g);
      for (let i = 1; i < linked.length; i++) uf.union(linked[0], linked[i]);
    }
  }

  const nodeOfGroup = new Map([...groups].sort().map((g) => [g, uf.find(g)]));
  const nodeOfPin = new Map([...groupOfPin].map(([key, g]) => [key, uf.find(g)]));
  const nodeOf = (componentId: string, pinNumber: number) => nodeOfPin.get(pinKey({ componentId, pinNumber })) ?? null;

  const sim: SimCircuit = {
    circuit,
    nodeOfGroup,
    nodeOfPin,
    switches: [],
    buttons: [],
    resistors: [],
    sources: [],
    clocks: [],
    ics: [],
    leds: [],
  };

  for (const pc of index.placed) {
    const id = pc.instance.id;
    const def = pc.def;
    const props = propsOf(pc);
    for (const pin of def.pins) {
      const node = nodeOf(id, pin.number);
      if (!node) continue;
      if (pin.role === 'vcc-source') sim.sources.push({ componentId: id, node, level: (props.voltage ?? 5) > 0 ? 1 : 0 });
      if (pin.role === 'gnd-source') sim.sources.push({ componentId: id, node, level: 0 });
    }
    switch (def.category) {
      case 'clock': {
        const node = nodeOf(id, 1);
        if (node) sim.clocks.push({ componentId: id, node, frequency: props.frequency ?? 1 });
        break;
      }
      case 'dip-switch': {
        const n = def.pins.length;
        const states = props.switchStates ?? [];
        for (let k = 1; k <= n / 2; k++) {
          const a = nodeOf(id, k);
          const b = nodeOf(id, n + 1 - k);
          if (a && b) sim.switches.push({ componentId: id, index: k - 1, a, b, closed: states[k - 1] === true });
        }
        break;
      }
      case 'pushbutton': {
        const a = nodeOf(id, 1);
        const b = nodeOf(id, 3);
        if (a && b) sim.buttons.push({ componentId: id, a, b });
        break;
      }
      case 'resistor': {
        const a = nodeOf(id, 1);
        const b = nodeOf(id, 2);
        if (a && b) sim.resistors.push({ componentId: id, a, b });
        break;
      }
      case 'led': {
        const anode = def.pins.find((p) => p.role === 'anode');
        const cathode = def.pins.find((p) => p.role === 'cathode');
        sim.leds.push({
          componentId: id,
          anode: anode ? nodeOf(id, anode.number) : null,
          cathode: cathode ? nodeOf(id, cathode.number) : null,
        });
        break;
      }
      case 'ic': {
        if (!def.logic) break;
        const counts = new Map<string, number>();
        for (const p of def.pins) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
        const pinNodes = new Map<string, string>();
        for (const p of def.pins) {
          const node = nodeOf(id, p.number);
          if (node && counts.get(p.name) === 1) pinNodes.set(p.name, node);
        }
        const nodesWithRole = (role: string) =>
          def.pins.filter((p) => p.role === role).map((p) => nodeOf(id, p.number) ?? `missing:${id}#${p.number}`);
        // NE555：替它建一個虛擬振盪節點，和時脈元件一樣由模擬時間驅動（單步也會停在它的邊緣）。
        if (def.logic.model === 'timer555') {
          const osc = `osc:${id}`;
          pinNodes.set(OSC_PIN, osc);
          sim.clocks.push({ componentId: id, node: osc, frequency: props.frequency ?? 1 });
        }
        sim.ics.push({
          componentId: id,
          defId: def.id,
          model: createModel(def.logic),
          pinNodes,
          vccNodes: nodesWithRole('power'),
          gndNodes: nodesWithRole('ground'),
        });
        break;
      }
      default:
        break;
    }
  }

  cache.set(circuit, sim);
  return sim;
}

/** 上電時的輸出：所有輸出腳都是未知（X），直到第一次求值。 */
function powerUpOutputs(ic: SimIC): Record<string, Level> {
  return Object.fromEntries(ic.model.outputs.map((pin) => [pin, 'X' as Level]));
}

/**
 * 沿用前一份狀態中仍然存在、而且是同一種 IC 的內部狀態（例如只切換了開關、或只改了導線）；
 * 新放的 IC 從上電狀態開始。沒有前一份狀態時就是全新的上電狀態。
 */
export function adoptSimState(sim: SimCircuit, previous?: SimState): SimState {
  const models: SimState['models'] = {};
  const outputs: SimState['outputs'] = {};
  for (const ic of sim.ics) {
    const old = previous?.models[ic.componentId];
    if (old && old.defId === ic.defId) {
      models[ic.componentId] = old;
      outputs[ic.componentId] = previous?.outputs[ic.componentId] ?? powerUpOutputs(ic);
    } else {
      models[ic.componentId] = { defId: ic.defId, state: ic.model.init() };
      outputs[ic.componentId] = powerUpOutputs(ic);
    }
  }
  return { models, outputs };
}

export function initialSimState(sim: SimCircuit): SimState {
  return adoptSimState(sim);
}

function combine(current: Level | undefined, value: Level): Level {
  return current === undefined || current === value ? value : 'X';
}

interface Resolved {
  levels: Map<string, Level>;
  strong: Set<string>;
}

/** 解析每個（動態）節點的電位：強驅動合併 → 沿電阻一層一層取弱驅動 → 其餘為 Z。 */
function resolve(sim: SimCircuit, node: (n: string) => string, outputs: SimState['outputs'], inputs: SimInputs): Resolved {
  const strongLevels = new Map<string, Level>();
  const drive = (n: string, v: Level) => {
    if (v === 'Z') return;
    const d = node(n);
    strongLevels.set(d, combine(strongLevels.get(d), v));
  };
  for (const s of sim.sources) drive(s.node, s.level);
  for (const c of sim.clocks) drive(c.node, inputs.clocks[c.componentId] ?? 0);
  for (const ic of sim.ics) {
    const out = outputs[ic.componentId] ?? {};
    for (const pin of Object.keys(out).sort()) {
      const n = ic.pinNodes.get(pin);
      if (n) drive(n, out[pin]);
    }
  }

  const levels = new Map(strongLevels);
  for (let layer = 0; layer < sim.resistors.length + 1; layer++) {
    const next = new Map<string, Level>();
    for (const r of sim.resistors) {
      const a = node(r.a);
      const b = node(r.b);
      if (a === b) continue;
      const va = levels.get(a);
      const vb = levels.get(b);
      if (va !== undefined && vb === undefined) next.set(b, combine(next.get(b), va));
      if (vb !== undefined && va === undefined) next.set(a, combine(next.get(a), vb));
    }
    if (next.size === 0) break;
    for (const [n, v] of next) levels.set(n, v);
  }
  return { levels, strong: new Set(strongLevels.keys()) };
}

function powered(ic: SimIC, node: (n: string) => string, r: Resolved): boolean {
  const is = (nodes: string[], level: 0 | 1) =>
    nodes.length > 0 && nodes.every((n) => r.strong.has(node(n)) && r.levels.get(node(n)) === level);
  return is(ic.vccNodes, 1) && is(ic.gndNodes, 0);
}

function sameOutputs(a: SimState['outputs'], b: SimState['outputs']): boolean {
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[id] ?? {};
    const y = b[id] ?? {};
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) if ((x[k] ?? 'Z') !== (y[k] ?? 'Z')) return false;
  }
  return true;
}

/**
 * 依目前的輸入把電路算到穩定：所有 IC 每一輪讀同一份節點電位（結果與 IC 順序無關），
 * 循序 IC 比較上一次的輸入找出時脈邊緣；輸出不再改變就是穩定。
 */
export function settle(sim: SimCircuit, state: SimState, inputs: SimInputs): { state: SimState; result: SimResult } {
  const dyn = new UnionFind();
  for (const s of sim.switches) if (s.closed) dyn.union(s.a, s.b);
  for (const b of sim.buttons) if (inputs.pressed[b.componentId]) dyn.union(b.a, b.b);
  const node = (n: string) => dyn.find(n);

  let models = { ...state.models };
  let outputs = state.outputs;
  for (const ic of sim.ics) {
    if (!models[ic.componentId]) models[ic.componentId] = { defId: ic.defId, state: ic.model.init() };
  }

  let resolved = resolve(sim, node, outputs, inputs);
  let unpowered: string[] = [];
  let stable = false;
  let iterations = 0;
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const nextOutputs: SimState['outputs'] = {};
    const nextModels: SimState['models'] = {};
    unpowered = [];
    for (const ic of sim.ics) {
      const current = models[ic.componentId];
      if (!powered(ic, node, resolved)) {
        unpowered.push(ic.componentId);
        nextOutputs[ic.componentId] = {};
        nextModels[ic.componentId] = current;
        continue;
      }
      const read = (pin: string): Logic => {
        const n = ic.pinNodes.get(pin);
        const v = n ? resolved.levels.get(node(n)) : undefined;
        return v === undefined || v === 'Z' ? 1 : v; // TTL 輸入浮接讀成 HIGH
      };
      const r = ic.model.evaluate(read, current.state);
      nextOutputs[ic.componentId] = r.outputs;
      nextModels[ic.componentId] = { defId: ic.defId, state: r.state };
    }
    models = nextModels;
    const settled = sameOutputs(outputs, nextOutputs);
    outputs = nextOutputs;
    if (settled) {
      stable = true;
      break;
    }
    resolved = resolve(sim, node, outputs, inputs);
  }

  const levelOf = (n: string | null): Level => (n ? (resolved.levels.get(node(n)) ?? 'Z') : 'Z');
  const groupLevels: Record<string, Level> = {};
  const conflicts: string[] = [];
  for (const [g, n] of sim.nodeOfGroup) {
    const v = levelOf(n);
    groupLevels[g] = v;
    if (v === 'X') conflicts.push(g);
  }
  const pinLevels: Record<string, Level> = {};
  for (const [key, n] of sim.nodeOfPin) pinLevels[key] = levelOf(n);
  const litLeds = sim.leds.filter((l) => levelOf(l.anode) === 1 && levelOf(l.cathode) === 0).map((l) => l.componentId);

  return {
    state: { models, outputs },
    result: { stable, iterations, groupLevels, pinLevels, litLeds, unpowered, conflicts },
  };
}

/** 時脈在 timeMs 時的電位：從 LOW 開始，每半個週期翻轉一次。 */
export function clockLevel(frequency: number, timeMs: number): 0 | 1 {
  const half = 500 / frequency;
  return (Math.floor(timeMs / half + 1e-9) % 2) as 0 | 1;
}

/** 下一個任一時脈翻轉的時間（給「單步」用）。沒有時脈時回傳 null。 */
export function nextClockEdge(frequencies: number[], timeMs: number): number | null {
  let best: number | null = null;
  for (const f of frequencies) {
    const half = 500 / f;
    const next = (Math.floor(timeMs / half + 1e-9) + 1) * half;
    if (best === null || next < best) best = next;
  }
  return best;
}
