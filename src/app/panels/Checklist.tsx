import { useMemo } from 'react';
import { isRoutingStale } from '../model/projectFile';
import { checklistOrder, type ChecklistRow } from '../routing/checklist';
import { useEditor } from '../store/editorStore';
import { centerViewportOn } from './focus';

export function Checklist() {
  const doc = useEditor((s) => s.doc);
  const focusWireId = useEditor((s) => s.focusWireId);
  const rows = useMemo(() => checklistOrder(doc.circuit), [doc.circuit]);
  const routing = doc.routing;
  if (!routing) return <p className="text-sm text-gray-500">執行 AI 標準佈線後，這裡會列出照著插的接線順序。</p>;
  const stale = isRoutingStale(doc);
  const done = rows.filter((r) => routing.checklist[r.wireId]).length;

  const toggleFocus = (row: ChecklistRow) => {
    const s = useEditor.getState();
    const next = s.focusWireId === row.wireId ? null : row.wireId;
    s.setFocusWire(next);
    const wire = doc.circuit.wires.find((w) => w.id === row.wireId);
    if (next && wire) centerViewportOn(wire.path[Math.floor(wire.path.length / 2)]);
  };

  return (
    <div className="space-y-2">
      {stale && (
        <p role="alert" className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          電路已修改，接線清單已失效，請重新執行 AI 標準佈線
        </p>
      )}
      <div className="flex items-center justify-between text-sm">
        <span>{`已完成 ${done} / ${rows.length}`}</span>
        <button
          type="button"
          disabled={stale}
          onClick={() => useEditor.getState().clearChecklist()}
          className="min-h-11 rounded px-2 text-blue-700 hover:bg-blue-50 disabled:opacity-40 lg:min-h-0 lg:py-1"
        >
          全部清除
        </button>
      </div>
      <ol className="space-y-1">
        {rows.map((row) => {
          const checked = routing.checklist[row.wireId] === true;
          return (
            <li
              key={row.wireId}
              className={`flex items-center gap-2 rounded-md border px-2 py-1 ${focusWireId === row.wireId ? 'border-blue-400 bg-blue-50' : 'border-transparent'}`}
            >
              <label className="flex h-11 w-11 shrink-0 items-center justify-center lg:h-auto lg:w-auto">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  aria-label={`${row.from} → ${row.to} 已插好`}
                  checked={checked}
                  disabled={stale}
                  onChange={(e) => useEditor.getState().setChecklistItem(row.wireId, e.target.checked)}
                />
              </label>
              <button type="button" onClick={() => toggleFocus(row)} className={`flex min-h-11 flex-1 items-center gap-2 text-left text-sm lg:min-h-0 ${checked ? 'opacity-50' : ''}`}>
                <span className="inline-block h-3 w-3 rounded-sm border border-gray-400" style={{ background: row.color }} />
                <span className="w-6">{row.colorName}</span>
                <span className="flex-1 font-mono">{`${row.from} → ${row.to}`}</span>
                <span className="text-gray-500">{`${row.length} 格`}</span>
                <span className="text-xs text-gray-400">{row.netId}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
