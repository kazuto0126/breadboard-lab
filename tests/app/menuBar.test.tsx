// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRoutingResult, placeComponent } from '../../src/app/commands/commands';
import { createProject } from '../../src/app/model/projectFile';
import { MenuBar, type MenuBarProps } from '../../src/app/panels/MenuBar';
import { startAutoRoute } from '../../src/app/routing/routingService';
import { resetEditor, useEditor } from '../../src/app/store/editorStore';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { acceptanceCircuit } from '../fixtures/circuits';

vi.mock('../../src/app/routing/routingService', () => ({
  startAutoRoute: vi.fn(() => Promise.resolve()),
  cancelAutoRoute: vi.fn(),
}));

afterEach(cleanup);
beforeEach(() => {
  resetEditor();
  vi.mocked(startAutoRoute).mockClear();
});

const state = () => useEditor.getState();
const noop = () => {};
const renderBar = (props: Partial<MenuBarProps> = {}) =>
  render(<MenuBar partsOpen={false} infoOpen={false} onToggleParts={noop} onToggleInfo={noop} onShowInfo={noop} {...props} />);

describe('MenuBar', () => {
  it('lists the file menu items from the spec and closes with Esc', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: '檔案' }));
    const menu = screen.getByRole('menu', { name: '檔案' });
    expect(within(menu).getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      '新電路',
      '儲存',
      '另存新檔',
      '開啟',
      '匯入 JSON',
      '匯出 JSON',
      '匯出 SVG',
      '匯出 PNG',
    ]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('undoes and redoes from the edit menu', () => {
    renderBar();
    act(() => {
      state().run((doc) => placeComponent(doc, 'led', { x: 40, y: 12 }));
    });
    fireEvent.click(screen.getByRole('button', { name: '編輯' }));
    expect(screen.getByRole('menuitem', { name: '重做' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: '復原' }));
    expect(state().doc.circuit.components).toHaveLength(0);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '編輯' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '重做' }));
    expect(state().doc.circuit.components).toHaveLength(1);
  });

  it('rotates and deletes the selected component', () => {
    renderBar();
    act(() => {
      state().run((doc) => placeComponent(doc, 'resistor', { x: 30, y: 6 }));
      state().select({ kind: 'component', id: state().doc.circuit.components[0].id });
    });
    fireEvent.click(screen.getByRole('button', { name: '編輯' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '旋轉' }));
    expect(state().doc.circuit.components[0].rotation).toBe(90);
    fireEvent.click(screen.getByRole('button', { name: '編輯' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '刪除' }));
    expect(state().doc.circuit.components).toEqual([]);
  });

  it('picks the wire colour', () => {
    renderBar();
    fireEvent.click(screen.getByRole('radio', { name: '藍色導線' }));
    expect(state().wireColor).toBe('#1565c0');
    expect(screen.getByRole('radio', { name: '藍色導線' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '紅色導線' }).getAttribute('aria-checked')).toBe('false');
  });

  it('runs the circuit check and asks to show the info panel', () => {
    const onShowInfo = vi.fn();
    renderBar({ onShowInfo });
    fireEvent.click(screen.getByRole('button', { name: '電路檢查 Check Circuit' }));
    expect(state().rightTab).toBe('check');
    expect(onShowInfo).toHaveBeenCalledTimes(1);
  });

  it('starts AI routing', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'AI 標準佈線' }));
    expect(startAutoRoute).toHaveBeenCalledTimes(1);
  });

  it('enables compare only while the routing is up to date', () => {
    renderBar();
    const compare = () => screen.getByRole('button', { name: '比較' });
    expect(compare().hasAttribute('disabled')).toBe(true);
    act(() => {
      state().replaceDocument({ ...createProject(), circuit: acceptanceCircuit() }, { projectId: null, undoable: false, dirty: false });
      state().run((doc) => applyRoutingResult(doc, autoRoute(doc.circuit), 0));
    });
    expect(compare().hasAttribute('disabled')).toBe(false);
    fireEvent.click(compare());
    expect(state().mode).toBe('compare');
    expect(compare().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(compare());
    expect(state().mode).toBe('edit');
    act(() => {
      state().run((doc) => placeComponent(doc, 'led', { x: 55, y: 12 }));
    });
    expect(compare().hasAttribute('disabled')).toBe(true);
  });

  it('toggles the drawers', () => {
    const onToggleParts = vi.fn();
    const onToggleInfo = vi.fn();
    renderBar({ onToggleParts, onToggleInfo });
    fireEvent.click(screen.getByRole('button', { name: '元件庫' }));
    fireEvent.click(screen.getByRole('button', { name: '資訊' }));
    expect(onToggleParts).toHaveBeenCalledTimes(1);
    expect(onToggleInfo).toHaveBeenCalledTimes(1);
  });
});
