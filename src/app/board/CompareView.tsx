import { useEffect, useMemo, useState } from 'react';
import { useEditor } from '../store/editorStore';
import { BoardCanvas } from './BoardCanvas';

export const SIDE_BY_SIDE_MIN_WIDTH = 1280;

export function compareLayout(width: number): 'side-by-side' | 'toggle' {
  return width >= SIDE_BY_SIDE_MIN_WIDTH ? 'side-by-side' : 'toggle';
}

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

const BUTTON = 'min-h-11 rounded-md px-3 text-sm lg:min-h-8';

/** 規格第 10 節：左「你的接線」、右「AI 標準佈線」；窄螢幕改用切換鈕。 */
export function CompareView() {
  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.compareView);
  const width = useWindowWidth();
  const mine = useMemo(() => (doc.routing ? { ...doc.circuit, wires: doc.routing.before } : null), [doc]);
  if (!mine || !doc.routing) return null;
  const mineLabel = `你的接線（Routing Score ${doc.routing.beforeScore}）`;
  const aiLabel = `AI 標準佈線（Routing Score ${doc.routing.score}）`;
  const exit = (
    <button type="button" onClick={() => useEditor.getState().setMode('edit')} className={`${BUTTON} border border-gray-300 bg-white hover:bg-gray-50`}>
      離開比較
    </button>
  );
  if (compareLayout(width) === 'side-by-side') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex justify-end border-b border-gray-200 bg-white p-2">{exit}</div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-1">
          <BoardCanvas circuit={mine} label={mineLabel} selectable={false} />
          <BoardCanvas label={aiLabel} registerAsMain />
        </div>
      </div>
    );
  }
  const toggle = (target: 'mine' | 'ai', text: string) => (
    <button
      type="button"
      aria-pressed={view === target}
      onClick={() => useEditor.getState().setCompareView(target)}
      className={`${BUTTON} ${view === target ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
    >
      {text}
    </button>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-white p-2">
        <div role="group" aria-label="比較" className="flex gap-1 rounded-md border border-gray-300 p-0.5">
          {toggle('mine', '你的接線')}
          {toggle('ai', 'AI 標準佈線')}
        </div>
        {exit}
      </div>
      <div className="min-h-0 flex-1">
        {view === 'mine' ? (
          <BoardCanvas circuit={mine} label={mineLabel} selectable={false} registerAsMain />
        ) : (
          <BoardCanvas label={aiLabel} registerAsMain />
        )}
      </div>
    </div>
  );
}
