/**
 * 規格（2026-10-17 task-to-diagram）第 2 節：把一個輸出化簡成積項和（Quine–McCluskey ＋ 最少覆蓋）。
 * 位元 n − 1 − i 對應第 i 個輸入（第一個輸入是最高位元，和真值表的列號一樣）。
 */
export interface Term {
  /** 沒被消掉的變數的值（被消掉的位元是 0）。 */
  value: number;
  /** 被消掉的變數。 */
  mask: number;
}

/** 搜尋最少覆蓋時最多走幾步；超過就用目前找到最好的。 */
const SEARCH_LIMIT = 50_000;

const covers = (t: Term, row: number) => (row & ~t.mask) === t.value;
const bitCount = (x: number) => {
  let c = 0;
  for (let v = x; v; v &= v - 1) c++;
  return c;
};
const literalCount = (n: number, t: Term) => n - bitCount(t.mask);

/** 依輸入順序比較：反相 < 原變數 < 沒有這個變數（AB + AC + BC、A'B + AB'）。 */
function sortTerms(n: number, terms: Term[]): Term[] {
  const key = (t: Term) =>
    Array.from({ length: n }, (_, i) => {
      const bit = 1 << (n - 1 - i);
      return t.mask & bit ? 2 : t.value & bit ? 1 : 0;
    });
  return [...terms].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const i = ka.findIndex((v, k) => v !== kb[k]);
    return i < 0 ? 0 : ka[i] - kb[i];
  });
}

/** 所有質項（不在乎的列可以拿來合併）。 */
export function primeImplicants(n: number, ones: number[], dontCares: number[]): Term[] {
  let current = new Map<string, Term>();
  for (const m of [...ones, ...dontCares]) current.set(`0:${m}`, { value: m, mask: 0 });
  const primes = new Map<string, Term>();
  while (current.size > 0) {
    const next = new Map<string, Term>();
    const merged = new Set<string>();
    const list = [...current.entries()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [ka, a] = list[i];
        const [kb, b] = list[j];
        if (a.mask !== b.mask) continue;
        const diff = a.value ^ b.value;
        if (diff === 0 || (diff & (diff - 1)) !== 0) continue;
        const t = { value: a.value & ~diff, mask: a.mask | diff };
        next.set(`${t.mask}:${t.value}`, t);
        merged.add(ka);
        merged.add(kb);
      }
    }
    for (const [k, t] of list) if (!merged.has(k)) primes.set(k, t);
    current = next;
  }
  return sortTerms(n, [...primes.values()]);
}

/** 蓋住所有 1 的最少質項（項數最少，再來字母最少）：先拿必要質項，剩下的用分支限界。 */
export function minimalCover(n: number, ones: number[], primes: Term[]): Term[] {
  const relevant = primes.filter((p) => ones.some((m) => covers(p, m)));
  const chosen: Term[] = [];
  let uncovered = ones.filter((m, i) => ones.indexOf(m) === i);
  const take = (p: Term) => {
    chosen.push(p);
    uncovered = uncovered.filter((m) => !covers(p, m));
  };
  // 必要質項：某個 1 只有它蓋得到。
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of uncovered) {
      const options = relevant.filter((p) => covers(p, m));
      if (options.length === 1 && !chosen.includes(options[0])) {
        take(options[0]);
        changed = true;
        break;
      }
    }
  }

  const cost = (set: Term[]) => [set.length, set.reduce((s, t) => s + literalCount(n, t), 0)] as const;
  const better = (a: Term[], b: Term[]) => {
    const [ca, la] = cost(a);
    const [cb, lb] = cost(b);
    return ca < cb || (ca === cb && la < lb);
  };
  // 先用貪心法得到一個解，當作限界。
  const greedy: Term[] = [];
  for (let left = uncovered; left.length > 0; ) {
    const pick = relevant.reduce((best, p) => {
      const gain = left.filter((m) => covers(p, m)).length;
      const bestGain = left.filter((m) => covers(best, m)).length;
      return gain > bestGain || (gain === bestGain && literalCount(n, p) < literalCount(n, best)) ? p : best;
    });
    greedy.push(pick);
    left = left.filter((m) => !covers(pick, m));
  }
  let best = greedy;
  let steps = 0;
  const search = (left: number[], picked: Term[]) => {
    if (++steps > SEARCH_LIMIT) return;
    if (left.length === 0) {
      if (better(picked, best)) best = [...picked];
      return;
    }
    if (picked.length + 1 > best.length) return;
    // 從選擇最少的那個 1 開始分支。
    let target = left[0];
    let options = relevant.filter((p) => covers(p, target));
    for (const m of left) {
      const o = relevant.filter((p) => covers(p, m));
      if (o.length < options.length) {
        target = m;
        options = o;
      }
    }
    options.sort((a, b) => left.filter((m) => covers(b, m)).length - left.filter((m) => covers(a, m)).length || literalCount(n, a) - literalCount(n, b));
    for (const p of options) search(left.filter((m) => !covers(p, m)), [...picked, p]);
  };
  search(uncovered, []);
  return sortTerms(n, [...chosen, ...best]);
}

/** 化簡一個輸出；沒有 1 時是空的（輸出 0）。 */
export function minimize(n: number, ones: number[], dontCares: number[]): Term[] {
  if (ones.length === 0) return [];
  return minimalCover(n, ones, primeImplicants(n, ones, dontCares));
}

/** 積項的字母（依輸入順序）；沒有字母代表常數 1。 */
export function literalsOf(term: Term, names: string[]): Array<{ name: string; negated: boolean }> {
  const n = names.length;
  return names.flatMap((name, i) => {
    const bit = 1 << (n - 1 - i);
    return term.mask & bit ? [] : [{ name, negated: (term.value & bit) === 0 }];
  });
}

/** 文字寫法：「AB + A'C」；沒有項是 0，有一項沒有字母是 1。 */
export function sopText(terms: Term[], names: string[]): string {
  if (terms.length === 0) return '0';
  const parts = terms.map((t) => literalsOf(t, names));
  if (parts.some((p) => p.length === 0)) return '1';
  return parts.map((p) => p.map((l) => `${l.name}${l.negated ? "'" : ''}`).join('')).join(' + ');
}
