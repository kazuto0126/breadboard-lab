import { blockPinGroups, type PinGroup } from './pins';
import { signalOf, type CustomBlock, type LogicDiagram, type LogicNode, type LogicWire } from './types';

/**
 * 子專案 65（規格 2026-11-14 custom-blocks 第 1 節）：方塊的腳：裡面的輸入端、輸出端，照圖上的位置由上到下（y，再 x）。
 */
export function blockPins(b: Pick<CustomBlock, 'nodes' | 'busPins'>): { inputs: BlockPin[]; outputs: BlockPin[] } {
  // 子專案 66：多位元腳（A0–A3 合成 A[3:0]）算一個腳。
  const g = blockPinGroups(b);
  const pin = (x: PinGroup): BlockPin => ({ name: x.label, key: x.key, width: x.nodes.length });
  return { inputs: g.inputs.map(pin), outputs: g.outputs.map(pin) };
}

/** 方塊的一個腳：name 是畫在方塊上的字（A 或 A[3:0]），key 是比對用的名稱，width 是位元數。 */
export interface BlockPin {
  name: string;
  key: string;
  width: number;
}

export interface Flat {
  /** 沒有自訂方塊的圖（方塊換成裡面的元件，id 前面加「方塊節點 id/」）。 */
  diagram: LogicDiagram;
  /** 自訂方塊輸出腳的訊號 → 展開後真正的訊號（沒接到東西的腳不在這裡）。 */
  alias: Map<string, string>;
}

/** 來源：節點的第 fromPin 個輸出腳的第 bit 位（一位元的腳 bit 是 0）。 */
type Source = { from: string; fromPin?: number; bit?: number };

/**
 * 規格（2026-11-14 custom-blocks）第 2 節：把每個自訂方塊換成它裡面的元件（巢狀時一層一層展開）。接到方塊輸入腳的線改接到裡面用到那個輸入端的腳，
 * 從方塊輸出腳出去的線改從裡面接到那個輸出端的訊號出去；沒接的腳就是沒接。找不到定義或用到自己的方塊當成空的。
 * 子專案 66（規格 2026-11-14 bus 第 3 節）：以位元為單位：匯流排線拆成一位元的連接，經過合起來、拆開與方塊的多位元腳，最後只剩一位元的線。
 */
export function flattenDiagram(d: LogicDiagram): Flat {
  if (!d.nodes.some((n) => n.kind === 'CUSTOM' || n.kind === 'MERGE' || n.kind === 'SPLIT')) return { diagram: d, alias: new Map() };
  const defs = new Map((d.blocks ?? []).map((b) => [b.id, b]));
  const nodes: LogicNode[] = [];
  const wires: LogicWire[] = [];
  /** 方塊節點 → 每個輸入腳、輸出腳的每一位在裡面的輸入端、輸出端（展開後的 id）。 */
  const custom = new Map<string, { ins: string[][]; outs: string[][] }>();
  /** 裡面的輸入端 → 它是哪個方塊節點的第幾個輸入腳的第幾位。 */
  const inputPass = new Map<string, { node: string; pin: number; bit: number }>();
  const outputPass = new Set<string>();
  /** 合起來、拆開（展開後不留下）。 */
  const buses = new Map<string, LogicNode>();

  const add = (list: LogicNode[], ws: LogicWire[], prefix: string, stack: string[]) => {
    for (const n of list) {
      const id = prefix + n.id;
      if (n.kind === 'MERGE' || n.kind === 'SPLIT') {
        buses.set(id, { ...n, id });
        continue;
      }
      if (n.kind !== 'CUSTOM') {
        nodes.push({ ...n, id });
        continue;
      }
      const def = n.block === undefined ? undefined : defs.get(n.block);
      if (!def || stack.includes(def.id)) {
        custom.set(id, { ins: [], outs: [] });
        continue;
      }
      const inner = `${id}/`;
      const pins = blockPinGroups(def);
      custom.set(id, { ins: pins.inputs.map((g) => g.nodes.map((p) => inner + p.id)), outs: pins.outputs.map((g) => g.nodes.map((p) => inner + p.id)) });
      pins.inputs.forEach((g, k) => g.nodes.forEach((p, bit) => inputPass.set(inner + p.id, { node: id, pin: k, bit })));
      for (const g of pins.outputs) for (const p of g.nodes) outputPass.add(inner + p.id);
      add(
        def.nodes.filter((m) => m.kind !== 'INPUT' && m.kind !== 'OUTPUT'),
        def.wires,
        inner,
        [...stack, def.id],
      );
    }
    for (const w of ws) wires.push({ ...w, id: prefix + w.id, from: prefix + w.from, to: { node: prefix + w.to.node, pin: w.to.pin } });
  };
  add(d.nodes, d.wires, '', []);

  /** 來源腳的位元數（方塊的多位元腳、合起來的輸出）。 */
  const widthOf = (from: string, fromPin = 0) => custom.get(from)?.outs[fromPin]?.length ?? (buses.get(from)?.kind === 'MERGE' ? (buses.get(from)!.width ?? 1) : 1);
  const key = (node: string, pin: number, bit: number) => `${node}#${pin}#${bit}`;
  const driver = new Map<string, Source>();
  for (const w of wires) for (let bit = 0; bit < widthOf(w.from, w.fromPin); bit++) driver.set(key(w.to.node, w.to.pin, bit), { from: w.from, fromPin: w.fromPin, bit });

  /** 一路找到真正的來源（經過方塊的腳、裡面的輸入端與輸出端、合起來、拆開）；沒接時是 null。 */
  const resolve = (start: Source): Source | null => {
    let src: Source | undefined = start;
    for (let guard = 0; src && guard < 10_000; guard++) {
      const bit: number = src.bit ?? 0;
      const c = custom.get(src.from);
      if (c) {
        const out: string | undefined = c.outs[src.fromPin ?? 0]?.[bit];
        src = out === undefined ? undefined : { from: out };
        continue;
      }
      const pass = inputPass.get(src.from);
      if (pass) {
        src = driver.get(key(pass.node, pass.pin, pass.bit));
        continue;
      }
      if (outputPass.has(src.from)) {
        src = driver.get(key(src.from, 0, 0));
        continue;
      }
      const bus = buses.get(src.from);
      if (bus) {
        // 合起來：匯流排第 k 位是第 k 個輸入；拆開：第 k 個輸出是匯流排的第 k 位。
        src = bus.kind === 'MERGE' ? driver.get(key(bus.id, bit, 0)) : driver.get(key(bus.id, 0, src.fromPin ?? 0));
        continue;
      }
      return { from: src.from, ...(src.fromPin ? { fromPin: src.fromPin } : {}) };
    }
    return null;
  };

  const real = new Set(nodes.map((n) => n.id));
  const flatWires: LogicWire[] = [];
  for (const w of wires) {
    if (!real.has(w.to.node)) continue;
    const s = resolve({ from: w.from, fromPin: w.fromPin, bit: 0 });
    if (!s) continue;
    const { fromPin: _drop, ...rest } = w;
    flatWires.push({ ...rest, from: s.from, ...(s.fromPin ? { fromPin: s.fromPin } : {}) });
  }
  // 方塊輸出腳、合起來的值（畫線的顏色、匯流排的值）：一位元寫訊號名稱，多位元每一位寫「訊號[k]」。
  const alias = new Map<string, string>();
  const note = (id: string, pin: number, width: number) => {
    for (let bit = 0; bit < width; bit++) {
      const s = resolve({ from: id, fromPin: pin, bit });
      if (s) alias.set(width === 1 ? signalOf(id, pin) : `${signalOf(id, pin)}[${bit}]`, signalOf(s.from, s.fromPin));
    }
  };
  for (const [id, c] of custom) c.outs.forEach((bits, k) => note(id, k, bits.length));
  for (const [id, b] of buses) {
    if (b.kind === 'MERGE') note(id, 0, b.width ?? 1);
    // 拆開的每一個輸出是一位元（畫線的顏色）。
    else for (let k = 0; k < (b.width ?? 1); k++) note(id, k, 1);
  }
  const { blocks: _blocks, ...rest } = d;
  return { diagram: { ...rest, nodes, wires: flatWires }, alias };
}

const cache = new WeakMap<LogicDiagram, Flat>();

/** 有快取的展開（同一張圖物件只展開一次）。 */
export function flat(d: LogicDiagram): Flat {
  let f = cache.get(d);
  if (!f) {
    f = flattenDiagram(d);
    cache.set(d, f);
  }
  return f;
}

/** 方塊會不會直接或間接用到自己（id 是要檢查的方塊）。 */
export function usesItself(blocks: CustomBlock[], id: string): boolean {
  const defs = new Map(blocks.map((b) => [b.id, b]));
  const seen = new Set<string>();
  const walk = (b: CustomBlock): boolean =>
    b.nodes.some((n) => {
      if (n.kind !== 'CUSTOM' || n.block === undefined) return false;
      if (n.block === id) return true;
      if (seen.has(n.block)) return false;
      seen.add(n.block);
      const inner = defs.get(n.block);
      return inner ? walk(inner) : false;
    });
  const self = defs.get(id);
  return self ? walk(self) : false;
}
