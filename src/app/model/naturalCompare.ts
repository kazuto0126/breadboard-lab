const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** 自然排序：NET_2 排在 NET_10 前面。 */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}
