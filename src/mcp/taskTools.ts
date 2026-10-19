import { designFromTask, termsOfTask, usesPos, type DesignForm } from '../logic/design';
import { checkAgainstTask } from '../logic/diagramCheck';
import { taskFromExpressions } from '../logic/expression';
import { posText, sopText } from '../logic/minimize';
import {
  compareDiagramToTask,
  createTask,
  parseDisplayValues,
  parseRowList,
  rowBits,
  setColumn,
  setDisplayColumn,
  setOutputKind,
  taskFromDiagram,
  withTask,
  type TaskResult,
  type TruthTask,
} from '../logic/task';
import { isGate, type NodeKind } from '../logic/types';
import { fail, type LabFile, type ToolResult } from './tools';

/**
 * 子專案 33（規格 2026-10-19 mcp-other-tools 第 4 節）：真值表題目的 MCP 工具。
 * 題目的資料與檢查都用網頁的函式（src/logic/task.ts、design.ts、diagramCheck.ts），這裡只負責參數與回覆的文字。
 */

/** task_set 的一個輸出：一般輸出寫 1 的列與不在乎的列；7 段顯示器寫每一列的數字。 */
export interface TaskOutputArg {
  name: string;
  ones?: number[];
  dont_care?: number[];
  display?: boolean;
  values?: Array<number | 'X'>;
}

const NO_TASK = '檔案裡還沒有題目；用 task_set 寫入';
/** 最多列出幾列不一致。 */
const SHOWN = 10;
const FORM_NAMES: Record<DesignForm, string> = { sop: '積項和（AND–OR）', pos: '和積（OR–AND）', nand: '只用 NAND（NAND–NAND）', nor: '只用 NOR（NOR–NOR）' };
/** 句子裡的值：不在乎寫「任意」。 */
const said = (v: string) => (v === 'X' ? '任意' : v);

/** 照參數建立題目；每個輸出用網頁同樣的函式檢查。 */
function buildTask(inputs: string[], outputs: TaskOutputArg[]): TaskResult {
  const made = createTask(inputs, outputs.map((o) => o.name));
  if (!made.ok) return made;
  let task = made.task;
  const rowCount = task.rows.length;
  for (const [k, o] of outputs.entries()) {
    let r: TaskResult;
    if (o.display) {
      if (o.ones !== undefined || o.dont_care !== undefined) return { ok: false, reason: `${o.name} 是顯示器，用 values` };
      r = setOutputKind(task, k, true);
      if (r.ok && o.values !== undefined) {
        const values = parseDisplayValues(o.values.join(' '), rowCount);
        if (!values.ok) return { ok: false, reason: `${o.name} 的 values：${values.reason}` };
        r = setDisplayColumn(r.task, k, values.values);
      }
    } else {
      if (o.values !== undefined) return { ok: false, reason: `${o.name} 是一般輸出，用 ones / dont_care` };
      const ones = parseRowList((o.ones ?? []).join(' '), rowCount);
      if (!ones.ok) return { ok: false, reason: `${o.name} 的 ones：${ones.reason}` };
      const xs = parseRowList((o.dont_care ?? []).join(' '), rowCount);
      if (!xs.ok) return { ok: false, reason: `${o.name} 的 dont_care：${xs.reason}` };
      r = setColumn(task, k, ones.rows, xs.rows);
    }
    if (!r.ok) return { ok: false, reason: `${o.name}：${r.reason}` };
    task = r.task;
  }
  return { ok: true, task };
}

function taskSummary(task: TruthTask): string {
  const displays = task.displays && task.displays.length > 0 ? `；7 段顯示器：${task.displays.join(' ')}` : '';
  return `輸入 ${task.inputs.join(' ')}，輸出 ${task.outputs.join(' ')}（${task.inputs.length} 個輸入、${task.outputs.length} 個輸出、${task.rows.length} 列${displays}）`;
}

export function taskSet(f: LabFile, args: { inputs?: string[]; outputs?: TaskOutputArg[]; expressions?: string; from_diagram?: boolean; clear?: boolean }): ToolResult {
  const direct = args.inputs !== undefined || args.outputs !== undefined;
  const modes = [direct, args.expressions !== undefined, args.from_diagram === true, args.clear === true].filter(Boolean).length;
  if (modes > 1) return fail('inputs / outputs、expressions、from_diagram、clear 只能選一種');
  if (modes === 0) return fail('要給 inputs 與 outputs（直接寫題目）、expressions（布林式）、from_diagram: true（用邏輯圖的真值表）或 clear: true（刪除題目）');
  if (args.clear) {
    if (!f.logic.task) return { text: '檔案裡沒有題目' };
    return { text: '刪除了題目（邏輯圖不變）。', file: { ...f, logic: withTask(f.logic, undefined) } };
  }
  let made: TaskResult;
  let how: string;
  if (args.expressions !== undefined) {
    // 子專案 35：布林式（每行一個輸出），算出真值表建立題目。
    made = taskFromExpressions(args.expressions);
    how = '用布林式建立題目';
  } else if (args.from_diagram) {
    if (f.logic.nodes.length === 0) return fail('檔案裡還沒有邏輯圖；用 logic_set 寫入，或用 inputs / outputs 直接寫題目');
    made = taskFromDiagram(f.logic);
    how = '用邏輯圖的真值表建立題目';
  } else {
    if (args.inputs === undefined || args.outputs === undefined) return fail('inputs 與 outputs 要一起給');
    made = buildTask(args.inputs, args.outputs);
    how = '寫入題目';
  }
  if (!made.ok) return fail(made.reason);
  const replaced = f.logic.task ? '（取代了原本的題目）' : '';
  return { text: `${how}${replaced}：${taskSummary(made.task)}。`, file: { ...f, logic: withTask(f.logic, made.task) } };
}

/** 每一欄化簡後的布林式（顯示器一個位元一行）。 */
function expressions(task: TruthTask, form: DesignForm): string[] {
  const text = usesPos(form) ? posText : sopText;
  return termsOfTask(task, form).map((c) => `${c.label} = ${text(c.terms, task.inputs)}`);
}

export function taskShow(f: LabFile, args: { form?: 'sop' | 'pos' }): ToolResult {
  const task = f.logic.task;
  if (!task) return fail(NO_TASK);
  const form = args.form ?? 'sop';
  return {
    text: [
      `題目：${taskSummary(task)}；X 是不在乎（不比對）。`,
      `${task.inputs.join(' ')} | ${task.outputs.join(' ')}`,
      ...task.rows.map((row, r) => `${rowBits(task, r).join(' ')} | ${row.map(String).join(' ')}`),
      '',
      `化簡（${form === 'pos' ? '和積' : '積項和'}）：`,
      ...expressions(task, form),
    ].join('\n'),
  };
}

/** 不一致的列（最多 SHOWN 列）。what：拿來比的是邏輯圖或麵包板。 */
function mismatchText(task: TruthTask, list: Array<{ inputs: string; expected: string[]; actual: string[] }>, what: string): string {
  const pair = (values: string[]) => task.outputs.map((name, k) => `${name} = ${said(values[k] ?? '?')}`).join('、');
  const lines = [`有 ${list.length} 列不一致：`, ...list.slice(0, SHOWN).map((m) => `- ${task.inputs.join(' ')} = ${[...m.inputs].join(' ')}：題目 ${pair(m.expected)}，${what} ${pair(m.actual)}`)];
  if (list.length > SHOWN) lines.push(`還有 ${list.length - SHOWN} 列`);
  return lines.join('\n');
}

const issuesText = (issues: string[]) => `還不能比對：\n${issues.map((i) => `- ${i}`).join('\n')}`;
const dontCareNote = (task: TruthTask) => (task.rows.some((r) => r.includes('X')) ? '（不在乎的格子不比）' : '');

function diagramText(f: LabFile, task: TruthTask): string {
  const c = compareDiagramToTask(f.logic, task);
  if (c.kind === 'none') return '還沒有邏輯圖';
  if (c.kind === 'issues') return issuesText(c.issues);
  if (c.mismatches.length === 0) return `${c.rows} 種輸入組合，邏輯圖和題目全部一致${dontCareNote(task)}`;
  return mismatchText(task, c.mismatches, '邏輯圖');
}

function breadboardText(f: LabFile, task: TruthTask): string {
  const c = checkAgainstTask(task, f.circuit);
  if (c.kind === 'none') return '還沒有元件';
  if (c.kind === 'hint') return '還不能比對：把開關、LED、7 段顯示器的名稱設成題目上的名稱（例如 A、B、X），可以用 set_part 設定';
  if (c.kind === 'incomplete') return issuesText(c.issues);
  const result = c.result.mismatches.length === 0 ? `${c.result.rows} 種輸入組合，麵包板的模擬結果和題目全部一致${dontCareNote(task)}` : mismatchText(task, c.result.mismatches, '麵包板');
  return `${result}\n對應：${c.mapping}`;
}

export function taskToDiagram(f: LabFile, args: { form?: DesignForm }): ToolResult {
  const task = f.logic.task;
  if (!task) return fail(NO_TASK);
  const form = args.form ?? 'sop';
  const { diagram } = designFromTask(task, form);
  const count = (pred: (kind: NodeKind) => boolean) => diagram.nodes.filter((n) => pred(n.kind)).length;
  const next = { ...f, logic: diagram };
  const lines = [
    `照題目產生邏輯圖（${FORM_NAMES[form]}）：輸入 ${count((k) => k === 'INPUT')} 個、閘 ${count((k) => isGate(k))} 個、輸出 ${count((k) => k === 'OUTPUT' || k === 'DISPLAY')} 個、線 ${diagram.wires.length} 條。`,
    ...(f.logic.nodes.length > 0 ? [`取代了原本的邏輯圖（${f.logic.nodes.length} 個元件）。`] : []),
    ...expressions(task, form),
    `和題目比對：${diagramText(next, task)}`,
  ];
  return { text: lines.join('\n'), file: next };
}

export function taskCheck(f: LabFile): ToolResult {
  const task = f.logic.task;
  if (!task) return fail(NO_TASK);
  return { text: [`邏輯圖：${diagramText(f, task)}`, `麵包板：${breadboardText(f, task)}`].join('\n') };
}
