// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, bootstrapEditor } from '../../src/app/App';
import { addWire, applyRoutingResult } from '../../src/app/commands/commands';
import { createProject } from '../../src/app/model/projectFile';
import { getBrowserStore, readAutosave, STORAGE_KEYS, writeAutosave } from '../../src/app/persistence/browserStorage';
import { resetEditor, useEditor } from '../../src/app/store/editorStore';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { hole } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  localStorage.clear();
  resetEditor();
});

const state = () => useEditor.getState();

describe('bootstrapEditor', () => {
  it('restores the autosaved project', () => {
    writeAutosave(getBrowserStore(), { ...createProject('實驗一'), circuit: acceptanceCircuit() }, 'p_1');
    bootstrapEditor();
    expect(state().doc.name).toBe('實驗一');
    expect(state().projectId).toBe('p_1');
    expect(state().analysis.wireCount).toBe(7);
    expect(state().dirty).toBe(false);
  });

  it('still asks before discarding work that was never saved before the reload', () => {
    writeAutosave(getBrowserStore(), { ...createProject('沒存的'), circuit: acceptanceCircuit() }, null, true);
    bootstrapEditor();
    expect(state().dirty).toBe(true);
  });

  it('starts with an empty board when the autosave is damaged', () => {
    localStorage.setItem(STORAGE_KEYS.autosave, '{ broken');
    bootstrapEditor();
    expect(state().doc.circuit.components).toEqual([]);
    expect(state().projectId).toBeNull();
  });
});

describe('App', () => {
  it('lays out the menu bar, parts library, board, info panel and status bar', () => {
    render(<App />);
    expect(screen.getByText('breadboard-lab')).toBeTruthy();
    expect(screen.getByRole('button', { name: '電路檢查 Check Circuit' })).toBeTruthy();
    expect(screen.getByLabelText('搜尋元件')).toBeTruthy();
    expect(screen.getByTestId('board-svg')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '選取' })).toBeTruthy();
    expect(screen.getByTestId('status').textContent).toBe('就緒');
  });

  it('refreshes the analysis after 150 ms and autosaves after 1 s', () => {
    vi.useFakeTimers();
    render(<App />);
    act(() => {
      state().run((doc) => addWire(doc, hole('A45'), hole('A50'), true, '#d32f2f'));
    });
    expect(state().analysis.wireCount).toBe(0);
    act(() => vi.advanceTimersByTime(150));
    expect(state().analysis.wireCount).toBe(1);
    expect(screen.getByText('導線 1')).toBeTruthy();
    expect(readAutosave(getBrowserStore())).toBeNull();
    act(() => vi.advanceTimersByTime(850));
    expect(readAutosave(getBrowserStore())?.doc.circuit.wires).toHaveLength(1);
    expect(readAutosave(getBrowserStore())?.dirty).toBe(true);
  });

  it('saves with Ctrl+S through the name dialog', async () => {
    render(<App />);
    act(() => {
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    });
    fireEvent.change(screen.getByLabelText('名稱'), { target: { value: '實驗二' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '確定' }));
    });
    expect(state().projectId).not.toBeNull();
    expect(state().doc.name).toBe('實驗二');
    expect(state().dirty).toBe(false);
  });

  it('opens the drawers and closes the parts drawer once a part is picked', () => {
    render(<App />);
    const parts = screen.getByRole('complementary', { name: '元件庫' });
    expect(parts.getAttribute('data-open')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '元件庫' }));
    expect(parts.getAttribute('data-open')).toBe('true');
    act(() => state().setArmedPart({ key: 'vcc', defId: 'vcc', label: 'VCC', props: {} }));
    expect(parts.getAttribute('data-open')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '資訊' }));
    expect(screen.getByRole('complementary', { name: '資訊' }).getAttribute('data-open')).toBe('true');
  });

  it('shows the compare view in compare mode', () => {
    act(() => {
      state().replaceDocument({ ...createProject(), circuit: acceptanceCircuit() }, { projectId: null, undoable: false, dirty: false });
      state().run((doc) => applyRoutingResult(doc, autoRoute(doc.circuit), 0));
    });
    render(<App />);
    act(() => state().setMode('compare'));
    expect(screen.getByRole('button', { name: '離開比較' })).toBeTruthy();
    expect(screen.getByTestId('status').textContent).toBe('比較中');
  });
});
