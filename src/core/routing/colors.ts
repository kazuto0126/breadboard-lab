import type { Net } from '../../types/circuit';

export const POWER_COLOR = '#d32f2f';
export const GROUND_COLOR = '#212121';
/** 黃、綠、藍、橘、白、紫、棕、灰。 */
export const SIGNAL_PALETTE = ['#f9a825', '#2e7d32', '#1565c0', '#ef6c00', '#f5f5f5', '#6a1b9a', '#6d4c41', '#9e9e9e'];

export function netColor(kind: Net['kind'], signalIndex: number): string {
  if (kind === 'power') return POWER_COLOR;
  if (kind === 'ground') return GROUND_COLOR;
  return SIGNAL_PALETTE[Math.max(0, signalIndex) % SIGNAL_PALETTE.length];
}
