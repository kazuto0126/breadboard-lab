// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { placeComponent } from '../../src/app/commands/commands';
import { newCircuit, saveCurrent } from '../../src/app/fileActions';
import { createProject } from '../../src/app/model/projectFile';
import { askConfirm, askName, askOpenProject, DialogHost } from '../../src/app/panels/dialogs';
import { filterCatalog, partCatalog } from '../../src/app/panels/partTemplates';
import { PartsPanel } from '../../src/app/panels/PartsPanel';
import { StatusBar } from '../../src/app/panels/StatusBar';
import { getBrowserStore, listProjects, saveProject } from '../../src/app/persistence/browserStorage';
import { resetEditor, useEditor } from '../../src/app/store/editorStore';
import { acceptanceCircuit } from '../fixtures/circuits';

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  resetEditor();
});

const state = () => useEditor.getState();
const keysOf = (catalog: ReturnType<typeof partCatalog>) => catalog.flatMap((c) => c.parts.map((p) => p.key));

describe('part catalog', () => {
  it('groups parts and uses stable keys', () => {
    const catalog = partCatalog();
    expect(catalog.map((c) => c.title)).toEqual(['74LS', '電阻', 'LED', '電源', '開關與按鈕']);
    expect(catalog[0].parts).toHaveLength(20);
    expect(catalog[1].parts.map((p) => p.key)).toEqual([
      'resistor-220',
      'resistor-330',
      'resistor-470',
      'resistor-1000',
      'resistor-2200',
      'resistor-4700',
      'resistor-10000',
      'resistor-100000',
    ]);
    expect(catalog[1].parts[0]).toMatchObject({ label: '220Ω', props: { resistance: 220 } });
    expect(catalog[2].parts.map((p) => p.label)).toEqual(['紅色 LED', '綠色 LED', '黃色 LED', '藍色 LED']);
  });

  it('filters by name, part id or category', () => {
    const catalog = partCatalog();
    expect(keysOf(filterCatalog(catalog, '220'))).toEqual(['resistor-220']);
    expect(keysOf(filterCatalog(catalog, '74ls00'))).toEqual(['74LS00']);
    expect(keysOf(filterCatalog(catalog, '電源'))).toEqual(['vcc', 'gnd', 'dc-power']);
    expect(filterCatalog(catalog, 'zzz')).toEqual([]);
    expect(filterCatalog(catalog, '  ')).toBe(catalog);
  });
});

describe('PartsPanel', () => {
  it('shows a tile per part and filters with the search box', () => {
    render(<PartsPanel />);
    expect(document.querySelector('[data-part="74LS00"]')).not.toBeNull();
    expect(document.querySelector('[data-part="resistor-220"]')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('搜尋元件'), { target: { value: 'gnd' } });
    expect(document.querySelectorAll('[data-part]')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('搜尋元件'), { target: { value: 'zzz' } });
    expect(screen.getByText('找不到符合的元件')).toBeTruthy();
  });
});

describe('StatusBar', () => {
  it('shows counts, the score, and a cancel button while routing', () => {
    act(() => state().replaceDocument({ ...createProject(), circuit: acceptanceCircuit() }, { projectId: null, undoable: false, dirty: false }));
    render(<StatusBar autosaveError={null} />);
    expect(screen.getByText('導線 7')).toBeTruthy();
    expect(screen.getByText('Net 4')).toBeTruthy();
    expect(screen.getByText('Routing Score 0')).toBeTruthy();
    expect(screen.getByText('已自動儲存')).toBeTruthy();
    expect(screen.getByTestId('status').textContent).toBe('就緒');
    act(() => state().setMode('routing'));
    expect(screen.getByTestId('status').textContent).toBe('計算中…');
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy();
  });
});

describe('dialogs', () => {
  it('asks for a name and for a confirmation', async () => {
    render(<DialogHost />);
    let name: Promise<string | null> = Promise.resolve(null);
    act(() => {
      name = askName('另存新檔', '舊名稱');
    });
    fireEvent.change(screen.getByLabelText('名稱'), { target: { value: '新名稱' } });
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    await expect(name).resolves.toBe('新名稱');
    let ok: Promise<boolean> = Promise.resolve(true);
    act(() => {
      ok = askConfirm('確定嗎？');
    });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await expect(ok).resolves.toBe(false);
  });

  it('lists saved projects and confirms before deleting one', async () => {
    saveProject(getBrowserStore(), createProject('甲'), null, new Date('2026-10-06T01:00:00Z'), () => 'p_a');
    saveProject(getBrowserStore(), createProject('乙'), null, new Date('2026-10-06T02:00:00Z'), () => 'p_b');
    render(<DialogHost />);
    let chosen: Promise<string | null> = Promise.resolve(null);
    act(() => {
      chosen = askOpenProject();
    });
    fireEvent.click(screen.getByRole('button', { name: '刪除「甲」' }));
    fireEvent.click(screen.getByRole('button', { name: '確定刪除「甲」' }));
    expect(listProjects(getBrowserStore()).map((e) => e.id)).toEqual(['p_b']);
    fireEvent.click(screen.getByRole('button', { name: '開啟「乙」' }));
    await expect(chosen).resolves.toBe('p_b');
  });
});

describe('file actions', () => {
  it('asks for a name the first time and saves into the browser', async () => {
    render(<DialogHost />);
    act(() => {
      state().run((doc) => placeComponent(doc, 'led', { x: 40, y: 12 }));
    });
    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = saveCurrent();
    });
    fireEvent.change(screen.getByLabelText('名稱'), { target: { value: '我的 LED' } });
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    await act(async () => {
      await saving;
    });
    expect(state().dirty).toBe(false);
    expect(state().doc.name).toBe('我的 LED');
    expect(listProjects(getBrowserStore()).map((e) => e.name)).toEqual(['我的 LED']);
  });

  it('confirms before discarding unsaved work, and the new circuit can be undone', async () => {
    render(<DialogHost />);
    act(() => {
      state().run((doc) => placeComponent(doc, 'led', { x: 40, y: 12 }));
    });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = newCircuit();
    });
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    await act(async () => {
      await pending;
    });
    expect(state().doc.circuit.components).toEqual([]);
    act(() => state().undo());
    expect(state().doc.circuit.components).toHaveLength(1);
  });
});
