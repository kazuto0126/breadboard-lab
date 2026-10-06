// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addWire, applyRoutingResult, placeComponent } from '../../src/app/commands/commands';
import { createProject } from '../../src/app/model/projectFile';
import { formatOhms } from '../../src/app/panels/format';
import { InfoPanel } from '../../src/app/panels/InfoPanel';
import { resetEditor, useEditor } from '../../src/app/store/editorStore';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { hole } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

afterEach(cleanup);
beforeEach(() => resetEditor());

const state = () => useEditor.getState();
const place = (defId: string, x: number, y: number) => state().run((doc) => placeComponent(doc, defId, { x, y }));
const loadAcceptance = () =>
  state().replaceDocument({ ...createProject(), circuit: acceptanceCircuit() }, { projectId: null, undoable: false, dirty: false });

describe('formatOhms', () => {
  it('formats resistances the way parts lists print them', () => {
    expect([220, 1000, 2200, 4700, 10000, 100000].map(formatOhms)).toEqual(['220Ω', '1kΩ', '2.2kΩ', '4.7kΩ', '10kΩ', '100kΩ']);
  });
});

describe('InfoPanel — selection', () => {
  it('asks the user to select something', () => {
    render(<InfoPanel />);
    expect(screen.getByText('點一下元件、腳位、導線或孔，就會在這裡顯示資訊。')).toBeTruthy();
  });

  it('shows a part and edits its properties', () => {
    place('resistor', 30, 4);
    render(<InfoPanel />);
    expect(screen.getByText('Resistor（R1）')).toBeTruthy();
    expect(screen.getByText('A30')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('電阻值'), { target: { value: '220' } });
    expect(state().doc.circuit.components[0].props.resistance).toBe(220);
    fireEvent.click(screen.getByRole('button', { name: '加長兩腳距離' }));
    expect(state().doc.circuit.components[0].span).toBe(5);
    fireEvent.click(screen.getByRole('button', { name: '刪除' }));
    expect(state().doc.circuit.components).toEqual([]);
  });

  it('shows a pin and the other pins on its net', () => {
    loadAcceptance();
    state().select({ kind: 'pin', componentId: 'U1', pinNumber: 3 });
    render(<InfoPanel />);
    expect(screen.getByText('1Y')).toBeTruthy();
    expect(screen.getByText('輸出')).toBeTruthy();
    expect(screen.getByText('F12')).toBeTruthy();
    expect(screen.getByText('R1 第 1 腳（1）')).toBeTruthy();
  });

  it('shows a wire and flips or deletes it', () => {
    state().run((doc) => addWire(doc, hole('A10'), hole('C12'), true, '#212121'));
    render(<InfoPanel />);
    expect(screen.getByText('A10')).toBeTruthy();
    expect(screen.getByText('C12')).toBeTruthy();
    expect(screen.getByText('4 格')).toBeTruthy();
    expect(screen.getByText('黑')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '翻轉轉角' }));
    expect(state().doc.circuit.wires[0].path[1]).toMatchObject({ x: 10, y: 5 });
    fireEvent.click(screen.getByRole('button', { name: '刪除' }));
    expect(state().doc.circuit.wires).toEqual([]);
  });

  it('shows what is plugged into a hole', () => {
    place('led', 40, 12);
    state().select({ kind: 'hole', point: hole('G40') });
    render(<InfoPanel />);
    expect(screen.getByText('G40')).toBeTruthy();
    expect(screen.getByText('第 40 欄下半（F–J）')).toBeTruthy();
    expect(screen.getByText('D1 第 1 腳')).toBeTruthy();
  });
});

describe('InfoPanel — check results', () => {
  it('lists errors and selects the part when an item is clicked', () => {
    place('74LS00', 10, 11);
    state().select(null);
    state().runCheck();
    render(<InfoPanel />);
    expect(screen.getByText(/🔴 錯誤/)).toBeTruthy();
    fireEvent.click(screen.getByText('74LS00 (U1) 第 7 腳 GND 未連接'));
    expect(state().selection).toEqual({ kind: 'component', id: 'U1' });
  });

  it('shows the green message when the circuit is valid', () => {
    state().runCheck();
    render(<InfoPanel />);
    expect(screen.getByText('✓ Circuit Valid：電路檢查通過')).toBeTruthy();
  });
});

describe('InfoPanel — checklist', () => {
  const routed = () => {
    loadAcceptance();
    state().run((doc) => applyRoutingResult(doc, autoRoute(doc.circuit), 0));
    state().setRightTab('checklist');
  };

  it('explains what appears here before routing', () => {
    state().setRightTab('checklist');
    render(<InfoPanel />);
    expect(screen.getByText('執行 AI 標準佈線後，這裡會列出照著插的接線順序。')).toBeTruthy();
  });

  it('ticks wires off and tracks progress', () => {
    routed();
    render(<InfoPanel />);
    expect(screen.getByText('已完成 0 / 7')).toBeTruthy();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(7);
    fireEvent.click(boxes[0]);
    expect(screen.getByText('已完成 1 / 7')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '全部清除' }));
    expect(screen.getByText('已完成 0 / 7')).toBeTruthy();
  });

  it('warns and disables ticking when the circuit changed after routing', () => {
    routed();
    state().run((doc) => placeComponent(doc, 'led', { x: 50, y: 4 }));
    state().setRightTab('checklist');
    render(<InfoPanel />);
    expect(screen.getByRole('alert').textContent).toContain('接線清單已失效');
    expect(screen.getAllByRole('checkbox')[0]).toHaveProperty('disabled', true);
  });

  it('switches tabs', () => {
    render(<InfoPanel />);
    fireEvent.click(screen.getByRole('tab', { name: '檢查結果' }));
    expect(state().rightTab).toBe('check');
  });
});
