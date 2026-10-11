import { pinoutLayout, type PinoutPin } from '../../editor/pinout';
import { LEVEL_COLORS } from '../../render/theme';
import { useStore } from '../../state/store';
import type { ComponentDefinition, ComponentInstance } from '../../types/component';

const CELL = 34;
const KIND_COLOR: Record<PinoutPin['kind'], string> = { power: '#f87171', ground: '#7dd3fc', nc: '#64748b', other: '#e2e8f0' };

/** 7 段顯示器的段位置小圖。 */
function SegmentMap() {
  const seg = (d: string, label: string, lx: number, ly: number) => (
    <g key={label}>
      <path d={d} stroke="#ef4444" strokeWidth={3} strokeLinecap="round" />
      <text x={lx} y={ly} fill="#e2e8f0" fontSize={9} textAnchor="middle" dominantBaseline="central">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 70 80" className="h-20 w-16 shrink-0" aria-label="段位置">
      {seg('M22 10h22', 'a', 33, 4)}
      {seg('M48 14v20', 'b', 56, 24)}
      {seg('M48 44v20', 'c', 56, 54)}
      {seg('M22 68h22', 'd', 33, 76)}
      {seg('M18 44v20', 'e', 10, 54)}
      {seg('M18 14v20', 'f', 10, 24)}
      {seg('M22 39h22', 'g', 33, 33)}
      <circle cx={56} cy={68} r={2.5} fill="#ef4444" />
      <text x={64} y={74} fill="#e2e8f0" fontSize={8} textAnchor="middle">
        dp
      </text>
    </svg>
  );
}

/** 規格 2026-10-11 new-parts 第 3 節：屬性面板最上面的腳位圖，方向和板上相同；點一隻腳就選取它。 */
export function PinoutDiagram({ instance, def, selectedPin }: { instance: ComponentInstance; def: ComponentDefinition; selectedPin: number | null }) {
  const levels = useStore((s) => s.simulation?.result.pinLevels ?? null);
  const layout = pinoutLayout(def, instance.rotation);
  if (!layout) return null;
  const n = layout.top.length;
  const width = n * CELL + 20;
  const bodyTop = 44;
  const bodyBottom = 96;
  const x = (i: number) => 10 + i * CELL + CELL / 2;
  const select = (pinNumber: number) => useStore.getState().select({ kind: 'pin', componentId: instance.id, pinNumber }, { keepTab: true });

  const pinCell = (p: PinoutPin, i: number, top: boolean) => {
    const cx = x(i);
    const stubY = top ? bodyTop - 8 : bodyBottom;
    const numY = top ? bodyTop - 14 : bodyBottom + 16;
    const nameY = top ? 10 : bodyBottom + 32;
    const level = levels?.[`${instance.id}#${p.number}`];
    const active = selectedPin === p.number;
    return (
      <g
        key={p.number}
        role="button"
        tabIndex={0}
        aria-pressed={active}
        aria-label={`第 ${p.number} 腳 ${p.name}`}
        data-testid={`pinout-pin-${p.number}`}
        onClick={() => select(p.number)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && select(p.number)}
        style={{ cursor: 'pointer' }}
      >
        <rect x={cx - CELL / 2 + 1} y={top ? 0 : bodyBottom} width={CELL - 2} height={bodyTop} rx={4} fill={active ? '#0c4a6e' : 'transparent'} stroke={active ? '#38bdf8' : 'none'} />
        <rect x={cx - 3} y={stubY} width={6} height={8} fill="#c9ccd1" />
        <text x={cx} y={numY} fill="#94a3b8" fontSize={10} textAnchor="middle" dominantBaseline="central">
          {p.number}
        </text>
        <text x={cx} y={nameY} fill={KIND_COLOR[p.kind]} fontSize={p.label.length > 4 ? 8 : 10} fontWeight={600} textAnchor="middle" dominantBaseline="central" style={p.activeLow ? { textDecoration: 'overline' } : undefined}>
          {p.label}
        </text>
        {level !== undefined && <circle cx={cx + 9} cy={numY} r={3.5} fill={LEVEL_COLORS[level]} />}
      </g>
    );
  };

  const notchX = layout.notch === 'left' ? 10 : width - 10;
  return (
    <div className="mb-2 rounded-md border border-slate-700 bg-slate-950/60 p-2" data-testid="pinout">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
        <span className="font-semibold">
          {def.name} 腳位圖 <span className="text-slate-500">· {instance.id}</span>
        </span>
        <span className="text-slate-500">缺口在{layout.notch === 'left' ? '左' : '右'}，和板上方向相同</span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${bodyBottom + 42}`} width={width} height={bodyBottom + 42} className="shrink-0">
          <rect x={10} y={bodyTop} width={width - 20} height={bodyBottom - bodyTop} rx={5} fill="#25272c" stroke="#0d0e10" />
          <path
            d={layout.notch === 'left' ? `M ${notchX} ${(bodyTop + bodyBottom) / 2 - 9} A 9 9 0 0 1 ${notchX} ${(bodyTop + bodyBottom) / 2 + 9} Z` : `M ${notchX} ${(bodyTop + bodyBottom) / 2 - 9} A 9 9 0 0 0 ${notchX} ${(bodyTop + bodyBottom) / 2 + 9} Z`}
            fill="#0d0e10"
          />
          <text x={width / 2} y={(bodyTop + bodyBottom) / 2} fill="#eceff1" fontSize={13} fontWeight={700} textAnchor="middle" dominantBaseline="central">
            {def.name}
          </text>
          {layout.top.map((p, i) => pinCell(p, i, true))}
          {layout.bottom.map((p, i) => pinCell(p, i, false))}
        </svg>
        {def.category === 'seven-seg' && <SegmentMap />}
      </div>
      <div className="mt-1 text-[11px] text-slate-500">
        <span className="text-red-400">紅</span>：VCC　<span className="text-sky-300">藍</span>：GND　名稱上有橫線＝低電位有效　點一隻腳可以在板上找到它
      </div>
    </div>
  );
}
