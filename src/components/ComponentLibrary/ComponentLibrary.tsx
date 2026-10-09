import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MAX_BOARDS } from '../../editor/boards';
import { formatResistance, LED_COLOR_NAMES, librarySections, searchLibrary, type LibraryItem } from '../../editor/library';
import { WIRE_COLORS } from '../../editor/manualWire';
import { LED_FILL, PART, resistorBands } from '../../render/theme';
import { useStore } from '../../state/store';
import type { LedColor } from '../../types/component';

/** 元件庫項目的小圖示。 */
export function PartIcon({ item }: { item: LibraryItem }) {
  const box = { width: 34, height: 24, viewBox: '0 0 34 24' };
  switch (item.category) {
    case 'ic':
      return (
        <svg {...box} aria-hidden>
          {[5, 10, 15, 20, 25].map((x) => (
            <g key={x} fill={PART.metal}>
              <rect x={x} y={2} width={3} height={4} />
              <rect x={x} y={18} width={3} height={4} />
            </g>
          ))}
          <rect x={3} y={5} width={28} height={14} rx={2} fill={PART.icBody} />
          <path d="M3 9.5 A2.5 2.5 0 0 1 3 14.5 Z" fill="#000" />
        </svg>
      );
    case 'resistor': {
      const bands = resistorBands(item.props.resistance ?? 1000);
      return (
        <svg {...box} aria-hidden>
          <line x1={1} y1={12} x2={33} y2={12} stroke={PART.lead} strokeWidth={2} />
          <rect x={7} y={7} width={20} height={10} rx={5} fill={PART.resistorBody} stroke={PART.resistorEdge} />
          {bands.map((c, i) => (
            <rect key={i} x={[10, 13, 16, 22][i]} y={7} width={2} height={10} fill={c} />
          ))}
        </svg>
      );
    }
    case 'led': {
      const c = LED_FILL[(item.props.color ?? 'red') as LedColor];
      return (
        <svg {...box} aria-hidden>
          <line x1={13} y1={14} x2={13} y2={24} stroke={PART.lead} strokeWidth={1.5} />
          <line x1={21} y1={14} x2={21} y2={22} stroke={PART.lead} strokeWidth={1.5} />
          <path d="M 23 6 A 7 7 0 1 0 23 16 Z" fill={c.fill} stroke={c.edge} />
        </svg>
      );
    }
    case 'vcc':
    case 'gnd': {
      const vcc = item.category === 'vcc';
      return (
        <svg {...box} aria-hidden>
          <circle cx={17} cy={12} r={8} fill={vcc ? PART.vcc : PART.gnd} />
          <text x={17} y={12.5} fill="#fff" fontSize={13} fontWeight={800} textAnchor="middle" dominantBaseline="central">
            {vcc ? '+' : '−'}
          </text>
        </svg>
      );
    }
    case 'dc-power':
      return (
        <svg {...box} aria-hidden>
          <rect x={4} y={5} width={26} height={14} rx={3} fill={PART.dcBody} />
          <circle cx={11} cy={12} r={4} fill={PART.vcc} />
          <circle cx={23} cy={12} r={4} fill="#111" />
        </svg>
      );
    case 'dip-switch':
      return (
        <svg {...box} aria-hidden>
          <rect x={3} y={4} width={28} height={16} rx={2} fill={PART.switchBody} />
          {[7, 13, 19, 25].map((x) => (
            <g key={x}>
              <rect x={x - 2} y={7} width={4} height={10} rx={1} fill="#f5f5f5" />
              <rect x={x - 1.5} y={12} width={3} height={4} fill="#37474f" />
            </g>
          ))}
        </svg>
      );
    case 'clock':
      return (
        <svg {...box} aria-hidden>
          <circle cx={17} cy={12} r={9} fill={PART.clock} />
          <path d="M 11 15 h 3 v -6 h 3 v 6 h 3 v -6 h 3" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
      );
    case 'pushbutton':
      return (
        <svg {...box} aria-hidden>
          <rect x={8} y={2} width={18} height={20} rx={3} fill={PART.buttonBody} />
          <circle cx={17} cy={12} r={6} fill="#1f1f1f" />
        </svg>
      );
  }
}

/** 觸控 / 觸控筆按住元件後往旁邊移動多少 px 才算拿起來拖曳。 */
const TOUCH_PICK_DISTANCE = 8;

function startDrag(item: LibraryItem, e: ReactPointerEvent<HTMLButtonElement>) {
  if (e.button !== 0) return;
  e.preventDefault();
  const origin = { x: e.clientX, y: e.clientY };
  if (e.pointerType === 'mouse') {
    useStore.getState().startPlacing(item, true, origin);
    return;
  }
  // 觸控：先不拿起來（不收抽屜、不取消選取、不離開比較畫面）。往旁邊拖 = 拖放；放開時沒移動 = 點選放置；
  // 上下滑是捲動清單，瀏覽器接手後送 pointercancel，什麼都不改。
  const pointerId = e.pointerId;
  const finish = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  };
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    const dx = Math.abs(ev.clientX - origin.x);
    const dy = Math.abs(ev.clientY - origin.y);
    if (dx < TOUCH_PICK_DISTANCE || dx < dy) return;
    finish();
    useStore.getState().startPlacing(item, true, origin);
  };
  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    finish();
    if (Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) <= TOUCH_PICK_DISTANCE * 2) useStore.getState().startPlacing(item, false, origin);
  };
  const onCancel = (ev: PointerEvent) => {
    if (ev.pointerId === pointerId) finish();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}

const TOOLTIP = '拖曳到麵包板上放置，或點一下後再點麵包板（平板：點一下元件、再點麵包板）。';

/** 描述中括號裡的英文（例如「Quad 2-input NAND」），給小格子用。 */
function shortDescription(item: LibraryItem): string {
  if (item.category === 'resistor') return '電阻';
  if (item.category === 'led') return 'LED';
  const english = /（([^）]+)）\s*$/.exec(item.description);
  return english ? english[1] : item.description;
}

function tileLabel(item: LibraryItem): string {
  if (item.category === 'resistor') return formatResistance(item.props.resistance ?? 1000);
  if (item.category === 'led') return `${LED_COLOR_NAMES[(item.props.color ?? 'red') as LedColor]}色`;
  return item.name;
}

/** 小格子（74LS、電阻、LED）。 */
function LibraryTile({ item, active }: { item: LibraryItem; active: boolean }) {
  return (
    <button
      type="button"
      data-library-item={item.key}
      onPointerDown={(e) => startDrag(item, e)}
      style={{ touchAction: 'pan-y' }}
      title={`${item.name}：${item.description}\n${TOOLTIP}`}
      className={`flex min-w-0 cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors active:cursor-grabbing ${
        active ? 'bg-sky-900/60 ring-1 ring-sky-500' : 'bg-slate-800/40 hover:bg-slate-800'
      }`}
    >
      <span className="flex h-6 w-9 shrink-0 items-center justify-center">
        <PartIcon item={item} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium leading-4 text-slate-100">{tileLabel(item)}</span>
        <span className="block truncate text-[10px] leading-3 text-slate-400">{shortDescription(item)}</span>
      </span>
    </button>
  );
}

/** 整列（電源、輸入元件）。 */
function LibraryRow({ item, active }: { item: LibraryItem; active: boolean }) {
  return (
    <button
      type="button"
      data-library-item={item.key}
      onPointerDown={(e) => startDrag(item, e)}
      style={{ touchAction: 'pan-y' }}
      title={`${item.name}：${item.description}\n${TOOLTIP}`}
      className={`flex w-full cursor-grab items-center gap-2 rounded-md px-2 py-1 text-left transition-colors active:cursor-grabbing ${
        active ? 'bg-sky-900/60 ring-1 ring-sky-500' : 'hover:bg-slate-800'
      }`}
    >
      <span className="flex h-6 w-9 shrink-0 items-center justify-center">
        <PartIcon item={item} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-slate-100">{item.name}</span>
        <span className="block truncate text-[10px] text-slate-400">{item.description}</span>
      </span>
    </button>
  );
}

/** 麵包板：新增 MB-102（最多 MAX_BOARDS 塊）。 */
function BoardCard() {
  const count = useStore((s) => s.circuit.boards.length);
  const full = count >= MAX_BOARDS;
  return (
    <section className="mx-2 mb-2 flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/40 px-2 py-1.5">
      <svg width={34} height={24} viewBox="0 0 34 24" aria-hidden className="shrink-0">
        <rect x={1} y={3} width={32} height={18} rx={2} fill="#f3efe6" stroke="#cfc6b3" />
        <line x1={4} x2={30} y1={6} y2={6} stroke="#d32f2f" />
        <line x1={4} x2={30} y1={18} y2={18} stroke="#1e63c4" />
        <rect x={3} y={11} width={28} height={2} fill="#e3dccd" />
        {[6, 10, 14, 18, 22, 26].map((x) => (
          <g key={x} fill="#3a3936">
            <rect x={x} y={8} width={1.4} height={1.4} />
            <rect x={x} y={14.6} width={1.4} height={1.4} />
          </g>
        ))}
      </svg>
      <span className="min-w-0 flex-1" title="貼在一起且對齊的麵包板會自動成為同一個群組，可以跨板接線">
        <span className="block whitespace-nowrap text-[12px] font-medium text-slate-100">麵包板</span>
        <span className="block whitespace-nowrap text-[10px] text-slate-400">
          MB-102 · {count} / {MAX_BOARDS} 塊
        </span>
      </span>
      <button
        type="button"
        disabled={full}
        onClick={() => useStore.getState().addBoard()}
        title={full ? `最多 ${MAX_BOARDS} 塊麵包板` : '新增一塊麵包板（放在最下方，再拖曳到想要的位置）'}
        className="shrink-0 rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600 disabled:opacity-50"
      >
        ＋ 新增麵包板
      </button>
    </section>
  );
}

function JumperWireCard() {
  const wireColor = useStore((s) => s.wireColor);
  return (
    <section className="mx-2 mb-3 mt-1 rounded-md border border-slate-700 bg-slate-950/40 p-2">
      <div className="text-[13px] font-medium text-slate-100">Jumper Wire 跳線</div>
      <p className="mt-1 text-[11px] leading-4 text-slate-400">
        從一個<b className="text-slate-300">空孔</b>按住拖曳到另一個空孔。導線只走水平 / 垂直，會自動繞過元件。接 + 軌自動用紅色、接 − 軌用黑色。
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="新導線的顏色">
        {WIRE_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={wireColor === c.value}
            title={`${c.name}色`}
            onClick={() => useStore.getState().setDefaultWireColor(c.value)}
            className={`h-5 w-5 rounded-full border ${wireColor === c.value ? 'border-sky-400 ring-2 ring-sky-500' : 'border-slate-600'}`}
            style={{ background: c.value }}
          />
        ))}
      </div>
    </section>
  );
}

const GRID_SECTIONS = new Set(['ic', 'resistor', 'led']);
const SHORT_TITLES: Record<string, string> = { ic: '74LS', resistor: '電阻', led: 'LED', power: '電源', input: '輸入' };

/** 左側元件庫：分類、搜尋、拖曳放置。 */
export function ComponentLibrary() {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const sections = useMemo(() => searchLibrary(librarySections(), query), [query]);
  const placingKey = useStore((s) => s.placing?.item.key);
  const open = useStore((s) => s.drawer === 'library');
  const searching = query.trim().length > 0;
  const jump = (id: string) => {
    setCollapsed((c) => ({ ...c, [id]: false }));
    requestAnimationFrame(() => document.getElementById(`library-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  return (
    <aside
      aria-label="元件庫"
      className={`${open ? 'flex' : 'hidden'} absolute inset-y-0 left-0 z-30 w-72 max-w-[85vw] shrink-0 flex-col border-r border-slate-800 bg-slate-900 shadow-2xl lg:static lg:z-auto lg:flex lg:h-full lg:w-64 lg:shadow-none`}
    >
      <div className="border-b border-slate-800 p-3 pb-2">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">元件庫 Parts</div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋：74LS00、NAND、220Ω…"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
        {!searching && (
          <div className="mt-2 flex flex-wrap gap-1">
            {librarySections().map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => jump(sec.id)}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                {SHORT_TITLES[sec.id]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="bbl-scroll min-h-0 flex-1 overflow-y-auto py-2">
        {!searching && <BoardCard />}
        {sections.length === 0 && <p className="px-3 text-sm text-slate-400">找不到符合的元件。</p>}
        {sections.map((section) => {
          const open = searching || !collapsed[section.id];
          const grid = GRID_SECTIONS.has(section.id);
          return (
            <section key={section.id} id={`library-${section.id}`} className="mb-1 scroll-mt-1">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [section.id]: open }))}
                className="flex w-full items-center justify-between px-3 py-1 text-xs font-semibold text-slate-300 hover:text-white"
              >
                <span>
                  {open ? '▾' : '▸'} {section.title}
                </span>
                <span className="text-slate-500">{section.items.length}</span>
              </button>
              {open && (
                <div className={grid ? 'grid grid-cols-2 gap-1 px-2 pb-1' : 'space-y-0.5 px-2 pb-1'}>
                  {section.items.map((item) =>
                    grid ? (
                      <LibraryTile key={item.key} item={item} active={placingKey === item.key} />
                    ) : (
                      <LibraryRow key={item.key} item={item} active={placingKey === item.key} />
                    ),
                  )}
                </div>
              )}
            </section>
          );
        })}
        {!searching && <JumperWireCard />}
      </div>
    </aside>
  );
}
