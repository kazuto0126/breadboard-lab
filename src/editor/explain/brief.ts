import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit, CircuitError, Net, PinRef } from '../../types/circuit';
import type { ComponentDefinition, ComponentInstance } from '../../types/component';
import type { RoutingMetrics, RoutingResult } from '../../types/routing';
import { analyzeCircuit, holeLabel } from '../analysis';
import { colorName } from '../checklist';
import { formatResistance, LED_COLOR_NAMES } from '../library';
import { plainText } from './helpers';
import { explainIssue } from './index';
import { routingSummaryText, summarizeRouting } from './routing';
import { explainWire } from './wire';

/** 規格 5.4：問 AI 的系統指示（錯誤與導線共用）。 */
export const AI_SYSTEM_INSTRUCTION = [
  '你是數位邏輯實驗課的助教，幫學生理解麵包板電路的錯誤與接線。',
  '- 用繁體中文回答，白話、先講結論；一般不超過 200 字，學生要求詳細說明時才寫長。',
  '- 孔位沿用這個網站的寫法。MB-102 麵包板：A–J 加上編號（例如 A10、F23），電源軌 T+、T-、B+、B- 加上編號（例如 T+10）。',
  '  EIC-1106 麵包板：插孔區號-列欄（例如 1-A15、2-F30），電源軌 P1–P5 的 + / −（例如 P2+12），接線柱寫紅柱、黑柱。多塊麵包板時孔位前面有板子 ID（例如 b2:A12）。',
  '- 提到孔位或元件腳時，照摘要的寫法寫（例如 F12、U1 第 3 腳），學生可以點它在板上找到位置。',
  '- 只根據提供的電路摘要回答，不要編造摘要裡沒有的元件、導線或孔位；摘要不足以判斷時，直接說不確定，並說要檢查什麼。',
  '- 建議修改時寫出要從哪個孔接到哪個孔。',
  '- 學生問整次佈線時，先講整體（線數、交叉、搬動的 IC），再挑一兩個最繞的訊號說明為什麼。',
  '- 不要用 Markdown 語法（不要用 **、#、表格、程式碼區塊）；需要分點時用「1.」「2.」。',
  '- 和這個電路或數位邏輯無關的問題，簡短說明你只能回答這個電路的問題。',
].join('\n');

const MB102_RULE =
  '孔位規則：編號相同的 A–E 五個孔相通（例如 A10–E10）、F–J 五個孔相通（例如 F10–J10），中間凹槽隔開；T+、T-、B+、B- 四條電源軌各自整條相通。';
const EIC1106_RULE =
  'EIC-1106 孔位規則：有三個插孔區，孔名前面是區號（例如 1-A15、2-F30）；每區同一欄的 A–E 五個孔相通、F–J 五個孔相通。' +
  '電源軌 P1–P5 各有 + 與 − 兩列，每列整條相通（例如 P2+12）。上方的接線柱：紅柱 = +5 V、黑柱 = GND，黃柱、綠柱不是電源。';

/** 規格 5.4：依電路裡有的板子型號產生孔位規則。 */
export function holeRule(circuit: Circuit): string {
  const layouts = new Set(circuit.boards.map((b) => b.layoutId));
  const rules = [];
  if (layouts.has('MB102') || layouts.size === 0) rules.push(MB102_RULE);
  if (layouts.has('EIC1106')) rules.push(EIC1106_RULE);
  return rules.join('\n');
}

/** 規格 5.3：AI 標準佈線的規則（只附在自動佈線的導線問題裡）。 */
export const ROUTING_RULES = [
  '【AI 標準佈線的規則】',
  '每條線都是水平或垂直的直線，兩端插在孔上；要轉彎時停在一排相通的孔（轉接排），下一條線從同一排的另一個孔出發。',
  '轉接排只用空的五孔排或這個 Net 自己的排。每個孔最多插一條線；線不能經過元件腳、元件本體、別條線的端點，也不能和別條線重疊。',
  '優先順序：最少交叉，其次線的條數少，再其次總長度短。元件的位置不會被移動（除非學生選了「可以移動 IC」）。',
].join('\n');

/** 一段對話的主題：某個錯誤、某一條導線，或整次佈線（子專案 17）。 */
export type AiTopic = { kind: 'issue'; issue: CircuitError } | { kind: 'wire'; wireId: string } | { kind: 'routing'; result: RoutingResult };

/** 整次佈線的對話需要的佈線結果（store 的 comparison 有這兩項）。 */
export interface RoutingContext {
  beforeScore: { metrics: RoutingMetrics };
  result: RoutingResult;
}

export function sameTopic(a: AiTopic, b: AiTopic): boolean {
  if (a.kind === 'issue' && b.kind === 'issue') return a.issue === b.issue;
  if (a.kind === 'wire' && b.kind === 'wire') return a.wireId === b.wireId;
  if (a.kind === 'routing' && b.kind === 'routing') return a.result === b.result;
  return false;
}

/** 規格 5.3：學生正在看的導線（不用網路的說明），自動佈線的線另外附上佈線規則。 */
export function wireBrief(circuit: Circuit, wireId: string): string {
  const wire = circuit.wires.find((w) => w.id === wireId);
  const e = explainWire(circuit, wireId);
  if (!wire || !e) return `【學生正在看的導線】\n${wireId}（已經不在電路裡）`;
  const auto = wire.source === 'auto';
  const lines = [
    '【學生正在看的導線】',
    `${wire.id}（${auto ? 'AI 標準佈線' : '學生手動接的線'}）：${holeLabel(circuit, wire.start)} → ${holeLabel(circuit, wire.end)}`,
    e.summary,
  ];
  if (e.chain.length > 1) {
    lines.push(`這段連線共 ${e.chain.length} 條線：`);
    e.chain.forEach((x, i) => lines.push(`${i + 1}. ${x.text.replace('：', x.wireId === wireId ? '（本條）：' : '：')}`));
  } else lines.push(e.chain[0].text);
  if (e.why) lines.push(`為什麼不一條線直接接：${e.why}`);
  return auto ? [...lines, '', ROUTING_RULES].join('\n') : lines.join('\n');
}


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
    holeRule(circuit),
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

/** 規格（2026-10-13 routing-summary）第 4 節：整次佈線的說明 + 佈線規則。 */
export function routingBrief(circuit: Circuit, routing?: RoutingContext): string {
  const lines = routing ? ['【這次 AI 標準佈線】', ...routingSummaryText(summarizeRouting(circuit, routing)), ''] : [];
  return [...lines, ROUTING_RULES].join('\n');
}

/** 對話的第一則訊息：電路摘要 + 錯誤、導線或整次佈線 + 學生的問題；之後的追問只送問題本身。 */
export function firstMessage(circuit: Circuit, topic: AiTopic, question: string, routing?: RoutingContext): string {
  const about =
    topic.kind === 'issue' ? issueBrief(circuit, topic.issue) : topic.kind === 'wire' ? wireBrief(circuit, topic.wireId) : routingBrief(circuit, routing);
  return [circuitBrief(circuit), '', about, '', '【學生的問題】', question.trim()].join('\n');
}
