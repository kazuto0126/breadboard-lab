import { useMemo } from 'react';
import { getComponentDefinition } from '../../core/circuit/library';
import { boardFrames, toWorld, worldBounds } from '../../editor/geometry';
import { deriveMode, isComparisonFresh, useStore } from '../../state/store';
import type { Circuit, Wire } from '../../types/circuit';
import type { RoutingMetrics } from '../../types/routing';
import { BoardBackground } from '../Breadboard/BoardBackground';
import { ComponentGraphic } from '../Breadboard/ComponentGraphic';
import { WireGraphic } from '../Breadboard/WireGraphic';
import { FAILURE_NAMES } from '../common/describe';

/** 不能互動、剛好放得下整塊板的麵包板圖。 */
function StaticBoard({ circuit, wires }: { circuit: Circuit; wires: Wire[] }) {
  const frames = useMemo(() => boardFrames(circuit), [circuit]);
  const bounds = worldBounds(frames);
  if (!bounds) return null;
  const pad = 10;
  return (
    <svg
      viewBox={`${bounds.x - pad} ${bounds.y - pad} ${bounds.width + 2 * pad} ${bounds.height + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      fontFamily="Inter, 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif"
    >
      {frames.map((f) => (
        <BoardBackground key={f.id} frame={f} />
      ))}
      {circuit.components.map((c) => {
        const def = getComponentDefinition(c.defId);
        const at = toWorld(frames, { boardId: c.boardId, ...c.anchor });
        return def && at ? <ComponentGraphic key={c.id} instance={c} def={def} at={at} interactive={false} /> : null;
      })}
      {wires.map((w) => (
        <WireGraphic key={w.id} wire={w} frames={frames} interactive={false} />
      ))}
    </svg>
  );
}

function Metrics({ metrics, score, other }: { metrics: RoutingMetrics; score: number; other: { metrics: RoutingMetrics; score: number } }) {
  const items: Array<[string, number, number, boolean]> = [
    ['Wires', metrics.wireCount, other.metrics.wireCount, false],
    ['Length', metrics.totalLength, other.metrics.totalLength, true],
    ['Bends', metrics.bends, other.metrics.bends, true],
    ['Crossings', metrics.crossings, other.metrics.crossings, true],
    ['Overlaps', metrics.overlaps, other.metrics.overlaps, true],
  ];
  const scoreTone = score >= 90 ? 'text-emerald-300' : score >= 70 ? 'text-amber-300' : 'text-red-300';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {items.map(([label, value, otherValue, lowerIsBetter]) => {
        const better = lowerIsBetter && value < otherValue;
        const worse = lowerIsBetter && value > otherValue;
        return (
          <span key={label}>
            <span className="text-slate-500">{label}</span>{' '}
            <span className={`tabular-nums ${better ? 'text-emerald-300' : worse ? 'text-red-300' : 'text-slate-200'}`}>{value}</span>
          </span>
        );
      })}
      <span>
        <span className="text-slate-500">Routing Score</span> <span className={`text-base font-bold tabular-nums ${scoreTone}`}>{score}</span>
      </span>
    </div>
  );
}

/** COMPARE 模式：使用者的接線與 AI 標準佈線並排。 */
export function CompareView() {
  const circuit = useStore((s) => s.circuit);
  const comparison = useStore((s) => s.comparison);
  const fresh = useStore((s) => isComparisonFresh(s));
  const layout = useStore((s) => s.compareLayout);
  const mode = useStore((s) => deriveMode({ ...s, view: 'edit' }));
  const store = useStore.getState();
  if (!comparison) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-400">
        還沒有佈線結果。按「AI 標準佈線」或「COMPARE」開始計算。
      </div>
    );
  }
  const { result, beforeWires, beforeScore } = comparison;
  const after = { metrics: result.metrics, score: result.score };
  const ok = result.status === 'success';
  const pane = (title: string, subtitle: string, wires: Wire[], metrics: { metrics: RoutingMetrics; score: number }, other: { metrics: RoutingMetrics; score: number }, accent: string) => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-slate-700 bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div>
          <div className={`text-sm font-semibold ${accent}`}>{title}</div>
          <div className="text-[11px] text-slate-400">{subtitle}</div>
        </div>
        <Metrics metrics={metrics.metrics} score={metrics.score} other={other} />
      </div>
      <div className="min-h-0 flex-1 p-2">
        <StaticBoard circuit={circuit} wires={wires} />
      </div>
    </div>
  );
  return (
    <div className="flex h-full flex-col gap-2 bg-slate-950 p-3" data-testid="compare-view">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-slate-100">COMPARE：User Routing vs AI Standard Routing</div>
        {!fresh && <span className="rounded bg-amber-900/70 px-2 py-0.5 text-xs text-amber-200">元件已變動，這是舊的對照結果</span>}
        {!ok && <span className="rounded bg-red-900/70 px-2 py-0.5 text-xs text-red-200">{result.message}</span>}
        <div className="flex-1" />
        <button
          type="button"
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          onClick={() => store.setCompareLayout(layout === 'side' ? 'stacked' : 'side')}
          title="切換左右 / 上下排列"
        >
          {layout === 'side' ? '⇅ 上下排列' : '⇆ 左右排列'}
        </button>
        {fresh && ok && mode !== 'auto' && (
          <button type="button" className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500" onClick={() => store.applyComparison()}>
            套用 AI 佈線
          </button>
        )}
        {fresh && mode === 'auto' && (
          <button type="button" className="rounded bg-slate-700 px-3 py-1 text-xs text-slate-100 hover:bg-slate-600" onClick={() => store.restoreManualWires()}>
            切回手動接線
          </button>
        )}
        <button type="button" className="rounded bg-sky-600 px-3 py-1 text-xs text-white hover:bg-sky-500" onClick={() => store.setMode(mode === 'auto' ? 'auto' : 'manual')}>
          返回編輯
        </button>
      </div>
      {!ok && result.failedNets.length > 0 && (
        <div className="rounded border border-red-900 bg-red-950/50 px-3 py-1.5 text-xs text-red-200">
          {result.failedNets.map((f) => `${f.netId}：${FAILURE_NAMES[f.reason]}`).join('；')}（右側只顯示成功的部分）
        </div>
      )}
      <div className={`flex min-h-0 flex-1 gap-3 ${layout === 'side' ? 'flex-row' : 'flex-col'}`}>
        {pane('User Routing', '你的手動接線', beforeWires, beforeScore, after, 'text-slate-100')}
        {pane('AI Standard Routing', ok ? 'Standard Routing Complete' : 'No valid routing solution.', result.wires, after, beforeScore, 'text-emerald-300')}
      </div>
    </div>
  );
}
