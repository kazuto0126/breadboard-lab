import { holeLabel } from '../../editor/analysis';
import { explainIssue, type ExplainStep } from '../../editor/explain';
import { useStore } from '../../state/store';
import type { Circuit, CircuitError } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';

const same = (a: GridPoint, b: GridPoint) => a.boardId === b.boardId && a.x === b.x && a.y === b.y;

/** 規格第 2.1 節：為什麼錯、怎麼改（孔位可以點，畫面移過去；編號和板上的綠色圈一致）。 */
export function ExplanationCard({ circuit, issue }: { circuit: Circuit; issue: CircuitError }) {
  const e = explainIssue(circuit, issue);
  const renderStep = (s: ExplainStep) =>
    s.text.split(/(\{\d+\})/).map((part, i) => {
      const m = /^\{(\d+)\}$/.exec(part);
      const p = m ? s.holes[Number(m[1])] : undefined;
      if (!p) return <span key={i}>{part}</span>;
      const n = e.holes.findIndex((h) => same(h, p)) + 1;
      return (
        <button
          key={i}
          type="button"
          onClick={() => useStore.getState().focusPoints([p])}
          className="mx-0.5 inline-flex items-center gap-1 rounded bg-emerald-900/70 px-1.5 font-mono text-emerald-100 hover:bg-emerald-800"
          title="在麵包板上顯示這個孔"
        >
          <span className="text-[10px] text-emerald-300">{n}</span>
          {holeLabel(circuit, p)}
        </button>
      );
    });
  return (
    <div data-testid="explanation" className="mt-1 space-y-2 rounded border border-emerald-700/60 bg-slate-950/70 px-3 py-2 text-xs leading-6 text-slate-200">
      <p>
        <span className="font-semibold text-emerald-300">為什麼：</span>
        {e.why}
      </p>
      <div>
        <div className="font-semibold text-emerald-300">怎麼改：</div>
        <ol className="list-decimal space-y-1 pl-5">
          {e.steps.map((s, i) => (
            <li key={i}>{renderStep(s)}</li>
          ))}
        </ol>
      </div>
      {e.wires.length > 0 && <p className="text-slate-400">麵包板上的綠色虛線是建議的導線，照著從 1 號孔拉到 2 號孔就可以。</p>}
    </div>
  );
}
