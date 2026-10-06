import { extractNets } from '../../core/circuit/nets';
import type { FailureReason } from '../../types/routing';
import { useEditor } from '../store/editorStore';

const REASON_TEXT: Record<FailureReason, string> = {
  NO_FREE_HOLE: '沒有空孔',
  UNROUTABLE: '找不到路徑',
  ITERATION_LIMIT: '板子太擠',
  TIME_LIMIT: '板子太擠',
  LEGALITY_CHECK: '結果沒通過檢查',
};

const CARD = 'absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-lg border bg-white p-3 shadow-lg';

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="關閉" onClick={onClick} className="min-h-11 min-w-11 rounded text-sm hover:bg-gray-100 lg:min-h-0 lg:min-w-0 lg:px-2 lg:py-1">
      ✕
    </button>
  );
}

export function StatsCard() {
  const job = useEditor((s) => s.routingJob);
  const routing = useEditor((s) => s.doc.routing);
  if ((job.status !== 'animating' && job.status !== 'done') || !routing) return null;
  const m = routing.metrics;
  const rows: Array<[string, string]> = [
    ['Wire Count', String(m.wireCount)],
    ['Total Length', `${m.totalLength} holes`],
    ['Bends', String(m.bends)],
    ['Crossings', String(m.crossings)],
    ['Overlaps', String(m.overlaps)],
  ];
  return (
    <div role="status" className={`${CARD} w-[min(92vw,360px)] border-green-200`}>
      <div className="flex items-center justify-between gap-2">
        <strong className="text-green-700">Standard Routing Complete</strong>
        <div className="flex items-center gap-1">
          {job.status === 'animating' && (
            <button
              type="button"
              onClick={() => useEditor.getState().setRoutingJob({ status: 'done' })}
              className="min-h-11 rounded px-2 text-sm text-blue-700 hover:bg-blue-50 lg:min-h-0 lg:py-1"
            >
              略過動畫
            </button>
          )}
          <CloseButton onClick={() => useEditor.getState().setRoutingJob({ status: 'idle' })} />
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
        <dt className="font-semibold">Routing Score</dt>
        <dd className="text-right font-semibold">{routing.score}</dd>
        <dt className="text-gray-500">你的接線</dt>
        <dd className="text-right text-gray-500">{routing.beforeScore}</dd>
      </dl>
    </div>
  );
}

export function RoutingProblems() {
  const job = useEditor((s) => s.routingJob);
  const previewCount = useEditor((s) => s.previewWires.length);
  const circuit = useEditor((s) => s.doc.circuit);
  const close = () => {
    const s = useEditor.getState();
    s.setRoutingJob({ status: 'idle' });
    s.setPreviewWires([]);
  };
  if (job.status === 'error') {
    return (
      <div role="alert" className={`${CARD} w-[min(92vw,420px)] border-red-200`}>
        <div className="flex items-start justify-between gap-2">
          <strong className="text-red-700">{job.message}</strong>
          <CloseButton onClick={close} />
        </div>
      </div>
    );
  }
  if (job.status !== 'failed') return null;
  const focusNet = (netId: string) => {
    const first = extractNets(circuit).find((n) => n.id === netId)?.pins[0];
    if (first) useEditor.getState().select({ kind: 'pin', componentId: first.componentId, pinNumber: first.pinNumber });
  };
  return (
    <div role="alert" className={`${CARD} w-[min(92vw,420px)] border-red-200`}>
      <div className="flex items-start justify-between gap-2">
        <strong className="text-red-700">{job.message}</strong>
        <CloseButton onClick={close} />
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {job.failedNets.map((f) => (
          <li key={f.netId}>
            <button type="button" className="w-full text-left hover:underline" onClick={() => focusNet(f.netId)}>
              {`${f.netId}：${REASON_TEXT[f.reason]}（${f.detail}）`}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-gray-600">試著把元件分散一點，或移開擋路的元件</p>
      {previewCount > 0 && (
        <button
          type="button"
          onClick={() => useEditor.getState().setPreviewWires([])}
          className="mt-2 min-h-11 rounded border border-gray-300 px-2 text-sm hover:bg-gray-50 lg:min-h-0 lg:py-1"
        >
          關閉預覽
        </button>
      )}
    </div>
  );
}
