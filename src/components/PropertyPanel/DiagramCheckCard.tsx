import { useMemo } from 'react';
import { checkAgainstDiagram } from '../../logic/diagramCheck';
import { verifyText } from '../../logic/verifyBreadboard';
import { useLogic } from '../../state/logic';
import { useStore } from '../../state/store';
import type { Circuit } from '../../types/circuit';

/** 最多列出幾列不一致。 */
const SHOWN = 8;
const card = 'm-3 mb-0 rounded border px-3 py-2 text-xs leading-5';

/**
 * 規格（2026-10-17 diagram-check）第 4 節：「檢查」分頁最上面，依名稱把麵包板對應到邏輯圖，逐列模擬比對真值表
 * （用目前的電路與邏輯圖即時計算；轉換來的麵包板名稱已經填好）。
 */
export function DiagramCheckCard({ circuit }: { circuit: Circuit }) {
  const diagram = useLogic((l) => l.diagram);
  const check = useMemo(() => checkAgainstDiagram(diagram, circuit), [diagram, circuit]);
  if (check.kind === 'none') return null;
  if (check.kind === 'hint') {
    return (
      <div data-testid="diagram-check" className={`${card} border-slate-700 bg-slate-900/60 text-slate-400`}>
        可以和邏輯圖比對：把開關、LED 的名稱設成邏輯圖上的名稱（例如 A、B、X）。
      </div>
    );
  }
  if (check.kind === 'incomplete') {
    return (
      <div data-testid="diagram-check" className={`${card} border-amber-700 bg-amber-950/40 text-amber-100`}>
        <div className="font-semibold">還不能和邏輯圖比對</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {check.issues.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <p className="mt-1 text-amber-200/80">點開關或 LED，在屬性面板的「名稱」輸入邏輯圖上的名稱。</p>
      </div>
    );
  }
  const { result, inputs, outputs, bindings, mapping } = check;
  const ok = result.mismatches.length === 0;
  const pair = (bits: string[]) => outputs.map((name, i) => `${name} = ${bits[i] ?? '?'}`).join('、');
  return (
    <div data-testid="diagram-check" className={`${card} ${ok ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200' : 'border-red-700 bg-red-950/50 text-red-200'}`}>
      <div className="font-semibold">和邏輯圖的真值表比對</div>
      {ok ? (
        verifyText(result, outputs)
      ) : (
        <>
          <p>
            有 {result.mismatches.length} 列不一致。點一列：把開關撥成那一列並開始模擬，直接在板上看哪裡不對。
          </p>
          <ul className="mt-1 space-y-1">
            {result.mismatches.slice(0, SHOWN).map((m) => (
              <li key={m.inputs}>
                <button
                  type="button"
                  data-mismatch-row={m.inputs}
                  className="w-full rounded bg-red-900/50 px-2 py-1 text-left hover:bg-red-800/60"
                  onClick={() => useStore.getState().applyDiagramRow(bindings.inputs, [...m.inputs].map((c) => (c === '1' ? 1 : 0)))}
                >
                  {inputs.join(' ')} = {[...m.inputs].join(' ')}：應該 {pair(m.expected)}，麵包板 {pair(m.actual)}
                </button>
              </li>
            ))}
          </ul>
          {result.mismatches.length > SHOWN && <p className="mt-1">還有 {result.mismatches.length - SHOWN} 列。</p>}
        </>
      )}
      <p className={`mt-1 ${ok ? 'text-emerald-300/70' : 'text-red-300/70'}`}>對應：{mapping}</p>
    </div>
  );
}
