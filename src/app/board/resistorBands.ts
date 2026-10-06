/** 色碼：黑 0、棕 1、紅 2、橙 3、黃 4、綠 5、藍 6、紫 7、灰 8、白 9。 */
export const BAND_COLORS = ['#000000', '#8b4513', '#d32f2f', '#f57c00', '#fbc02d', '#388e3c', '#1976d2', '#7b1fa2', '#757575', '#ffffff'];
export const GOLD = '#c9a227';

/** 4 色環電阻：第一位數、第二位數、倍率、金色（±5%）。 */
export function resistorBands(ohms: number): [string, string, string, string] {
  const digits = String(Math.max(0, Math.round(ohms)));
  if (digits.length === 1) return [BAND_COLORS[0], BAND_COLORS[Number(digits)], BAND_COLORS[0], GOLD];
  return [BAND_COLORS[Number(digits[0])], BAND_COLORS[Number(digits[1])], BAND_COLORS[Math.min(9, digits.length - 2)], GOLD];
}
