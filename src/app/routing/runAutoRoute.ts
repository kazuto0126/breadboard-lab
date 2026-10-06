import type { StoreApi } from 'zustand/vanilla';
import { scoreRouting } from '../../core/routing/score';
import type { Circuit } from '../../types/circuit';
import type { RoutingResult } from '../../types/routing';
import { applyRoutingResult } from '../commands/commands';
import type { EditorStore } from '../store/editorStore';
import { animationStepMs, checklistOrder } from './checklist';
import { RoutingCancelled } from './routingClient';

export interface Router {
  route(circuit: Circuit): Promise<RoutingResult>;
}

/** 規格第 8.2 節：鎖住編輯 → 背景佈線 → 成功就套用並播放動畫，失敗就顯示預覽與原因。 */
export async function runAutoRoute(store: Pick<StoreApi<EditorStore>, 'getState'>, router: Router): Promise<void> {
  const start = store.getState();
  if (start.mode !== 'edit') return;
  const circuit = start.doc.circuit;
  const beforeScore = scoreRouting(circuit).score;
  start.setPreviewWires([]);
  start.select(null);
  start.setMode('routing');
  start.setRoutingJob({ status: 'running' });

  let result: RoutingResult;
  try {
    result = await router.route(circuit);
  } catch (error) {
    const s = store.getState();
    s.setMode('edit');
    if (error instanceof RoutingCancelled) s.setRoutingJob({ status: 'idle' });
    else s.setRoutingJob({ status: 'error', message: `佈線時發生錯誤：${error instanceof Error ? error.message : String(error)}` });
    return;
  }

  const s = store.getState();
  s.setMode('edit');
  if (result.status === 'success' && result.wires.length === 0) {
    s.setRoutingJob({ status: 'idle' });
    s.notify('目前沒有需要接線的 Net', 'info');
    return;
  }
  if (result.status !== 'success') {
    s.setPreviewWires(result.wires);
    s.setRoutingJob({ status: 'failed', message: result.message, failedNets: result.failedNets });
    return;
  }
  if (!s.run((doc) => applyRoutingResult(doc, result, beforeScore))) {
    s.setRoutingJob({ status: 'idle' });
    return;
  }
  const order = checklistOrder(store.getState().doc.circuit).map((row) => row.wireId);
  s.setRoutingJob({ status: 'animating', wireIds: order, stepMs: animationStepMs(order.length) });
  s.setRightTab('checklist');
}
