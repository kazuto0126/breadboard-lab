import { NOTE_COLORS, NOTE_MAX } from '../../editor/notes';
import { useStore } from '../../state/store';
import type { Circuit, Note, NoteColor } from '../../types/circuit';
import { NOTE_FILL } from '../Breadboard/NoteLayer';

const COLOR_NAMES: Record<NoteColor, string> = { yellow: '黃', blue: '藍', green: '綠', pink: '粉紅' };

/** 規格（2026-10-13 notes）第 5 節：選取便條時的屬性。 */
export function NoteInspector({ circuit, note }: { circuit: Circuit; note: Note }) {
  const store = useStore.getState();
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
          value={note.target ?? ''}
          onChange={(e) => store.setNoteTarget(note.id, e.target.value || null)}
          className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 px-1.5 py-1 text-sm text-slate-100"
        >
          <option value="">（不指向元件）</option>
          {circuit.components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs leading-5 text-slate-400">拖曳便條可以移動，雙擊可以直接改字。便條不影響佈線、檢查與模擬。</p>
    </section>
  );
}
