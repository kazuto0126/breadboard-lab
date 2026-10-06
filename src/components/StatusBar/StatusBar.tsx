import { useMemo } from 'react';
import { analyzeCircuit } from '../../editor/analysis';
import { deriveMode, useStore } from '../../state/store';

function Cell({ label, value, tone, onClick, testId }: { label: string; value: string | number; tone?: string; onClick?: () => void; testId?: string }) {
  const content = (
    <>
      <span className="text-slate-500">{label}</span> <span className={tone ?? 'text-slate-200'} data-testid={testId}>{value}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="border-l border-slate-800 px-3 hover:bg-slate-800">
      {content}
    </button>
  ) : (
    <span className="border-l border-slate-800 px-3">{content}</span>
  );
}

/** 底部狀態列：狀態、元件 / 導線 / Net 數量、錯誤、Routing Score、模式、縮放。 */
export function StatusBar() {
  const circuit = useStore((s) => s.circuit);
  const routing = useStore((s) => s.routing);
  const animation = useStore((s) => s.animation);
  const comparison = useStore((s) => s.comparison);
  const resultVisible = useStore((s) => s.resultVisible);
  const mode = useStore((s) => deriveMode(s));
  const scale = useStore((s) => s.viewport.scale);
  const simulating = useStore((s) => s.simulation !== null);
  const analysis = useMemo(() => analyzeCircuit(circuit), [circuit]);
  const store = useStore.getState();

  let status = 'Ready';
  let statusTone = 'text-slate-300';
  if (simulating) {
    status = '▶ 模擬中';
    statusTone = 'text-emerald-300';
  } else if (routing) {
    status = 'Routing…';
    statusTone = 'text-sky-300';
  } else if (animation) {
    status = '導線逐條出現中…';
    statusTone = 'text-sky-300';
  } else if (resultVisible && comparison) {
    status = comparison.result.message;
    statusTone = comparison.result.status === 'success' ? 'text-emerald-300' : 'text-red-300';
  }
  const problems = `${analysis.errorCount} 錯誤 · ${analysis.warningCount} 警告`;
  const nets = analysis.nets.filter((n) => n.pins.length > 1).length;
  const score = analysis.routing.score;
  return (
    <footer className="flex h-7 shrink-0 items-center border-t border-slate-800 bg-slate-900 text-xs">
      <span className={`min-w-[220px] px-3 ${statusTone}`} data-testid="status">
        {status}
      </span>
      <Cell label="元件" value={circuit.components.length} />
      <Cell label="Wires" value={circuit.wires.length} testId="wire-count" />
      <Cell label="Nets" value={nets} onClick={() => store.setRightTab('nets')} />
      <Cell
        label="Check"
        value={problems}
        tone={analysis.errorCount > 0 ? 'text-red-300' : analysis.warningCount > 0 ? 'text-amber-300' : 'text-emerald-300'}
        onClick={() => store.runCheck()}
      />
      <Cell
        label="Routing Score"
        value={circuit.wires.length > 0 ? score : '—'}
        tone={score >= 90 ? 'text-emerald-300' : score >= 70 ? 'text-amber-300' : 'text-red-300'}
        testId="routing-score"
      />
      <div className="flex-1" />
      <Cell label="模式" value={mode === 'auto' ? 'AUTO ROUTE' : mode === 'compare' ? 'COMPARE' : 'MANUAL'} testId="mode" />
      <Cell label="縮放" value={`${Math.round(scale * 100)}%`} />
    </footer>
  );
}
