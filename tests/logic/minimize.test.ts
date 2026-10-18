import { describe, expect, it } from 'vitest';
import { literalsOf, minimalCover, minimize, primeImplicants, sopText, type Term } from '../../src/logic/minimize';

/** 固定種子的亂數（mulberry32），測試每次都一樣。 */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const covers = (t: Term, row: number) => (row & ~t.mask) === (t.value & ~t.mask);

describe('simplifying one output to a sum of products', () => {
  it('finds AB + AC + BC for the majority function', () => {
    const terms = minimize(3, [3, 5, 6, 7], []);
    expect(sopText(terms, ['A', 'B', 'C'])).toBe('AB + AC + BC');
    expect(literalsOf(terms[0], ['A', 'B', 'C'])).toEqual([
      { name: 'A', negated: false },
      { name: 'B', negated: false },
    ]);
  });

  it("cannot merge anything in XOR, and writes complements with '", () => {
    expect(sopText(minimize(2, [1, 2], []), ['A', 'B'])).toBe("A'B + AB'");
  });

  it('uses cells marked X to make terms smaller, but does not have to cover them', () => {
    expect(sopText(minimize(3, [1, 3], []), ['A', 'B', 'C'])).toBe("A'C");
    expect(sopText(minimize(3, [1, 3], [5, 7]), ['A', 'B', 'C'])).toBe('C');
    // 只有 X、沒有 1：輸出是 0。
    expect(sopText(minimize(2, [], [1, 2]), ['A', 'B'])).toBe('0');
  });

  it('writes constants as 0 and 1', () => {
    expect(minimize(2, [], [])).toEqual([]);
    expect(sopText(minimize(2, [0, 1, 2, 3], []), ['A', 'B'])).toBe('1');
    expect(sopText(minimize(2, [0, 3], [1, 2]), ['A', 'B'])).toBe('1');
    expect(sopText(minimize(1, [0], []), ['A'])).toBe("A'");
  });

  it('picks the cheapest cover when there is a choice (cyclic core)', () => {
    // 經典的循環覆蓋：Σm(0,1,2,5,6,7)，有 6 個質項，最少要 3 項。
    const primes = primeImplicants(3, [0, 1, 2, 5, 6, 7], []);
    expect(primes).toHaveLength(6);
    expect(minimalCover(3, [0, 1, 2, 5, 6, 7], primes)).toHaveLength(3);
  });

  it('is correct and minimal on random tasks with 1–6 inputs', () => {
    const rand = random(24);
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + Math.floor(rand() * 6);
      const ones: number[] = [];
      const dcs: number[] = [];
      for (let r = 0; r < 1 << n; r++) {
        const p = rand();
        if (p < 0.4) ones.push(r);
        else if (p < 0.55) dcs.push(r);
      }
      const terms = minimize(n, ones, dcs);
      for (let r = 0; r < 1 << n; r++) {
        const on = terms.some((t) => covers(t, r));
        if (ones.includes(r)) expect(on, `n=${n} 第 ${r} 列應該是 1`).toBe(true);
        else if (!dcs.includes(r)) expect(on, `n=${n} 第 ${r} 列應該是 0`).toBe(false);
      }
      expect(terms.length).toBeLessThanOrEqual(ones.length);
      // 3 個輸入以內：和窮舉所有質項組合的最少項數一樣。
      if (n <= 3) {
        const primes = primeImplicants(n, ones, dcs);
        let best = Infinity;
        for (let set = 0; set < 1 << primes.length; set++) {
          const chosen = primes.filter((_, i) => (set >> i) & 1);
          if (ones.every((r) => chosen.some((t) => covers(t, r)))) best = Math.min(best, chosen.length);
        }
        expect(terms.length, `n=${n} ones=${ones} dcs=${dcs}`).toBe(ones.length === 0 ? 0 : best);
      }
    }
  });

  it('handles the worst case for 6 inputs (parity) quickly', () => {
    const ones = Array.from({ length: 64 }, (_, r) => r).filter((r) => r.toString(2).split('1').length % 2 === 0);
    const start = Date.now();
    const terms = minimize(6, ones, []);
    expect(terms).toHaveLength(32);
    expect(terms.every((t) => t.mask === 0)).toBe(true);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe('product of sums (sub-project 31)', () => {
  it('simplifies the 0 rows and writes sums in brackets', async () => {
    const { minimizePos, posText } = await import('../../src/logic/minimize');
    // 多數決：0 的列是 0、1、2、4 → (A + B)(A + C)(B + C)。
    expect(posText(minimizePos(3, [0, 1, 2, 4], []), ['A', 'B', 'C'])).toBe('(A + B)(A + C)(B + C)');
    // XOR：(A + B)(A' + B')。
    expect(posText(minimizePos(2, [0, 3], []), ['A', 'B'])).toBe("(A + B)(A' + B')");
    // 只有一個字母的和寫成那個字母；沒有 0 是 1；全部是 0 是 0。
    expect(posText(minimizePos(2, [0, 1], []), ['A', 'B'])).toBe('A');
    expect(posText(minimizePos(2, [], []), ['A', 'B'])).toBe('1');
    expect(posText(minimizePos(2, [0, 1, 2, 3], []), ['A', 'B'])).toBe('0');
  });

  it('prefers terms another output already uses when two covers cost the same', async () => {
    const { minimize, sopText } = await import('../../src/logic/minimize');
    // Σm(0,1,2,5,6,7) 有兩組最少的 3 項；另一個輸出已經用了 AB 時，選含 AB 的那組。
    const shared = minimize(3, [0, 1, 2, 5, 6, 7], [], new Set(['1:6']));
    expect(sopText(shared, ['A', 'B', 'C'])).toContain('AB');
    expect(shared).toHaveLength(3);
  });
});
