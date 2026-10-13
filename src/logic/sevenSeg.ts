import { BCD_GLYPHS } from '../core/simulation/models';

/** 規格（2026-10-13 seven-seg）第 3 節：顯示器的值 → 亮的段（74LS47 的字形）；X 只亮 g（「–」）。 */
export function glyphOf(value: number | 'X'): string {
  return value === 'X' ? 'g' : (BCD_GLYPHS[value] ?? '');
}

/** 亮的段（不管順序）對回 0–15；對不到任何字形時回傳 null。 */
export function valueOfSegments(lit: readonly string[]): number | null {
  const key = [...lit].sort().join('');
  const v = BCD_GLYPHS.findIndex((g) => [...g].sort().join('') === key);
  return v < 0 ? null : v;
}
