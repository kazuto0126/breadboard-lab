import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit, CircuitError, Net, PinRef } from '../../types/circuit';
import type { ComponentDefinition, ComponentInstance } from '../../types/component';
import { analyzeCircuit, holeLabel } from '../analysis';
import { colorName } from '../checklist';
import { formatResistance, LED_COLOR_NAMES } from '../library';
import { plainText } from './helpers';
import { explainIssue } from './index';

/** 規格 3.1：問 AI 的系統指示。 */
export const AI_SYSTEM_INSTRUCTION = [
  '你是數位邏輯實驗課的助教，幫學生理解麵包板電路（MB-102 麵包板、74LS 系列 IC、電阻、LED、電源）的錯誤。',
  '- 用繁體中文回答，白話、先講結論；一般不超過 200 字，學生要求詳細說明時才寫長。',
  '- 孔位沿用這個網站的寫法：A–J 加上編號（例如 A10、F23）；電源軌 T+、T-、B+、B- 加上編號（例如 T+10）；多塊麵包板時孔位前面有板子 ID（例如 b2:A12）。',
  '- 只根據提供的電路摘要回答，不要編造摘要裡沒有的元件、導線或孔位；摘要不足以判斷時，直接說不確定，並說要檢查什麼。',
  '- 建議修改時寫出要從哪個孔接到哪個孔。',
  '- 不要用 Markdown 語法（不要用 **、#、表格、程式碼區塊）；需要分點時用「1.」「2.」。',
  '- 和這個電路或數位邏輯無關的問題，簡短說明你只能回答這個電路的問題。',
].join('\n');

const HOLE_RULE =
  '孔位規則：編號相同的 A–E 五個孔相通（例如 A10–E10）、F–J 五個孔相通（例如 F10–J10），中間凹槽隔開；T+、T-、B+、B- 四條電源軌各自整條相通。';

const NET_KIND: Record<Net['kind'], string> = { power: '電源', ground: '地', signal: '訊號' };

function propsText(def: ComponentDefinition, instance: ComponentInstance): string {
  const p = { ...def.defaultProps, ...instance.props };
  if (def.category === 'resistor' && p.resistance !== undefined) return ` ${formatResistance(p.resistance)}`;
  if (def.category === 'led' && p.color) return ` ${LED_COLOR_NAMES[p.color]}色`;
  if (p.voltage !== undefined) return ` ${p.voltage} V`;
  if (p.frequency !== undefined) return ` ${p.frequency} Hz`;
  return '';
}

function componentLines(circuit: Circuit, instance: ComponentInstance): string[] {
  const def = getComponentDefinition(instance.defId);
  if (!def) return [`- ${instance.id} ${instance.defId}（未知元件）`];
  const pins = [...resolveFootprint(instance, def).pins]
    .sort((a, b) => a.pinNumber - b.pinNumber)
    .map((fp) => {
      const name = def.pins.find((p) => p.number === fp.pinNumber)?.name;
      const label = name && name !== String(fp.pinNumber) ? ` ${name}` : '';
      return `第 ${fp.pinNumber} 腳${label} @ ${holeLabel(circuit, fp.point)}`;
    });
  const about = def.description ? ` — ${def.description}` : '';
  return [`- ${instance.id} ${def.name}${propsText(def, instance)}${about}`, `  腳位：${pins.join('、')}`];
}

function pinRefText(circuit: Circuit, ref: PinRef): string {
  const instance = circuit.components.find((c) => c.id === ref.componentId);
  const name = instance ? getComponentDefinition(instance.defId)?.pins.find((p) => p.number === ref.pinNumber)?.name : undefined;
  return `${ref.componentId} 第 ${ref.pinNumber} 腳${name ? `（${name}）` : ''}`;
}

const listOr = (lines: string[]) => (lines.length > 0 ? lines : ['（沒有）']);

/** 規格 3.2：電路摘要（元件與每一隻腳的孔位、導線、Net）。孔位用 holeLabel，和畫面上一樣。 */
export function circuitBrief(circuit: Circuit): string {
  const analysis = analyzeCircuit(circuit);
  const components = circuit.components.flatMap((c) => componentLines(circuit, c));
  const wires = circuit.wires.map((w) => {
    const color = colorName(w.color);
    return `- ${w.id}${color === '其他' ? '' : `（${color}色）`}：${holeLabel(circuit, w.start)} → ${holeLabel(circuit, w.end)}`;
  });
  const nets = analysis.nets
    .filter((n) => n.pins.length > 1)
    .map((n) => `- ${n.name}（${NET_KIND[n.kind]}）：${n.pins.map((p) => pinRefText(circuit, p)).join('、')}`);
  const single = analysis.nets.filter((n) => n.pins.length === 1).map((n) => pinRefText(circuit, n.pins[0]));
  const section = (title: string, lines: string[]) => (lines.length > 0 ? [`${title}：`, ...lines] : [`${title}：（沒有）`]);
  return [
    '【電路摘要】',
    HOLE_RULE,
    `麵包板：${circuit.boards.map((b) => b.id).join('、')}`,
    ...section('元件', components),
    ...section('導線', wires),
    ...section('連在一起的腳（Net）', nets),
    `沒有和其他腳相連的腳：${listOr(single).join('、')}`,
  ].join('\n');
}

/** 規格 3.2：學生正在看的錯誤，以及離線解說（步驟裡的孔位換成名稱）。 */
export function issueBrief(circuit: Circuit, issue: CircuitError): string {
  const e = explainIssue(circuit, issue);
  return [
    '【學生正在看的錯誤】',
    issue.message,
    `為什麼：${e.why}`,
    '建議的改法：',
    ...e.steps.map((s, i) => `${i + 1}. ${plainText(circuit, s)}`),
  ].join('\n');
}

/** 對話的第一則訊息：電路摘要 + 錯誤 + 學生的問題；之後的追問只送問題本身。 */
export function firstMessage(circuit: Circuit, issue: CircuitError, question: string): string {
  return [circuitBrief(circuit), '', issueBrief(circuit, issue), '', '【學生的問題】', question.trim()].join('\n');
}
