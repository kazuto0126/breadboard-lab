// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compareLayout, CompareView } from '../../src/app/board/CompareView';
import { applyRoutingResult } from '../../src/app/commands/commands';
import { createProject } from '../../src/app/model/projectFile';
import { CheckBanner, NoticeToast } from '../../src/app/panels/Banners';
import { RoutingProblems, StatsCard } from '../../src/app/panels/RoutingStatus';
import { useRoutingAnimation } from '../../src/app/routing/useRoutingAnimation';
import { resetEditor, useEditor } from '../../src/app/store/editorStore';
import { autoRoute } from '../../src/core/routing/autoRoute';
import { wire } from '../fixtures/build';
import { acceptanceCircuit } from '../fixtures/circuits';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => resetEditor());

const state = () => useEditor.getState();
const loadAcceptance = () =>
  state().replaceDocument({ ...createProject(), circuit: acceptanceCircuit() }, { projectId: null, undoable: false, dirty: false });
const routed = () => {
  loadAcceptance();
  state().run((doc) => applyRoutingResult(doc, autoRoute(doc.circuit), 12.5));
};
const setWidth = (width: number) => Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });

describe('StatsCard', () => {
  it('shows the statistics and both scores, and can skip or close', () => {
    routed();
    state().setRoutingJob({ status: 'animating', wireIds: ['a'], stepMs: 250 });
    render(<StatsCard />);
    expect(screen.getByText('Standard Routing Complete')).toBeTruthy();
    expect(screen.getByText('Wire Count')).toBeTruthy();
    expect(screen.getByText(String(state().doc.routing!.score))).toBeTruthy();
    expect(screen.getByText('12.5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '略過動畫' }));
    expect(state().routingJob).toEqual({ status: 'done' });
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    expect(state().routingJob).toEqual({ status: 'idle' });
  });

  it('stays hidden when nothing was routed', () => {
    const { container } = render(<StatsCard />);
    expect(container.textContent).toBe('');
  });
});

describe('RoutingProblems', () => {
  it('explains failures in Chinese and highlights a failed net', () => {
    loadAcceptance();
    state().setPreviewWires([wire('w_NET_1_1', 'C20', 'C30')]);
    state().setRoutingJob({
      status: 'failed',
      message: 'No valid routing solution.',
      failedNets: [{ netId: 'NET_1', reason: 'NO_FREE_HOLE', detail: '第 20 欄上半（A–E）沒有空孔可以接線' }],
    });
    render(<RoutingProblems />);
    expect(screen.getByText('No valid routing solution.')).toBeTruthy();
    expect(screen.getByText('NET_1：沒有空孔（第 20 欄上半（A–E）沒有空孔可以接線）')).toBeTruthy();
    expect(screen.getByText('試著把元件分散一點，或移開擋路的元件')).toBeTruthy();
    fireEvent.click(screen.getByText(/^NET_1：/));
    expect(state().selection).toMatchObject({ kind: 'pin', componentId: 'D1' });
    fireEvent.click(screen.getByRole('button', { name: '關閉預覽' }));
    expect(state().previewWires).toEqual([]);
  });

  it('shows worker errors', () => {
    state().setRoutingJob({ status: 'error', message: '佈線時發生錯誤：boom' });
    render(<RoutingProblems />);
    expect(screen.getByRole('alert').textContent).toContain('佈線時發生錯誤：boom');
  });
});

describe('banners and timers', () => {
  it('shows the green check banner for 3 seconds', () => {
    vi.useFakeTimers();
    render(<CheckBanner />);
    act(() => state().runCheck());
    expect(screen.getByText('✓ Circuit Valid：電路檢查通過')).toBeTruthy();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText('✓ Circuit Valid：電路檢查通過')).toBeNull();
  });

  it('dismisses notices after 3 seconds', () => {
    vi.useFakeTimers();
    render(<NoticeToast />);
    act(() => state().notify('這裡放不下：第 1 腳沒有插在孔上', 'error'));
    expect(screen.getByText('這裡放不下：第 1 腳沒有插在孔上')).toBeTruthy();
    act(() => vi.advanceTimersByTime(3000));
    expect(state().notice).toBeNull();
  });

  it('finishes the routing animation after every wire has been drawn', () => {
    vi.useFakeTimers();
    function Host() {
      useRoutingAnimation();
      return null;
    }
    render(<Host />);
    act(() => state().setRoutingJob({ status: 'animating', wireIds: ['a', 'b'], stepMs: 100 }));
    act(() => vi.advanceTimersByTime(499));
    expect(state().routingJob.status).toBe('animating');
    act(() => vi.advanceTimersByTime(1));
    expect(state().routingJob).toEqual({ status: 'done' });
  });
});

describe('compare mode', () => {
  it('puts the boards side by side from 1280 px', () => {
    expect(compareLayout(1280)).toBe('side-by-side');
    expect(compareLayout(1279)).toBe('toggle');
  });

  it('lets narrow screens switch between the two wirings', () => {
    routed();
    setWidth(800);
    render(<CompareView />);
    expect(screen.getByText(/AI 標準佈線（Routing Score/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '你的接線' }));
    expect(state().compareView).toBe('mine');
    expect(screen.getByText('你的接線（Routing Score 12.5）')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '離開比較' }));
    expect(state().mode).toBe('edit');
  });

  it('shows both boards on wide screens', () => {
    routed();
    setWidth(1400);
    render(<CompareView />);
    expect(screen.getAllByTestId('board-svg')).toHaveLength(2);
  });
});
