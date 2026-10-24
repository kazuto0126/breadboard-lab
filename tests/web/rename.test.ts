import { beforeEach, describe, expect, it } from 'vitest';
import { initialLogicState, useLogic } from '../../src/state/logic';
import { initialState, useStore } from '../../src/state/store';

/** 子專案 47（規格 2026-10-25 convert-improvements 第 5 節）：左上角的電路名稱可以改。 */
const s = () => useStore.getState();
beforeEach(() => {
  useStore.setState(initialState());
  useLogic.setState(initialLogicState());
});

describe('renaming the circuit', () => {
  it('sets the name, trims it, and refuses an empty name', () => {
    s().renameProject('  我的計數器 ');
    expect(s().projectName).toBe('我的計數器');
    expect(s().toasts.at(-1)?.message).toBe('電路名稱改成「我的計數器」');
    s().renameProject('   ');
    expect(s().projectName).toBe('我的計數器');
    expect(s().toasts.at(-1)).toMatchObject({ kind: 'error', message: '名稱不能是空的' });
    s().renameProject('x'.repeat(61));
    expect(s().toasts.at(-1)).toMatchObject({ kind: 'error', message: '名稱最多 60 個字' });
  });
});
