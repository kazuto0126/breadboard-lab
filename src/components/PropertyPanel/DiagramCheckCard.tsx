import { useMemo } from 'react';
import { checkAgainstDiagram, checkAgainstTask, type DiagramCheck } from '../../logic/diagramCheck';
import { verifyText } from '../../logic/verifyBreadboard';
import { useLogic } from '../../state/logic';
import { useStore } from '../../state/store';
import type { Circuit } from '../../types/circuit';

/** 最多列出幾列不一致。 */
const SHOWN = 8;
const card = 'm-3 mb-0 rounded border px-3 py-2 text-xs leading-5';

/** 比對的對象不同（邏輯圖或題目），卡片上的字。 */
interface CardText {
  testId: string;
  /** 例如「邏輯圖」「題目」。 */
  against: string;
  title: string;
  /** 全部一致時的句子。 */
  okText: (check: Done) => string;
}

type Done = Extract<DiagramCheck, { kind: 'done' }>;

/** 句子裡的值：題目的不在乎寫「任意」。 */
const said = (v: string) => (v === 'X' ? '任意' : v);

function CheckCard({ check, text }: { check: DiagramCheck; text: CardText }) {
  if (check.kind === 'none') return null;
  if (check.kind === 'hint') {
    return (
      <div data-testid={text.testId} className={`${card} border-slate-700 bg-slate-900/60 text-slate-400`}>
        可以和{text.against}比對：把開關、LED 的名稱設成{text.against}上的名稱（例如 A、B、X）。
      </div>
    );
  }
  if (check.kind === 'incomplete') {
    return (
      <div data-testid={text.testId} className={`${card} border-amber-700 bg-amber-950/40 text-amber-100`}>
        <div className="font-semibold">還不能和{text.against}比對</div>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {check.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        <p className="mt-1 text-amber-200/80">點開關或 LED，在屬性面板的「名稱」輸入{text.against}上的名稱。</p>
      </div>
    );
  }
  const { result, inputs, outputs, bindings, mapping } = check;
  const ok = result.mismatches.length === 0;
  const pair = (bits: string[]) => outputs.map((name, i) => `${name} = ${said(bits[i] ?? '?')}`).join('、');
  return (
    <div data-testid={text.testId} className={`${card} ${ok ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200' : 'border-red-700 bg-red-950/50 text-red-200'}`}>
      <div className="font-semibold">{text.title}</div>
      {ok ? (
        text.okText(check)
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
                  onClick={() => useStore.getState().applyDiagramRow(bindings.inputs, [...m.inputs].map((c) => (c === '1' ? 1 : 0)), inputs)}
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

/**
 * 規格（2026-10-17 diagram-check）第 4 節：「檢查」分頁最上面，依名稱把麵包板對應到邏輯圖，逐列模擬比對真值表
 * （用目前的電路與邏輯圖即時計算；轉換來的麵包板名稱已經填好）。
 */
export function DiagramCheckCard({ circuit }: { circuit: Circuit }) {
  const diagram = useLogic((l) => l.diagram);
  const check = useMemo(() => checkAgainstDiagram(diagram, circuit), [diagram, circuit]);
  return <CheckCard check={check} text={{ testId: 'diagram-check', against: '邏輯圖', title: '和邏輯圖的真值表比對', okText: (c) => verifyText(c.result, c.outputs) }} />;
}

/** 子專案 24（規格 2026-10-17 truth-table-task 第 4 節）：依名稱把麵包板和真值表題目比對；不在乎的格子不比。 */
export function TaskCheckCard({ circuit }: { circuit: Circuit }) {
  const task = useLogic((l) => l.diagram.task);
  const check = useMemo(() => checkAgainstTask(task, circuit), [task, circuit]);
  const dontCares = task?.rows.some((r) => r.includes('X')) ?? false;
  const okText = (c: Done) => `${c.result.rows} 種輸入組合，麵包板的模擬結果和題目全部一致${dontCares ? '（不在乎的格子不比）' : ''}`;
  return <CheckCard check={check} text={{ testId: 'task-check', against: '題目', title: '和題目比對', okText }} />;
}
