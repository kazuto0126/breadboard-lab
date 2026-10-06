import { useEditor } from '../store/editorStore';
import { RoutingClient } from './routingClient';
import { runAutoRoute } from './runAutoRoute';

let client: RoutingClient | null = null;

/** 第一次按「AI 標準佈線」時才載入 Worker，讓單元測試與首次載入不受影響。 */
export async function startAutoRoute(): Promise<void> {
  if (useEditor.getState().mode !== 'edit') return;
  if (!client) {
    const { createRoutingWorker } = await import('./workerFactory');
    client = new RoutingClient(createRoutingWorker);
  }
  await runAutoRoute(useEditor, client);
}

export function cancelAutoRoute(): void {
  client?.cancel();
}
