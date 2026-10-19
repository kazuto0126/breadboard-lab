import { useEffect, useState } from 'react';
import { holeLabel, parseHoleLabel } from '../../editor/analysis';
import { NOTE_COLORS, NOTE_MAX } from '../../editor/notes';
import { useStore } from '../../state/store';
import type { Circuit, Note, NoteColor } from '../../types/circuit';
import { NOTE_FILL } from '../Breadboard/NoteLayer';

const COLOR_NAMES: Record<NoteColor, string> = { yellow: '黃', blue: '藍', green: '綠', pink: '粉紅' };
/** 選單裡「孔位…」的值（不會和元件 ID 撞名）。 */
const HOLE = '__hole__';

/** 子專案 29：輸入孔位名稱（例如 F12；多塊板時 b2:F12），按 Enter 或離開欄位就套用。 */
function HoleField({ circuit, note }: { circuit: Circuit; note: Note }) {
  const current = note.targetHole ? holeLabel(circuit, note.targetHole) : '';
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(current);
    setError(null);
  }, [current]);
  const commit = () => {
    if (draft.trim() === current) return;
    const r = parseHoleLabel(circuit, draft);
    if (!r.ok) return setError(r.error);
    setError(null);
    useStore.getState().setNoteHole(note.id, r.point);
  };
  return (
    <div className="pl-12">
      <input
        aria-label="指向的孔位"
        value={draft}
        placeholder="例如 F12"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-full rounded border border-slate-600 bg-slate-950 px-1.5 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
      />
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

/** 規格（2026-10-13 notes）第 5 節：選取便條時的屬性。 */
export function NoteInspector({ circuit, note }: { circuit: Circuit; note: Note }) {
  const store = useStore.getState();
  const [pickingHole, setPickingHole] = useState(false);
  return (
    <section className="space-y-2 border-b border-slate-800 px-3 py-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">便條 {note.id}</h3>
        <button type="button" className="rounded bg-red-900/70 px-2 py-1 text-xs text-red-100 hover:bg-red-800" onClick={() => store.deleteNote(note.id)}>
          刪除
        </button>
      </div>
      <textarea
        key={`${note.id}-${note.text}`}
        aria-label="便條文字"
        defaultValue={note.text}
        maxLength={NOTE_MAX}
        rows={4}
        onBlur={(e) => store.setNoteText(note.id, e.currentTarget.value)}
        className="w-full resize-y rounded border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-slate-400">顏色</span>
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`便條顏色：${COLOR_NAMES[c]}`}
            aria-pressed={note.color === c}
            onClick={() => store.setNoteColor(note.id, c)}
            className={`h-6 w-6 rounded-full border-2 ${note.color === c ? 'border-sky-400' : 'border-transparent'}`}
            style={{ background: NOTE_FILL[c].bg }}
          />
        ))}
      </div>
      <label className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-slate-400">指向</span>
        <select
          aria-label="便條指向"
          value={note.target ?? (note.targetHole || pickingHole ? HOLE : '')}
          onChange={(e) => {
            const v = e.target.value;
            setPickingHole(v === HOLE);
            if (v === HOLE) return;
            if (v) store.setNoteTarget(note.id, v);
            else {
              store.setNoteTarget(note.id, null);
              store.setNoteHole(note.id, null);
            }
          }}
          className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 px-1.5 py-1 text-sm text-slate-100"
        >
          <option value="">（不指向）</option>
          <option value={HOLE}>孔位…</option>
          {circuit.components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
        </select>
      </label>
      {(note.targetHole || pickingHole) && <HoleField circuit={circuit} note={note} />}
      <p className="text-xs leading-5 text-slate-400">拖曳便條可以移動，雙擊可以直接改字。便條不影響佈線、檢查與模擬。</p>
    </section>
  );
}
