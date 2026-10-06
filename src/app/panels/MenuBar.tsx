import { useEffect, useMemo, useRef, useState } from 'react';
import { exportJson, exportPng, exportSvg, importJson, newCircuit, openFromBrowser, saveAs, saveCurrent } from '../fileActions';
import { runShortcut, selectedComponentId } from '../interaction/useKeyboardShortcuts';
import { WIRE_COLORS } from '../model/colors';
import { isRoutingStale } from '../model/projectFile';
import { startAutoRoute } from '../routing/routingService';
import { useEditor } from '../store/editorStore';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+';
const BUTTON = 'flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm lg:min-h-8 lg:min-w-0';

interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  hint?: string;
}

function DropdownMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${BUTTON} hover:bg-gray-100 ${open ? 'bg-gray-100' : ''}`}
      >
        {label}
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute left-0 top-full z-40 mt-1 min-w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              title={item.hint}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="block min-h-11 w-full px-4 text-left text-sm hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent lg:min-h-0 lg:py-1.5"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WireColorPicker() {
  const wireColor = useEditor((s) => s.wireColor);
  return (
    <div role="radiogroup" aria-label="導線顏色" className="flex flex-wrap items-center">
      {WIRE_COLORS.map((c) => {
        const checked = c.hex.toLowerCase() === wireColor.toLowerCase();
        return (
          <button
            key={c.hex}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${c.name}色導線`}
            title={`${c.name}色導線`}
            onClick={() => useEditor.getState().setWireColor(c.hex)}
            className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-gray-100 lg:h-7 lg:w-7"
          >
            <span
              className={`block h-5 w-5 rounded-full border ${checked ? 'border-blue-600 ring-2 ring-blue-500 ring-offset-1' : 'border-gray-400'}`}
              style={{ backgroundColor: c.hex }}
            />
          </button>
        );
      })}
    </div>
  );
}

export interface MenuBarProps {
  partsOpen: boolean;
  infoOpen: boolean;
  onToggleParts: () => void;
  onToggleInfo: () => void;
  /** 按「電路檢查」後要讓資訊面板看得到（平板上是打開抽屜）。 */
  onShowInfo: () => void;
}

const save = () => void saveCurrent();

/** 規格第 12 節的選單列。 */
export function MenuBar({ partsOpen, infoOpen, onToggleParts, onToggleInfo, onShowInfo }: MenuBarProps) {
  const mode = useEditor((s) => s.mode);
  const doc = useEditor((s) => s.doc);
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const selection = useEditor((s) => s.selection);
  const canCompare = useMemo(() => doc.routing !== null && !isRoutingStale(doc), [doc]);
  const editing = mode === 'edit';
  const componentSelected = selectedComponentId(selection) !== null;

  const fileItems: MenuItem[] = [
    { label: '新電路', onSelect: () => void newCircuit(), disabled: !editing },
    { label: '儲存', onSelect: save, hint: `${MOD}S` },
    { label: '另存新檔', onSelect: () => void saveAs() },
    { label: '開啟', onSelect: () => void openFromBrowser(), disabled: !editing },
    { label: '匯入 JSON', onSelect: () => void importJson(), disabled: !editing },
    { label: '匯出 JSON', onSelect: exportJson },
    { label: '匯出 SVG', onSelect: exportSvg },
    { label: '匯出 PNG', onSelect: () => void exportPng() },
  ];
  const editItems: MenuItem[] = [
    { label: '復原', onSelect: () => runShortcut('undo', save), disabled: !editing || !canUndo, hint: `${MOD}Z` },
    { label: '重做', onSelect: () => runShortcut('redo', save), disabled: !editing || !canRedo, hint: `${MOD}Y` },
    { label: '旋轉', onSelect: () => runShortcut('rotate', save), disabled: !editing || !componentSelected, hint: 'R' },
    {
      label: '刪除',
      onSelect: () => runShortcut('delete', save),
      disabled: !editing || (!componentSelected && selection?.kind !== 'wire'),
      hint: 'Delete',
    },
  ];

  const toggleCompare = () => {
    const s = useEditor.getState();
    if (s.mode === 'compare') {
      s.setMode('edit');
      return;
    }
    if (s.mode !== 'edit' || !canCompare) return;
    s.setArmedPart(null);
    s.setMode('compare');
  };

  return (
    <header className="flex flex-wrap items-center gap-1 border-b border-gray-300 bg-white px-2 py-1">
      <button type="button" aria-expanded={partsOpen} onClick={onToggleParts} className={`${BUTTON} border border-gray-300 lg:hidden`}>
        元件庫
      </button>
      <span className="px-2 font-semibold">breadboard-lab</span>
      <DropdownMenu label="檔案" items={fileItems} />
      <DropdownMenu label="編輯" items={editItems} />
      <WireColorPicker />
      <button
        type="button"
        onClick={() => {
          useEditor.getState().runCheck();
          onShowInfo();
        }}
        className={`${BUTTON} border border-gray-300 hover:bg-gray-50`}
      >
        電路檢查 Check Circuit
      </button>
      <button
        type="button"
        disabled={!editing}
        onClick={() => void startAutoRoute()}
        className={`${BUTTON} bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:opacity-50`}
      >
        AI 標準佈線
      </button>
      <button
        type="button"
        aria-pressed={mode === 'compare'}
        disabled={mode !== 'compare' && (!editing || !canCompare)}
        onClick={toggleCompare}
        className={`${BUTTON} border ${mode === 'compare' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 hover:bg-gray-50'} disabled:opacity-40`}
      >
        比較
      </button>
      <button type="button" aria-expanded={infoOpen} onClick={onToggleInfo} className={`${BUTTON} ml-auto border border-gray-300 lg:hidden`}>
        資訊
      </button>
    </header>
  );
}
