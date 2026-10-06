import { cancelAutoRoute } from '../routing/routingService';
import { useEditor } from '../store/editorStore';

export function StatusBar({ autosaveError }: { autosaveError: string | null }) {
  const mode = useEditor((s) => s.mode);
  const job = useEditor((s) => s.routingJob);
  const analysis = useEditor((s) => s.analysis);
  let status = '就緒';
  if (mode === 'routing') status = '計算中…';
  else if (mode === 'compare') status = '比較中';
  else if (job.status === 'animating' || job.status === 'done') status = '佈線完成';
  return (
    <footer className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-300 bg-white px-3 py-1 text-sm">
      <span data-testid="status">{status}</span>
      {mode === 'routing' && (
        <button type="button" onClick={cancelAutoRoute} className="min-h-11 rounded border border-gray-300 px-3 lg:min-h-0 lg:py-0.5">
          取消
        </button>
      )}
      <span>{`導線 ${analysis.wireCount}`}</span>
      <span>{`Net ${analysis.netCount}`}</span>
      <span>{`Routing Score ${analysis.score}`}</span>
      <span className="ml-auto text-gray-500">{autosaveError ?? '已自動儲存'}</span>
    </footer>
  );
}
