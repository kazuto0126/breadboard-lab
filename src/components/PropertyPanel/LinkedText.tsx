import { linkify } from '../../editor/aiLinks';
import { useStore } from '../../state/store';
import type { Circuit } from '../../types/circuit';

/** 規格第 2、4 節：文字裡的孔位與腳位變成按鈕，點了在板上閃一下（不改選取）。每次渲染重新辨識，串流中途的半截孔位之後會補上。 */
export function LinkedText({ circuit, text }: { circuit: Circuit; text: string }) {
  return (
    <>
      {linkify(circuit, text).map((part, i) =>
        typeof part === 'string' ? (
          <span key={i}>{part}</span>
        ) : (
          <button
            key={i}
            type="button"
            data-ai-link=""
            onClick={() => useStore.getState().flashPoints(part.points)}
            className="rounded px-0.5 text-amber-200 underline decoration-dotted underline-offset-2 hover:bg-amber-900/50"
            title="在麵包板上顯示"
          >
            {part.text}
          </button>
        ),
      )}
    </>
  );
}
