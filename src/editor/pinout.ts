import type { ComponentDefinition, Rotation } from '../types/component';

export interface PinoutPin {
  number: number;
  name: string;
  /** 顯示用的名稱（去掉表示低電位有效的開頭 /）。 */
  label: string;
  activeLow: boolean;
  kind: 'power' | 'ground' | 'nc' | 'other';
}

export interface PinoutLayout {
  /** 兩排都是從左到右，和元件插在板上時看到的方向相同。 */
  top: PinoutPin[];
  bottom: PinoutPin[];
  notch: 'left' | 'right';
}

/** 規格 2026-10-11 new-parts 第 3 節：DIP 元件（IC、NE555、7 段顯示器）的腳位圖；指撥開關與其他封裝回傳 null。 */
export function pinoutLayout(def: ComponentDefinition, rotation: Rotation): PinoutLayout | null {
  if (def.package.type !== 'dip' || def.category === 'dip-switch') return null;
  const count = def.package.pinCount;
  const half = count / 2;
  const pin = (n: number): PinoutPin => {
    const d = def.pins.find((p) => p.number === n)!;
    const activeLow = d.name.startsWith('/') && d.name.length > 1;
    const kind = d.role === 'power' || d.role === 'anode' ? 'power' : d.role === 'ground' ? 'ground' : d.role === 'nc' ? 'nc' : 'other';
    return { number: n, name: d.name, label: activeLow ? d.name.slice(1) : d.name, activeLow, kind };
  };
  const range = (from: number, to: number) => {
    const out: number[] = [];
    for (let n = from; from <= to ? n <= to : n >= to; n += from <= to ? 1 : -1) out.push(n);
    return out;
  };
  // 旋轉 0：第 1 腳在左下，下排 1…half、上排 count…half+1；轉 180 度剛好上下左右對調。
  if (rotation === 180) return { top: range(half, 1).map(pin), bottom: range(half + 1, count).map(pin), notch: 'right' };
  return { top: range(count, half + 1).map(pin), bottom: range(1, half).map(pin), notch: 'left' };
}
