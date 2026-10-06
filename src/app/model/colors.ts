export interface WireColor {
  hex: string;
  name: string;
}

export const WIRE_COLORS: WireColor[] = [
  { hex: '#d32f2f', name: '紅' },
  { hex: '#212121', name: '黑' },
  { hex: '#f9a825', name: '黃' },
  { hex: '#2e7d32', name: '綠' },
  { hex: '#1565c0', name: '藍' },
  { hex: '#ef6c00', name: '橘' },
  { hex: '#f5f5f5', name: '白' },
  { hex: '#6a1b9a', name: '紫' },
  { hex: '#6d4c41', name: '棕' },
  { hex: '#9e9e9e', name: '灰' },
];

export const DEFAULT_WIRE_COLOR = '#d32f2f';

export function colorName(hex: string): string {
  return WIRE_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? '其他';
}
