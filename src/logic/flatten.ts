import { signalOf, type CustomBlock, type LogicDiagram, type LogicNode, type LogicWire } from './types';

/**
 * 子專案 65（規格 2026-11-14 custom-blocks 第 1 節）：方塊的腳：裡面的輸入端、輸出端，照圖上的位置由上到下（y，再 x）。
 */
export function blockPins(b: Pick<CustomBlock, 'nodes'>): { inputs: LogicNode[]; outputs: LogicNode[] } {
  const byPlace = (a: LogicNode, c: LogicNode) => a.y - c.y || a.x - c.x;
  return {
    inputs: b.nodes.filter((n) => n.kind === 'INPUT').sort(byPlace),
    outputs: b.nodes.filter((n) => n.kind === 'OUTPUT').sort(byPlace),
  };
}

export interface Flat {
  /** 沒有自訂方塊的圖（方塊換成裡面的元件，id 前面加「方塊節點 id/」）。 */
  diagram: LogicDiagram;
  /** 自訂方塊輸出腳的訊號 → 展開後真正的訊號（沒接到東西的腳不在這裡）。 */
  alias: Map<string, string>;
}

type Source = { from: string; fromPin?: number };

/**
 * 規格第 2 節：把每個自訂方塊換成它裡面的元件（巢狀時一層一層展開）。接到方塊輸入腳的線改接到裡面用到那個輸入端的腳，
 * 從方塊輸出腳出去的線改從裡面接到那個輸出端的訊號出去；沒接的腳就是沒接。找不到定義或用到自己的方塊當成空的。
 */
export function flattenDiagram(d: LogicDiagram): Flat {
  if (!d.nodes.some((n) => n.kind === 'CUSTOM')) return { diagram: d, alias: new Map() };
  const defs = new Map((d.blocks ?? []).map((b) => [b.id, b]));
  const nodes: LogicNode[] = [];
  const wires: LogicWire[] = [];
  /** 方塊節點 → 每個輸入腳、輸出腳在裡面的輸入端、輸出端（展開後的 id）。 */
  const custom = new Map<string, { ins: string[]; outs: string[] }>();
  /** 裡面的輸入端 → 它是哪個方塊節點的第幾個輸入腳。 */
  const inputPass = new Map<string, { node: string; pin: number }>();
  const outputPass = new Set<string>();

  const add = (list: LogicNode[], ws: LogicWire[], prefix: string, stack: string[]) => {
    for (const n of list) {
      const id = prefix + n.id;
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
      const pins = blockPins(def);
      custom.set(id, { ins: pins.inputs.map((p) => inner + p.id), outs: pins.outputs.map((p) => inner + p.id) });
      pins.inputs.forEach((p, k) => inputPass.set(inner + p.id, { node: id, pin: k }));
      for (const p of pins.outputs) outputPass.add(inner + p.id);
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

  const driver = new Map(wires.map((w) => [`${w.to.node}#${w.to.pin}`, { from: w.from, fromPin: w.fromPin } as Source]));
  /** 一路找到真正的來源（經過方塊的腳、裡面的輸入端與輸出端）；沒接時是 null。 */
  const resolve = (start: Source): Source | null => {
    let src: Source | undefined = start;
    for (let guard = 0; src && guard < 10_000; guard++) {
      const c = custom.get(src.from);
      if (c) {
        const out: string | undefined = c.outs[src.fromPin ?? 0];
        src = out === undefined ? undefined : { from: out };
        continue;
      }
      const pass = inputPass.get(src.from);
      if (pass) {
        src = driver.get(`${pass.node}#${pass.pin}`);
        continue;
      }
      if (outputPass.has(src.from)) {
        src = driver.get(`${src.from}#0`);
        continue;
      }
      return src;
    }
    return null;
  };

  const real = new Set(nodes.map((n) => n.id));
  const flatWires: LogicWire[] = [];
  for (const w of wires) {
    if (!real.has(w.to.node)) continue;
    const s = resolve(w);
    if (!s) continue;
    const { fromPin: _drop, ...rest } = w;
    flatWires.push({ ...rest, from: s.from, ...(s.fromPin ? { fromPin: s.fromPin } : {}) });
  }
  const alias = new Map<string, string>();
  for (const [id, c] of custom)
    c.outs.forEach((_, k) => {
      const s = resolve({ from: id, fromPin: k });
      if (s) alias.set(signalOf(id, k), signalOf(s.from, s.fromPin));
    });
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
