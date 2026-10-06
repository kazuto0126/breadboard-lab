// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardCanvas } from '../../src/app/board/BoardCanvas';
import { addWire, placeComponent } from '../../src/app/commands/commands';
import { ContextMenu } from '../../src/app/interaction/ContextMenu';
import { runShortcut, selectedComponentId, useKeyboardShortcuts } from '../../src/app/interaction/useKeyboardShortcuts';
import { resetEditor, useEditor } from '../../src/app/store/editorStore';
import { hole } from '../fixtures/build';

afterEach(cleanup);
beforeEach(() => resetEditor());

const place = (defId: string, x: number, y: number) => useEditor.getState().run((doc) => placeComponent(doc, defId, { x, y }));
const ids = () => useEditor.getState().doc.circuit.components.map((c) => c.id);
const noSave = () => undefined;

describe('runShortcut', () => {
  it('rotates and deletes the selected part, and deletes a selected wire', () => {
    place('resistor', 20, 6);
    runShortcut('rotate', noSave);
    expect(useEditor.getState().doc.circuit.components[0].rotation).toBe(90);
    runShortcut('delete', noSave);
    expect(ids()).toEqual([]);
    useEditor.getState().run((doc) => addWire(doc, hole('A10'), hole('A20'), true, '#212121'));
    runShortcut('delete', noSave);
    expect(useEditor.getState().doc.circuit.wires).toEqual([]);
  });

  it('undoes, redoes and saves', () => {
    place('led', 40, 12);
    runShortcut('undo', noSave);
    expect(ids()).toEqual([]);
    runShortcut('redo', noSave);
    expect(ids()).toEqual(['D1']);
    const save = vi.fn();
    runShortcut('save', save);
    expect(save).toHaveBeenCalledOnce();
  });

  it('escape cancels a pending action first, then leaves compare mode, then clears the selection', () => {
    place('led', 40, 12);
    useEditor.getState().setArmedPart({ key: 'led-red', defId: 'led', label: '紅色 LED', props: { color: 'red' } });
    runShortcut('escape', noSave);
    expect(useEditor.getState().armedPart).toBeNull();
    expect(useEditor.getState().selection).not.toBeNull();
    useEditor.getState().setMode('compare');
    runShortcut('escape', noSave);
    expect(useEditor.getState().mode).toBe('edit');
    runShortcut('escape', noSave);
    expect(useEditor.getState().selection).toBeNull();
  });

  it('treats a selected pin as its part', () => {
    expect(selectedComponentId({ kind: 'pin', componentId: 'U1', pinNumber: 3 })).toBe('U1');
    expect(selectedComponentId({ kind: 'wire', id: 'm1' })).toBeNull();
    expect(selectedComponentId(null)).toBeNull();
  });
});

function ShortcutHost({ onSave }: { onSave: () => void }) {
  useKeyboardShortcuts(onSave);
  return <input aria-label="name" />;
}

describe('useKeyboardShortcuts', () => {
  it('listens on the window but ignores typing in inputs, except Ctrl+S', () => {
    place('led', 40, 12);
    const save = vi.fn();
    render(<ShortcutHost onSave={save} />);
    fireEvent.keyDown(screen.getByLabelText('name'), { key: 'Delete' });
    expect(ids()).toEqual(['D1']);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(ids()).toEqual([]);
    fireEvent.keyDown(screen.getByLabelText('name'), { key: 's', ctrlKey: true });
    expect(save).toHaveBeenCalledOnce();
  });
});

describe('ContextMenu', () => {
  it('offers rotate and delete for parts, and flip for wires', () => {
    place('resistor', 20, 6);
    const onClose = vi.fn();
    render(<ContextMenu menu={{ x: 10, y: 10, hit: { kind: 'component', componentId: 'R1' } }} onClose={onClose} />);
    expect(screen.getByRole('menuitem', { name: '旋轉 90°' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: '刪除' }));
    expect(ids()).toEqual([]);
    expect(onClose).toHaveBeenCalled();
    cleanup();
    useEditor.getState().run((doc) => addWire(doc, hole('A10'), hole('C12'), true, '#212121'));
    render(<ContextMenu menu={{ x: 10, y: 10, hit: { kind: 'wire', wireId: 'm1' } }} onClose={noSave} />);
    fireEvent.click(screen.getByRole('menuitem', { name: '翻轉轉角' }));
    expect(useEditor.getState().doc.circuit.wires[0].path[1]).toMatchObject({ x: 10, y: 5 });
  });
});

describe('BoardCanvas', () => {
  it('renders the board and zooms with the buttons', () => {
    render(<BoardCanvas />);
    expect(screen.getByTestId('board-svg')).toBeTruthy();
    const before = useEditor.getState().viewport.scale;
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    expect(useEditor.getState().viewport.scale).toBeGreaterThan(before);
    fireEvent.click(screen.getByRole('button', { name: '縮小' }));
    expect(useEditor.getState().viewport.scale).toBeCloseTo(before, 5);
  });
});
