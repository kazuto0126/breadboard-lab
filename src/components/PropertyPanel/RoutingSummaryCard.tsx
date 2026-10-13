import { useMemo, useState } from 'react';
import { routingSummaryText, summarizeRouting } from '../../editor/explain/routing';
import { appliedRouting, useStore } from '../../state/store';
import type { Circuit } from '../../types/circuit';
import { AskAi } from './AskAi';

const SHOWN = 5;

/** 規格（2026-10-13 routing-summary）第 3 節：屬性分頁、沒有選取時的「這次佈線」。 */
export function RoutingSummaryCard({ circuit }: { circuit: Circuit }) {
  const comparison = useStore((s) => appliedRouting(s));
  const [all, setAll] = useState(false);
  const summary = useMemo(() => (comparison ? summarizeRouting(circuit, comparison) : null), [circuit, comparison]);
  if (!comparison || !summary) return null;
  const [headline] = routingSummaryText(summary);
  const rows: Array<[string, number, number]> = [
    ['線', summary.before.wireCount, summary.after.wireCount],
    ['總長（格）', summary.before.totalLength, summary.after.totalLength],
    ['交叉', summary.before.crossings, summary.after.crossings],
  ];
  const nets = all ? summary.nets : summary.nets.slice(0, SHOWN);
  return (
    <section id="routing-summary" data-testid="routing-summary" className="space-y-2 border-b border-slate-800 px-3 py-3 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">這次佈線</h3>
      <p className="text-slate-200">{headline.split('（')[0]}</p>
      <table className="w-full text-center text-xs">
        <thead>
          <tr className="text-slate-400">
            <th className="text-left font-normal" />
            <th className="font-normal">佈線前</th>
            <th className="font-normal">佈線後</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, before, after]) => (
            <tr key={label} className="text-slate-200">
              <td className="text-left text-slate-400">{label}</td>
              <td>{before}</td>
              <td className="font-semibold">{after}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary.moves.length > 0 && (
        <div className="text-xs text-amber-200">
          <div className="text-slate-400">搬動的 IC</div>
          {summary.moves.map((m) => (
            <div key={m.componentId}>
              {m.componentId}：{m.from} → {m.to}
            </div>
          ))}
        </div>
      )}
      {summary.failed.length > 0 && (
        <div className="space-y-1 text-xs">
          <div className="text-slate-400">接不通的訊號</div>
          {summary.failed.map((f) => (
            <div key={f.netId} className="rounded bg-red-950/60 px-2 py-1 text-red-200">
              <span className="font-semibold">{f.netId}</span>：{f.reason}
              <div className="text-red-300/80">{f.hint}</div>
            </div>
          ))}
        </div>
      )}
      {summary.nets.length > 0 && (
        <div className="text-xs">
          <div className="text-slate-400">每個訊號的線（點一下在板上標出來）</div>
          <ul className="mt-1 space-y-0.5">
            {nets.map((n) => (
              <li key={n.netId}>
                <button type="button" data-routing-net={n.netId} className="flex w-full justify-between gap-2 rounded px-1 text-left hover:bg-slate-800" onClick={() => useStore.getState().flashPoints(n.points)}>
                  <span className="text-sky-300">{n.name}</span>
                  <span className={n.wires > n.minimum ? 'text-amber-300' : 'text-slate-400'}>
                    {n.wires} 條{n.wires > n.minimum ? `（最少 ${n.minimum}）` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {summary.nets.length > SHOWN && (
            <button type="button" className="mt-1 text-sky-300 hover:underline" onClick={() => setAll(!all)}>
              {all ? '只顯示前 5 個' : `顯示全部 ${summary.nets.length} 個`}
            </button>
          )}
        </div>
      )}
      <AskAi circuit={circuit} topic={{ kind: 'routing', result: comparison.result }} />
    </section>
  );
}
