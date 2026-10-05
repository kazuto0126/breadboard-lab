/** 以 key 排序的最小堆積；key 相同時先放入者先出，確保結果確定。 */
export class MinHeap {
  private readonly keys: number[] = [];
  private readonly seqs: number[] = [];
  private readonly values: number[] = [];
  private counter = 0;

  get size(): number {
    return this.values.length;
  }

  push(key: number, value: number): void {
    this.keys.push(key);
    this.seqs.push(this.counter++);
    this.values.push(value);
    this.siftUp(this.values.length - 1);
  }

  pop(): { key: number; value: number } | undefined {
    if (this.values.length === 0) return undefined;
    const top = { key: this.keys[0], value: this.values[0] };
    this.swap(0, this.values.length - 1);
    this.keys.pop();
    this.seqs.pop();
    this.values.pop();
    if (this.values.length > 0) this.siftDown(0);
    return top;
  }

  private less(i: number, j: number): boolean {
    return this.keys[i] < this.keys[j] || (this.keys[i] === this.keys[j] && this.seqs[i] < this.seqs[j]);
  }

  private swap(i: number, j: number): void {
    const k = this.keys[i];
    this.keys[i] = this.keys[j];
    this.keys[j] = k;
    const s = this.seqs[i];
    this.seqs[i] = this.seqs[j];
    this.seqs[j] = s;
    const v = this.values[i];
    this.values[i] = this.values[j];
    this.values[j] = v;
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.values.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.less(left, smallest)) smallest = left;
      if (right < n && this.less(right, smallest)) smallest = right;
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }
}
