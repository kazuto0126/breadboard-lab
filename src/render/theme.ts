import type { LedColor } from '../types/component';
import type { Level } from '../types/logic';

/** 麵包板與元件的繪圖顏色。寫成 SVG 屬性（不用 CSS class），匯出的 SVG 才能獨立顯示。 */
export const BOARD = {
  body: '#f3efe6',
  edge: '#cfc6b3',
  shadow: '#000000',
  channel: '#e3dccd',
  channelLine: '#d2c9b6',
  hole: '#5f5b53',
  holeRim: '#d9d1c0',
  label: '#8f8775',
  railPlus: '#d32f2f',
  railMinus: '#1e63c4',
};

export const PART = {
  icBody: '#25272c',
  icEdge: '#0d0e10',
  icText: '#eceff1',
  icSubText: '#9aa0a6',
  metal: '#c9ccd1',
  metalEdge: '#8b8f96',
  lead: '#a7abb1',
  resistorBody: '#d9c49a',
  resistorEdge: '#a8946a',
  switchBody: '#c62828',
  switchEdge: '#7f1d1d',
  buttonBody: '#455a64',
  buttonEdge: '#263238',
  vcc: '#d32f2f',
  vccEdge: '#8e1b1b',
  gnd: '#263238',
  gndEdge: '#0f1417',
  dcBody: '#37474f',
  clock: '#6d28d9',
  clockEdge: '#3b0f87',
};

export const LED_FILL: Record<LedColor, { fill: string; edge: string; glow: string }> = {
  red: { fill: '#e53935', edge: '#8e1b1b', glow: '#ff8a80' },
  green: { fill: '#43a047', edge: '#1b5e20', glow: '#b9f6ca' },
  yellow: { fill: '#fdd835', edge: '#a88a00', glow: '#ffff8d' },
  blue: { fill: '#1e88e5', edge: '#0d47a1', glow: '#82b1ff' },
};

/** 色環：0–9 與金色（誤差 5%）。 */
export const BAND_COLORS = ['#1b1b1b', '#6d4c41', '#d32f2f', '#ef6c00', '#fbc02d', '#388e3c', '#1976d2', '#7b1fa2', '#9e9e9e', '#fafafa'];
export const GOLD = '#c9a227';
export const SILVER = '#b0b7bd';

/** 4 色環：兩位有效數字、乘數、誤差（金色 5%）。 */
export function resistorBands(ohms: number): string[] {
  if (!(ohms > 0)) return [BAND_COLORS[0], BAND_COLORS[0], BAND_COLORS[0], GOLD];
  let exponent = Math.floor(Math.log10(ohms)) - 1;
  let significant = Math.round(ohms / 10 ** exponent);
  if (significant >= 100) {
    significant = Math.round(significant / 10);
    exponent++;
  }
  const multiplier = exponent >= 0 ? BAND_COLORS[Math.min(9, exponent)] : exponent === -1 ? GOLD : SILVER;
  return [BAND_COLORS[Math.floor(significant / 10)], BAND_COLORS[significant % 10], multiplier, GOLD];
}

/** 模擬時的電位顏色：1 亮綠、0 灰、Z（浮接）藍、X（衝突 / 未知）紅。 */
export const LEVEL_COLORS: Record<string, string> = { '1': '#22c55e', '0': '#64748b', Z: '#60a5fa', X: '#ef4444' };

export function levelColor(level: Level | undefined): string | undefined {
  return level === undefined ? undefined : LEVEL_COLORS[String(level)];
}

export const LEVEL_NAMES: Record<string, string> = { '1': 'HIGH（1）', '0': 'LOW（0）', Z: '浮接（Z，TTL 輸入當成 HIGH）', X: '衝突 / 未知（X）' };

/** 互動用的高亮色（不會出現在匯出的圖中）。 */
export const UI = {
  select: '#38bdf8',
  net: '#38bdf8',
  hover: '#22c55e',
  ok: '#22c55e',
  bad: '#ef4444',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#22c55e',
  /** Board Group 外框（需求文件 38.10 的 Blue Group Outline）。 */
  group: '#60a5fa',
  /** 吸附預覽線（38.16 的淡藍色預覽線）。 */
  snap: '#7dd3fc',
};
