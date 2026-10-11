import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import logoUrl from '../../assets/logo.svg';
import { MAX_BOARDS } from '../../editor/boards';
import { EXAMPLES } from '../../editor/examples';
import { redoLabel, undoLabel } from '../../editor/history';
import { exportJson, exportPng, exportSvg, importJsonFile } from '../../state/fileActions';
import { deriveMode, isComparisonFresh, isDirty, useStore, type Mode } from '../../state/store';

type Item = { label: string; shortcut?: string; onClick: () => void; disabled?: boolean; checked?: boolean } | 'separator' | { heading: string };

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

function MenuButton({ label, items, open, onOpen, onHover }: { label: string; items: Item[]; open: boolean; onOpen: () => void; onHover: () => void }) {
  // 窄螢幕時右邊的選單會超出畫面：往左移到剛好貼齊右邊（留 8 px）。
  // 畫面太矮時（平板橫放、扣掉網址列）長的選單會超出下緣：限制高度，可以捲動。
  const menuRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!open || !el) {
      setShift(0);
      setMaxHeight(undefined);
      return;
    }
    // 關閉時 shift 已歸零，量到的是沒有位移的位置。
    const rect = el.getBoundingClientRect();
    setShift(Math.min(0, Math.max(8 - rect.left, window.innerWidth - 8 - rect.right)));
    setMaxHeight(Math.max(120, window.innerHeight - 8 - rect.top));
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={onHover}
        className={`rounded px-2.5 py-1 text-sm ${open ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
      >
        {label}
      </button>
      {open && (
        <div
          ref={menuRef}
          className="bbl-scroll absolute left-0 top-full z-50 mt-1 min-w-[250px] overflow-y-auto rounded-md border border-slate-600 bg-slate-800 py-1 shadow-2xl"
          style={{ left: shift || undefined, maxHeight }}
          role="menu"
        >
          {items.map((item, i) => {
            if (item === 'separator') return <div key={i} className="my-1 border-t border-slate-700" />;
            if ('heading' in item)
              return (
                <div key={i} className="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {item.heading}
                </div>
              );
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={item.onClick}
                className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-sm text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent"
              >
                <span>
                  {item.checked !== undefined && <span className="mr-1.5 inline-block w-3">{item.checked ? '✓' : ''}</span>}
                  {item.label}
                </span>
                {item.shortcut && <span className="text-xs text-slate-400">{item.shortcut}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const MODES: Array<[Mode, string, string]> = [
  ['manual', 'MANUAL', '手動接線模式：自己拖曳接線'],
  ['auto', 'AUTO ROUTE', '自動佈線模式：系統重新計算所有導線'],
  ['compare', 'COMPARE', '比較模式：左右對照手動接線與 AI 標準佈線'],
];

/** 頂部選單列：Logo、檔案 / 編輯 / 電路 / 自動佈線 / 檢視 / 說明、模式切換與主要按鈕。 */
export function Toolbar() {
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const history = useStore((s) => s.history);
  const projectName = useStore((s) => s.projectName);
  const dirty = useStore((s) => isDirty(s));
  const mode = useStore((s) => deriveMode(s));
  const routing = useStore((s) => s.routing !== null);
  const showCheck = useStore((s) => s.showCheck);
  const selection = useStore((s) => s.selection);
  const compareLayout = useStore((s) => s.compareLayout);
  const fresh = useStore((s) => isComparisonFresh(s));
  const comparisonOk = useStore((s) => s.comparison?.result.status === 'success');
  const hasWires = useStore((s) => s.circuit.wires.length > 0);
  const simulating = useStore((s) => s.simulation !== null);
  const boardCount = useStore((s) => s.circuit.boards.length);
  const drawer = useStore((s) => s.drawer);
  const store = useStore.getState();

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(null);
    fn();
  };
  const canEditSelection =
    selection?.kind === 'component' || selection?.kind === 'pin' || selection?.kind === 'wire' || (selection?.kind === 'board' && boardCount > 1);

  const menus: Array<[string, string, Item[]]> = [
    [
      'file',
      '檔案',
      [
        { label: '新電路 New Circuit', onClick: run(() => (dirty ? store.openDialog('confirm-new') : store.newCircuit())) },
        { label: '開啟… Load', shortcut: `${MOD}O`, onClick: run(() => store.openDialog('open')) },
        { label: '儲存 Save', shortcut: `${MOD}S`, onClick: run(() => store.saveProject()) },
        { label: '另存新檔… Save As', shortcut: `${MOD}⇧S`, onClick: run(() => store.openDialog('save-as')) },
        'separator',
        { label: '匯入 JSON… Import', onClick: run(importJsonFile) },
        { label: '匯出 JSON Export', onClick: run(exportJson) },
        { label: '匯出 PNG', onClick: run(() => void exportPng()) },
        { label: '匯出 SVG', onClick: run(exportSvg) },
        'separator',
        { heading: '範例電路' },
        ...EXAMPLES.map((ex) => ({ label: ex.name, onClick: run(() => store.loadCircuit(ex.build(), ex.name, `已載入範例「${ex.name}」：${ex.description}`)) })),
      ],
    ],
    [
      'edit',
      '編輯',
      [
        { label: `復原 Undo${undoLabel(history) ? `：${undoLabel(history)}` : ''}`, shortcut: `${MOD}Z`, onClick: run(() => store.undo()), disabled: history.past.length === 0 },
        { label: `重做 Redo${redoLabel(history) ? `：${redoLabel(history)}` : ''}`, shortcut: `${MOD}⇧Z`, onClick: run(() => store.redo()), disabled: history.future.length === 0 },
        'separator',
        { label: '旋轉 90° Rotate', shortcut: 'R', onClick: run(() => store.rotateSelection()), disabled: !(selection?.kind === 'component' || selection?.kind === 'pin') },
        { label: '刪除 Delete', shortcut: 'Del', onClick: run(() => store.deleteSelection()), disabled: !canEditSelection },
        { label: '取消選取', shortcut: 'Esc', onClick: run(() => store.select(null)), disabled: !selection },
      ],
    ],
    [
      'circuit',
      '電路',
      [
        simulating
          ? { label: '■ 停止模擬', onClick: run(() => store.stopSimulation()) }
          : { label: '▶ 開始模擬 Simulate', onClick: run(() => store.startSimulation()), disabled: routing },
        'separator',
        { label: 'Check Circuit 檢查電路', onClick: run(() => store.runCheck()) },
        { label: '在麵包板上顯示檢查標記', onClick: run(() => store.setShowCheck(!showCheck)), checked: showCheck },
        { label: '顯示所有 Nets', onClick: run(() => store.showRightTab('nets')) },
        'separator',
        { label: `＋ 新增 MB-102 麵包板（${boardCount} / ${MAX_BOARDS}）`, onClick: run(() => store.addBoard('MB102')), disabled: boardCount >= MAX_BOARDS || simulating || routing },
        { label: '＋ 新增 EIC-1106 大型麵包板', onClick: run(() => store.addBoard('EIC1106')), disabled: boardCount >= MAX_BOARDS || simulating || routing },
        'separator',
        { label: '清除所有導線', onClick: run(() => store.clearWires()), disabled: !hasWires || simulating },
      ],
    ],
    [
      'route',
      '自動佈線',
      [
        { label: 'AI 標準佈線 Auto Route', onClick: run(() => store.runAutoRoute('apply')), disabled: routing || simulating },
        { label: 'AI 佈線（可移動 IC）Auto Place & Route', onClick: run(() => store.runAutoRoute('apply', { moveIcs: true })), disabled: routing || simulating },
        { label: '比較 Compare（手動 vs AI）', onClick: run(() => store.setMode('compare')), disabled: routing || simulating },
        'separator',
        { label: '套用 AI 佈線結果', onClick: run(() => store.applyComparison()), disabled: !fresh || !comparisonOk || mode === 'auto' },
        { label: '切回手動接線', onClick: run(() => store.restoreManualWires()), disabled: !fresh || mode !== 'auto' },
      ],
    ],
    [
      'view',
      '檢視',
      [
        { label: 'Fit to Screen', shortcut: 'F', onClick: run(() => store.fitToScreen()) },
        { label: 'Reset View', shortcut: '0', onClick: run(() => store.resetView()) },
        { label: '放大 Zoom In', shortcut: '+', onClick: run(() => store.zoomBy(1.25)) },
        { label: '縮小 Zoom Out', shortcut: '-', onClick: run(() => store.zoomBy(0.8)) },
        'separator',
        { heading: 'Compare 版面' },
        { label: '上下排列', onClick: run(() => store.setCompareLayout('stacked')), checked: compareLayout === 'stacked' },
        { label: '左右排列', onClick: run(() => store.setCompareLayout('side')), checked: compareLayout === 'side' },
      ],
    ],
    [
      'help',
      '說明',
      [
        { label: '操作說明與快捷鍵', shortcut: '?', onClick: run(() => store.openDialog('help')) },
        { label: 'Gemini API 金鑰設定…', onClick: run(() => store.openDialog('ai-key')) },
      ],
    ],
  ];

  return (
    <header ref={barRef} className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-800 bg-slate-900 px-3 py-1">
      {/* 窄螢幕（< 1024 px）：左右面板收成抽屜，用這兩個按鈕開關。 */}
      <div className="flex gap-1 lg:hidden">
        {(
          [
            ['library', '元件庫'],
            ['info', '資訊'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={drawer === id}
            onClick={() => store.toggleDrawer(id)}
            className={`rounded-md border px-2.5 py-1 text-sm ${drawer === id ? 'border-sky-500 bg-sky-900/60 text-white' : 'border-slate-700 text-slate-200 hover:bg-slate-800'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mr-2 flex items-center gap-2">
        <img src={logoUrl} alt="" className="h-6 w-6" />
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-bold text-slate-50">Breadboard Lab</div>
          <div className="max-w-[180px] truncate text-[11px] text-slate-400" title={projectName ?? '未命名電路'}>
            {projectName ?? '未命名電路'}
            {dirty && <span className="text-amber-400"> •</span>}
          </div>
        </div>
      </div>
      <nav className="flex items-center">
        {menus.map(([id, label, items]) => (
          <MenuButton
            key={id}
            label={label}
            items={items}
            open={open === id}
            onOpen={() => setOpen(open === id ? null : id)}
            onHover={() => open && open !== id && setOpen(id)}
          />
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex overflow-hidden rounded-md border border-slate-700" role="radiogroup" aria-label="模式">
        {MODES.map(([id, label, title]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            title={title}
            disabled={routing || simulating}
            onClick={() => store.setMode(id)}
            className={`px-3 py-1 text-xs font-semibold tracking-wide ${mode === id ? 'bg-sky-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'} disabled:opacity-60`}
          >
            {label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => store.runCheck()} className="rounded-md border border-slate-600 px-3 py-1 text-sm text-slate-100 hover:bg-slate-800">
        ✓ Check Circuit
      </button>
      <button
        type="button"
        onClick={() => (simulating ? store.stopSimulation() : store.startSimulation())}
        disabled={routing}
        title={simulating ? '停止模擬，回到編輯' : '模擬 74LS 邏輯：撥開關、按按鈕、看 LED'}
        className={`rounded-md px-3 py-1 text-sm font-semibold shadow disabled:opacity-60 ${
          simulating ? 'bg-red-700 text-white hover:bg-red-600' : 'bg-violet-600 text-white hover:bg-violet-500'
        }`}
      >
        {simulating ? '■ 停止模擬' : '▶ 模擬'}
      </button>
      <button
        type="button"
        onClick={() => store.runAutoRoute('apply')}
        disabled={routing || simulating}
        className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-60"
      >
        ⚡ AI 標準佈線
      </button>
      <button
        type="button"
        onClick={() => store.runAutoRoute('apply', { moveIcs: true })}
        disabled={routing || simulating}
        title="AI 佈線（可移動 IC）：先幫 IC 找位置再佈線；開關、按鈕、電阻、LED 與電源不動"
        className="hidden rounded-md border border-emerald-600 px-3 py-1 text-sm font-semibold text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-60 lg:inline-block"
      >
        ⚡ 可移動 IC
      </button>
    </header>
  );
}
