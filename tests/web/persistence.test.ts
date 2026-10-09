import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findLibraryItem } from '../../src/editor/library';
import { loadAutosave, writeAutosave } from '../../src/state/persistence';
import { initialState, isDirty, startAutosave, useStore } from '../../src/state/store';
import { circuit, comp } from '../fixtures/build';

/** Node 沒有 localStorage：用記憶體版本代替。 */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

const s = () => useStore.getState();

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage() });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('autosave remembers unsaved changes', () => {
  it('round-trips the unsaved flag and keeps old autosaves readable', () => {
    const c = circuit([comp('R1', 'resistor', 'A10')]);
    expect(writeAutosave(c, '練習', {}, true)).toBe(true);
    expect(loadAutosave()).toMatchObject({ name: '練習', unsaved: true });
    expect(writeAutosave(c, '練習', {})).toBe(true);
    expect(loadAutosave()?.unsaved).toBe(false);
  });

  it('still counts as unsaved after a reload', () => {
    writeAutosave(circuit([comp('R1', 'resistor', 'A10')]), null, {}, true);
    useStore.setState(initialState());
    expect(s().circuit.components.map((c) => c.id)).toEqual(['R1']);
    expect(isDirty(s())).toBe(true);

    writeAutosave(circuit([comp('R1', 'resistor', 'A10')]), '練習', {}, false);
    useStore.setState(initialState());
    expect(isDirty(s())).toBe(false);
  });

  it('writes the flag when the circuit changes and clears it after saving', () => {
    vi.useFakeTimers();
    useStore.setState(initialState());
    const stop = startAutosave();
    try {
      s().placeComponent(findLibraryItem('led-red')!, 0, 'b1', { x: 5, y: 4 });
      vi.advanceTimersByTime(500);
      expect(loadAutosave()?.unsaved).toBe(true);

      s().saveProject('練習');
      vi.advanceTimersByTime(500);
      expect(loadAutosave()).toMatchObject({ name: '練習', unsaved: false });
    } finally {
      stop();
    }
  });
});
