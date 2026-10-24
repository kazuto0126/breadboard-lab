import { beforeEach, describe, expect, it } from 'vitest';
import { serializeCircuitFile } from '../../src/editor/fileFormat';
import { findLibraryItem } from '../../src/editor/library';
import { majorityDiagram } from '../../src/logic/examples';
import { initialLogicState, useLogic } from '../../src/state/logic';
import { initialState, useStore } from '../../src/state/store';
import { acceptanceCircuit } from '../fixtures/circuits';

/** 子專案 43（規格 2026-10-24 share-link 第 3 節）：從連結開啟電路。 */
const s = () => useStore.getState();
const shared = serializeCircuitFile(acceptanceCircuit(), '連結的電路', undefined, majorityDiagram());

beforeEach(() => {
  useStore.setState(initialState());
  useLogic.setState(initialLogicState());
});

describe('opening a shared circuit', () => {
  it('opens right away when nothing is unsaved', () => {
    s().openShared(shared);
    expect(s().projectName).toBe('連結的電路');
    expect(s().circuit.components.length).toBe(acceptanceCircuit().components.length);
    expect(useLogic.getState().diagram.nodes.length).toBe(majorityDiagram().nodes.length);
    expect(s().dialog).toBeNull();
    expect(s().toasts.at(-1)?.message).toBe('已從連結開啟「連結的電路」');
  });

  it('asks first when the breadboard has unsaved changes, and keeps it when cancelled', () => {
    s().placeComponent(findLibraryItem('74LS00')!, 0, 'b1', { x: 10, y: 11 });
    const before = s().circuit;
    s().openShared(shared);
    expect(s().dialog).toBe('confirm-link');
    expect(s().circuit).toBe(before);
    s().closeDialog();
    expect(s().pendingShare).toBeNull();
    expect(s().circuit).toBe(before);

    s().openShared(shared);
    s().confirmShared();
    expect(s().projectName).toBe('連結的電路');
    expect(s().pendingShare).toBeNull();
    expect(s().dialog).toBeNull();
  });

  it('asks first when only the logic diagram has unsaved changes', () => {
    useLogic.getState().load(majorityDiagram());
    useLogic.getState().toggleInput(useLogic.getState().diagram.nodes.find((n) => n.kind === 'INPUT')!.id);
    useLogic.getState().apply({ ok: true, diagram: { ...useLogic.getState().diagram, nodes: useLogic.getState().diagram.nodes.slice(1) } }, '刪除');
    s().openShared(shared);
    expect(s().dialog).toBe('confirm-link');
  });

  it('says why when the link holds something that is not a circuit file', () => {
    const before = s().circuit;
    s().openShared('{"format":"nope"}');
    expect(s().circuit).toBe(before);
    expect(s().dialog).toBeNull();
    expect(s().toasts.at(-1)).toMatchObject({ kind: 'error', message: expect.stringContaining('連結裡的電路讀不出來') });
  });
});
