import type { Unit } from './synth';

/** 一個 2 輸入的 NAND 或 NOR。a = b 時就是反相器（兩種閘都一樣）。 */
interface Nand {
  a: string;
  b: string;
  out: string;
}

/**
 * 規格（2026-10-13 convert-extras）第 2 節：把拆好的單元全部換成 2 輸入 NAND，再化簡。
 * keep：一定要保留的訊號名稱（輸出端接的訊號）；化簡時這些名稱不會消失。
 */
export function toNandUnits(units: Unit[], keep: string[]): Unit[] {
  return toOneKind(units, keep, 'NAND2');
}

/** 子專案 27：和只用 NAND 一樣，全部換成 2 輸入 NOR（74LS02）。 */
export function toNorUnits(units: Unit[], keep: string[]): Unit[] {
  return toOneKind(units, keep, 'NOR2');
}

/**
 * 只用一種閘：NAND 或 NOR（兩種都是「萬用閘」，反相都是兩個輸入接在一起）。
 * NAND：AND = NOT(NAND)、OR = NAND(NOT a, NOT b)；NOR 是對偶：OR = NOT(NOR)、AND = NOR(NOT a, NOT b)。
 */
function toOneKind(units: Unit[], keep: string[], kind: 'NAND2' | 'NOR2'): Unit[] {
  const gates: Nand[] = [];
  let fresh = 0;
  const temp = (base: string) => `${base}#${++fresh}`;
  const gate = (a: string, b: string, out: string) => {
    gates.push({ a, b, out });
    return out;
  };
  const not = (x: string, out: string) => gate(x, x, out);
  const nandMode = kind === 'NAND2';
  // and2 / or2：照閘的種類選直接或間接的做法。
  const and2 = (a: string, b: string, out: string) => (nandMode ? not(gate(a, b, temp(out)), out) : gate(not(a, temp(out)), not(b, temp(out)), out));
  const or2 = (a: string, b: string, out: string) => (nandMode ? gate(not(a, temp(out)), not(b, temp(out)), out) : not(gate(a, b, temp(out)), out));

  for (const u of units) {
    const [a, b] = u.inputs;
    switch (u.kind) {
      case 'NOT':
        not(a, u.output);
        break;
      case 'NAND2':
        if (nandMode) gate(a, b, u.output);
        else not(and2(a, b, temp(u.output)), u.output);
        break;
      case 'AND2':
      case 'AND3':
      case 'AND4': {
        // 多輸入的 AND 先串成 2 輸入。
        let acc = u.inputs[0];
        for (let i = 1; i < u.inputs.length; i++) acc = and2(acc, u.inputs[i], i === u.inputs.length - 1 ? u.output : temp(u.output));
        break;
      }
      case 'OR2':
        or2(a, b, u.output);
        break;
      case 'NOR2':
        if (nandMode) not(or2(a, b, temp(u.output)), u.output);
        else gate(a, b, u.output);
        break;
      case 'XOR2': {
        if (nandMode) {
          const t = gate(a, b, temp(u.output));
          gate(gate(a, t, temp(u.output)), gate(b, t, temp(u.output)), u.output);
        } else {
          // XOR = NOR(NOR(a, b), AND(a, b))。
          gate(gate(a, b, temp(u.output)), and2(a, b, temp(u.output)), u.output);
        }
        break;
      }
    }
  }
  return simplify(gates, new Set(keep)).map((g) => ({ kind, inputs: [g.a, g.b], output: g.out }));
}

function simplify(input: Nand[], keep: Set<string>): Nand[] {
  let gates = input.map((g) => ({ ...g }));
  const rename = (from: string, to: string) => {
    for (const g of gates) {
      if (g.a === from) g.a = to;
      if (g.b === from) g.b = to;
      if (g.out === from) g.out = to;
    }
  };
  const producer = () => new Map(gates.map((g) => [g.out, g]));

  for (let changed = true; changed; ) {
    changed = false;

    // 反相兩次抵消：g = NOT(h)，h = NOT(x) → g 的輸出就是 x。
    const byOut = producer();
    for (const g of gates) {
      if (g.a !== g.b) continue;
      const h = byOut.get(g.a);
      if (!h || h.a !== h.b || h === g) continue;
      const x = h.a;
      if (!keep.has(g.out)) {
        gates = gates.filter((k) => k !== g);
        rename(g.out, x);
      } else if (byOut.has(x) && !keep.has(x)) {
        // 輸出要保留 g 的名稱：讓產生 x 的閘直接輸出這個名稱。
        gates = gates.filter((k) => k !== g);
        rename(x, g.out);
      } else continue;
      changed = true;
      break;
    }
    if (changed) continue;

    // 相同的閘只做一次（輸入不分順序）。
    const seen = new Map<string, Nand>();
    for (const g of gates) {
      const key = [g.a, g.b].sort().join('|');
      const first = seen.get(key);
      if (!first) {
        seen.set(key, g);
        continue;
      }
      if (!keep.has(g.out)) {
        gates = gates.filter((k) => k !== g);
        rename(g.out, first.out);
      } else if (!keep.has(first.out)) {
        gates = gates.filter((k) => k !== first);
        rename(first.out, g.out);
      } else continue;
      changed = true;
      break;
    }
    if (changed) continue;

    // 拿掉沒有用到的閘。
    const used = new Set(gates.flatMap((g) => [g.a, g.b]));
    const alive = gates.filter((g) => used.has(g.out) || keep.has(g.out));
    if (alive.length !== gates.length) {
      gates = alive;
      changed = true;
    }
  }
  return gates;
}
