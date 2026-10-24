import { getBoard } from '../core/breadboard/registry';
import { parseHoleName } from '../core/breadboard/naming';
import { resolveFootprint } from '../core/circuit/footprint';
import { getComponentDefinition } from '../core/circuit/library';
import { extractNets } from '../core/circuit/nets';
import { validateCircuit } from '../core/circuit/validate';
import { analyzeCircuit, holeLabel, parseHoleLabel } from '../editor/analysis';
import { addWire as addWireCommand, labelSlots, makeInstance, removeItems, setLabel, updateComponentProps } from '../editor/commands';
import { circuitBrief } from '../editor/explain/brief';
import { serializeCircuitFile } from '../editor/fileFormat';
import { linkLengthNote, makeShareLink, SITE_URL } from '../editor/shareLink';
import { plainText } from '../editor/explain/helpers';
import { explainIssue } from '../editor/explain/index';
import { nextComponentId } from '../editor/ids';
import { librarySections, LED_COLORS, searchLibrary } from '../editor/library';
import { defaultWireColor, straightProblemText, straightWireProblem } from '../editor/manualWire';
import { buildOccupancy, checkPlacementWith, type HardIssue, type SoftIssue } from '../editor/placement';
import { autoPlaceAndRoute } from '../core/icPlacement/autoPlace';
import { applyRouting } from '../core/routing/apply';
import { autoRoute as routeCircuit } from '../core/routing/autoRoute';
import { darkReasonText, whyDark } from '../core/simulation/darkDisplay';
import { compileSimulation, initialSimState, settle } from '../core/simulation/simulate';
import { routingSummaryText, summarizeRouting } from '../editor/explain/routing';
import { checkDiagram } from '../logic/check';
import { convertAndRoute, convertAndRouteParallel, type ConvertRouted, type RouteJob } from '../logic/convertRoute';
import { checkAgainstDiagram as checkByNames } from '../logic/diagramCheck';
import { isSequential, sequenceTable, sortedIo, truthTable } from '../logic/evaluate';
import { diagramFormulas } from '../logic/formula';
import { parseLogicDiagram } from '../logic/file';
import { valueOfSegments } from '../logic/sevenSeg';
import { overlaps } from '../logic/shapes';
import { switchText, type ConvertOptions } from '../logic/toBreadboard';
import { emptyDiagram, isGate, type LogicDiagram, type LogicNode } from '../logic/types';
import { verifyText } from '../logic/verifyBreadboard';
import type { LayoutId } from '../types/board';
import type { Circuit } from '../types/circuit';
import type { ComponentInstance, LedColor, Rotation } from '../types/component';
import type { GridPoint } from '../types/geometry';
import type { RoutingResult } from '../types/routing';

/**
 * 規格（2026-10-17 mcp-server）：MCP 工具的邏輯。全部是純函式（不讀寫檔、不用 Node API），
 * 伺服器（scripts/mcp-server.ts）負責讀檔、呼叫這裡、成功時寫回。
 */
export interface LabFile {
  name: string;
  circuit: Circuit;
  logic: LogicDiagram;
}

/** text：給 AI 看的回覆（繁體中文）；file：有改動時的新檔案（失敗時沒有）。 */
export interface ToolResult {
  text: string;
  file?: LabFile;
  error?: true;
}

export const fail = (text: string): ToolResult => ({ text, error: true });
const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/** 子專案 33：list_files 的一行說明（麵包板、元件數、有沒有邏輯圖與題目）。 */
export function describeLabFile(f: LabFile): string {
  const boards = f.circuit.boards.map((b) => (b.layoutId === 'EIC1106' ? 'EIC-1106' : 'MB-102'));
  const kinds = [...new Set(boards)].map((name) => {
    const n = boards.filter((b) => b === name).length;
    return n > 1 ? `${name} × ${n}` : name;
  });
  const task = f.logic.task;
  return [
    kinds.join('、') || '沒有麵包板',
    `元件 ${f.circuit.components.length} 個`,
    f.logic.nodes.length > 0 ? '有邏輯圖' : '沒有邏輯圖',
    task ? `有題目（${task.inputs.join(' ')} → ${task.outputs.join(' ')}）` : '沒有題目',
  ].join('，');
}

export function newLabFile(name: string, layout: LayoutId): LabFile {
  return { name, circuit: { version: 1, boards: [{ id: 'b1', layoutId: layout, x: 0, y: 0, groupId: null }], components: [], wires: [] }, logic: emptyDiagram() };
}

/** 孔位名稱 → 格點。有好幾塊板時一定要寫板子 ID（b2:F10）。 */
export function parseHole(circuit: Circuit, raw: string): { ok: true; point: GridPoint } | { ok: false; error: string } {
  return parseHoleLabel(circuit, raw);
}

/** 「第 1 腳 1A @ F10、第 2 腳 1B @ F11…」 */
function pinsText(circuit: Circuit, instance: ComponentInstance): string {
  const def = getComponentDefinition(instance.defId)!;
  return [...resolveFootprint(instance, def).pins]
    .sort((a, b) => a.pinNumber - b.pinNumber)
    .map((fp) => {
      const name = def.pins.find((p) => p.number === fp.pinNumber)?.name;
      return `第 ${fp.pinNumber} 腳${name && name !== String(fp.pinNumber) ? ` ${name}` : ''} @ ${holeLabel(circuit, fp.point)}`;
    })
    .join('、');
}

// ---------- 讀取與檢查 ----------

/** 子專案 43（規格 2026-10-24 share-link）：電路檔做成連結，使用者點開就在網頁上看到（不用匯入）。 */
export async function shareLink(f: LabFile): Promise<ToolResult> {
  const link = await makeShareLink(SITE_URL, serializeCircuitFile(f.circuit, f.name, undefined, f.logic));
  return { text: [`把這個連結給使用者，點開就在網頁上看到這個電路（麵包板、邏輯圖、題目）：`, link, linkLengthNote(link)].join('\n') };
}

export function circuitSummary(f: LabFile): ToolResult {
  return { text: circuitBrief(f.circuit) };
}

const SEVERITY = { error: '錯誤', warning: '警告' } as const;
const MAX_ISSUES = 15;

export function checkCircuit(f: LabFile): ToolResult {
  if (f.circuit.components.length === 0) return { text: '電路裡沒有元件。用 place_part 放元件。' };
  const issues = validateCircuit(f.circuit).filter((e) => e.severity === 'error' || e.severity === 'warning');
  if (issues.length === 0) return { text: '沒有發現問題（Circuit Valid）。' };
  const errors = issues.filter((e) => e.severity === 'error').length;
  const lines = [`錯誤 ${errors} 個、警告 ${issues.length - errors} 個。`];
  issues.slice(0, MAX_ISSUES).forEach((issue, i) => {
    const e = explainIssue(f.circuit, issue);
    lines.push(`${i + 1}. [${SEVERITY[issue.severity as 'error' | 'warning']}] ${issue.message.replace(/^⚠\s*/, '')}`);
    lines.push(`   為什麼：${e.why}`);
    if (e.steps.length > 0) lines.push(`   建議：${e.steps.map((s) => plainText(f.circuit, s)).join('；')}`);
  });
  if (issues.length > MAX_ISSUES) lines.push(`…還有 ${issues.length - MAX_ISSUES} 個。`);
  return { text: lines.join('\n') };
}

const MAX_PIN_LISTS = 6;

export function listParts(args: { query?: string }): ToolResult {
  const query = args.query?.trim() ?? '';
  const sections = query ? searchLibrary(librarySections(), query) : librarySections();
  const items = sections.flatMap((s) => s.items);
  if (items.length === 0) return fail(`找不到符合「${query}」的元件`);
  const withPins = items.length <= MAX_PIN_LISTS;
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(`${section.title}：`);
    for (const item of section.items) {
      lines.push(`- ${item.key}：${item.description}`);
      if (withPins) {
        const def = getComponentDefinition(item.defId)!;
        lines.push(`  腳位：${def.pins.map((p) => `${p.number} ${p.name}`).join('、')}`);
      }
    }
  }
  if (!withPins) lines.push('（用 query 縮小範圍，結果在 6 個以內時會列出腳位）');
  return { text: lines.join('\n') };
}

// ---------- 編輯 ----------

const HARD_TEXT: Record<HardIssue, string> = {
  NO_BOARD: '沒有這塊麵包板',
  OUT_OF_BOARD: '有腳超出麵包板',
  OFF_HOLE: '有腳沒有插在孔上（例如落在中間的凹槽或板邊）',
  PIN_OCCUPIED: '有腳的孔已經被別的元件或導線佔用',
  BODY_OVERLAP: '元件本體壓到別的元件或導線的端點',
  SPAN_TOO_SMALL: '兩腳的距離太小',
};
const SOFT_TEXT: Record<SoftIssue, string> = {
  PINS_SHORTED: '有兩隻腳插在同一條導通排上（等於被短路）',
  ON_WIRE: '元件壓在導線經過的孔上',
};

/** 自動找位置時從哪裡開始找：MB-102 的 F32（IC 跨過凹槽），EIC-1106 的 1-F32；都沒有就從板子中間。 */
function preferredPoint(circuit: Circuit): GridPoint {
  for (const name of ['F32', '1-F32']) {
    const r = parseHole(circuit, name);
    if (r.ok) return r.point;
  }
  return { boardId: circuit.boards[0].id, x: 32, y: 10 };
}

/** 從偏好的位置由近到遠找第一個沒有問題的位置；找不到就接受只有軟性問題的位置。 */
function autoPlace(circuit: Circuit, instance: ComponentInstance): ComponentInstance | null {
  const def = getComponentDefinition(instance.defId)!;
  const start = preferredPoint(circuit);
  let fallback: ComponentInstance | null = null;
  for (const b of circuit.boards) {
    const occ = buildOccupancy(circuit, b.id);
    const holes = getBoard(b.layoutId, b.id)
      .nodes.filter((n) => n.kind === 'hole')
      .sort((p, q) => Math.hypot(p.x - start.x, p.y - start.y) - Math.hypot(q.x - start.x, q.y - start.y));
    for (const n of holes) {
      const candidate: ComponentInstance = { ...instance, boardId: b.id, anchor: { x: n.x, y: n.y } };
      const check = checkPlacementWith(occ, candidate, def);
      if (check.clean) return candidate;
      if (check.ok && !fallback) fallback = candidate;
    }
  }
  return fallback;
}

export function placePart(f: LabFile, args: { part: string; hole?: string; rotation?: number; id?: string }): ToolResult {
  const item = librarySections()
    .flatMap((s) => s.items)
    .find((i) => i.key === args.part);
  if (!item) return fail(`沒有元件 ${args.part}；用 list_parts 查元件名稱`);
  const def = getComponentDefinition(item.defId)!;
  const rotation = (args.rotation ?? 0) as Rotation;
  if (!ROTATIONS.includes(rotation)) return fail('rotation 只能是 0、90、180、270');
  if (args.id !== undefined && f.circuit.components.some((c) => c.id === args.id)) return fail(`ID ${args.id} 已經有元件了`);
  const id = args.id ?? nextComponentId(f.circuit, def.category);
  const spec = { defId: item.defId, rotation, props: item.props, ...(item.span !== undefined ? { span: item.span } : {}) };

  let instance: ComponentInstance;
  let warning = '';
  if (args.hole) {
    const hole = parseHole(f.circuit, args.hole);
    if (!hole.ok) return fail(hole.error);
    instance = makeInstance(spec, id, hole.point.boardId, hole.point);
    const check = checkPlacementWith(buildOccupancy(f.circuit, hole.point.boardId), instance, def);
    if (!check.ok) {
      const tip = def.package.type === 'dip' ? '（IC 要跨過中間的凹槽：第 1 腳放在 F 列，例如 F10）' : '';
      return fail(`${args.part} 不能放在 ${args.hole}：${check.hard.map((h) => HARD_TEXT[h]).join('；')}${tip}`);
    }
    if (check.soft.length > 0) warning = `\n注意：${check.soft.map((s) => SOFT_TEXT[s]).join('；')}。`;
  } else {
    const found = autoPlace(f.circuit, makeInstance(spec, id, f.circuit.boards[0].id, { x: 1, y: 1 }));
    if (!found) return fail(`麵包板上找不到可以放 ${args.part} 的位置`);
    instance = found;
  }
  const circuit = { ...f.circuit, components: [...f.circuit.components, instance] };
  return { text: `放好 ${id}（${def.name}）：${pinsText(circuit, instance)}${warning}`, file: { ...f, circuit } };
}

export function addWire(f: LabFile, args: { from: string; to: string; color?: string }): ToolResult {
  const a = parseHole(f.circuit, args.from);
  if (!a.ok) return fail(a.error);
  const b = parseHole(f.circuit, args.to);
  if (!b.ok) return fail(b.error);
  const problem = straightWireProblem(f.circuit, a.point, b.point);
  if (problem) return fail(`不能接 ${args.from} → ${args.to}：${straightProblemText(f.circuit, problem)}`);
  const { circuit, id } = addWireCommand(f.circuit, a.point, b.point, args.color ?? defaultWireColor(f.circuit, a.point, b.point));
  return { text: `接好 ${id}：${holeLabel(circuit, a.point)} → ${holeLabel(circuit, b.point)}`, file: { ...f, circuit } };
}

export function setPart(f: LabFile, args: { id: string; labels?: string[]; resistance?: number; color?: string; switches?: boolean[] }): ToolResult {
  const instance = f.circuit.components.find((c) => c.id === args.id);
  if (!instance) return fail(`沒有元件 ${args.id}`);
  const def = getComponentDefinition(instance.defId)!;
  let circuit = f.circuit;
  const done: string[] = [];
  if (args.labels) {
    const slots = labelSlots(instance);
    if (slots === 0) return fail(`${args.id} 不能設名稱（只有指撥開關、LED、7 段顯示器可以）`);
    if (args.labels.length > slots) return fail(`${args.id} 最多 ${slots} 個名稱`);
    args.labels.forEach((text, k) => (circuit = setLabel(circuit, args.id, k, text)));
    done.push(`名稱 ${args.labels.map((l) => l || '（空）').join('、')}`);
  }
  if (args.resistance !== undefined) {
    if (def.category !== 'resistor') return fail(`${args.id} 不是電阻，不能設電阻值`);
    if (!(args.resistance > 0)) return fail('電阻值要大於 0（單位 Ω）');
    circuit = updateComponentProps(circuit, args.id, { resistance: args.resistance });
    done.push(`電阻 ${args.resistance} Ω`);
  }
  if (args.color !== undefined) {
    if (def.category !== 'led') return fail(`${args.id} 不是 LED，不能設顏色`);
    if (!LED_COLORS.includes(args.color as LedColor)) return fail(`LED 顏色只能是 ${LED_COLORS.join('、')}`);
    circuit = updateComponentProps(circuit, args.id, { color: args.color as LedColor });
    done.push(`顏色 ${args.color}`);
  }
  if (args.switches !== undefined) {
    if (def.category !== 'dip-switch') return fail(`${args.id} 不是指撥開關`);
    const n = def.pins.length / 2;
    if (args.switches.length !== n) return fail(`${args.id} 有 ${n} 個開關，switches 要給 ${n} 個`);
    circuit = updateComponentProps(circuit, args.id, { switchStates: [...args.switches] });
    done.push(`開關 ${args.switches.map((on) => (on ? 'ON' : 'OFF')).join(' ')}`);
  }
  if (done.length === 0) return fail('沒有要改的東西（labels、resistance、color、switches 至少給一個）');
  return { text: `${args.id}：${done.join('；')}`, file: { ...f, circuit } };
}

export function remove(f: LabFile, args: { id: string }): ToolResult {
  if (f.circuit.components.some((c) => c.id === args.id)) {
    return { text: `刪除了元件 ${args.id}`, file: { ...f, circuit: removeItems(f.circuit, { componentIds: [args.id] }) } };
  }
  if (f.circuit.wires.some((w) => w.id === args.id)) {
    return { text: `刪除了導線 ${args.id}`, file: { ...f, circuit: removeItems(f.circuit, { wireIds: [args.id] }) } };
  }
  return fail(`沒有元件或導線 ${args.id}`);
}

// ---------- 計算：佈線、模擬 ----------

export function autoRoute(f: LabFile, args: { move_ics?: boolean; apply?: boolean }): ToolResult {
  const result = args.move_ics ? autoPlaceAndRoute(f.circuit) : routeCircuit(f.circuit);
  const ok = result.status === 'success';
  const after = ok ? applyRouting(f.circuit, result) : f.circuit;
  const lines = routingSummaryText(summarizeRouting(after, { beforeScore: analyzeCircuit(f.circuit).routing, result }));
  if (!ok) return { text: [...lines, '電路沒有被修改。'].join('\n') };
  if (args.apply === false) return { text: [...lines, '（apply = false：沒有寫回檔案）'].join('\n') };
  return { text: lines.join('\n'), file: { ...f, circuit: after } };
}

export function simulate(f: LabFile, args: { switches?: Record<string, boolean[]>; pressed?: string[] }): ToolResult {
  let circuit = f.circuit;
  for (const [id, states] of Object.entries(args.switches ?? {})) {
    const instance = circuit.components.find((c) => c.id === id);
    const def = instance && getComponentDefinition(instance.defId);
    if (!instance || def?.category !== 'dip-switch') return fail(`沒有指撥開關 ${id}`);
    const n = def.pins.length / 2;
    if (states.length !== n) return fail(`${id} 有 ${n} 個開關，要給 ${n} 個`);
    circuit = updateComponentProps(circuit, id, { switchStates: [...states] });
  }
  for (const id of args.pressed ?? []) {
    if (!circuit.components.some((c) => c.id === id && getComponentDefinition(c.defId)?.category === 'pushbutton')) return fail(`沒有按鈕 ${id}`);
  }
  const sim = compileSimulation(circuit);
  const pressed = Object.fromEntries((args.pressed ?? []).map((id) => [id, true]));
  const r = settle(sim, initialSimState(sim), { pressed, clocks: {} }).result;
  const lines: string[] = [];
  const leds = sim.leds.map((l) => l.componentId);
  if (leds.length === 0) lines.push('電路裡沒有 LED。');
  else if (r.litLeds.length === 0) lines.push(`沒有 LED 亮（${leds.join('、')} 不亮）。`);
  else {
    const dark = leds.filter((id) => !r.litLeds.includes(id));
    lines.push(`亮的 LED：${r.litLeds.join('、')}${dark.length > 0 ? `；不亮：${dark.join('、')}` : ''}。`);
  }
  for (const d of sim.displays) {
    const lit = r.litSegments[d.componentId] ?? [];
    const v = valueOfSegments(lit);
    if (lit.length === 0) {
      const why = whyDark(sim, r, d.componentId);
      lines.push(why ? `${d.componentId} 全暗：${darkReasonText(why)}` : `${d.componentId} 不亮。`);
    } else lines.push(v !== null ? `${d.componentId} 顯示 ${v}。` : `${d.componentId} 亮的段：${[...lit].sort().join('')}。`);
  }
  if (r.unpowered.length > 0) lines.push(`沒有供電：${r.unpowered.join('、')}（VCC / GND 沒接好，不會運作）。`);
  if (r.conflicts.length > 0) lines.push(`有輸出互相衝突的地方（${r.conflicts.length} 處），用 check_circuit 看是哪裡。`);
  if (!r.stable) lines.push('電路沒有穩定下來（可能在震盪）。');
  if (sim.clocks.length > 0) lines.push('時脈固定在 0（這個工具只看某一個瞬間）。');
  return { text: lines.join('\n') };
}

// ---------- 邏輯圖 ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const COLUMN = 10;

/** 規格第 4 節：沒有 x、y 的節點依拓撲深度分欄，同一欄由上往下排；和別的節點重疊時往下找空位。 */
function layoutMissing(raw: Obj): Obj {
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.wires)) return raw;
  const nodes = raw.nodes.filter(isObj);
  const wires = raw.wires.filter(isObj);
  const kind = new Map(nodes.map((n) => [String(n.id), String(n.kind)]));
  const drivers = (id: string) => wires.filter((w) => isObj(w.to) && w.to.node === id).map((w) => String(w.from));
  const memo = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    const k = kind.get(id);
    if (k === 'INPUT' || k === 'HIGH' || k === 'LOW' || k === 'CLOCK') return 0;
    if (seen.has(id)) return 1;
    seen.add(id);
    const d = 1 + Math.max(0, ...drivers(id).map((from) => depthOf(from, seen)));
    memo.set(id, d);
    return d;
  };
  const isSinkKind = (k: string) => k === 'OUTPUT' || k === 'DISPLAY';
  const inner = nodes.filter((n) => !isSinkKind(String(n.kind))).map((n) => depthOf(String(n.id), new Set()));
  const sinkDepth = Math.max(0, ...inner) + 1;
  const asNode = (n: Obj, x: number, y: number): LogicNode => ({
    id: String(n.id),
    kind: n.kind as LogicNode['kind'],
    x,
    y,
    inputs: typeof n.inputs === 'number' ? n.inputs : n.kind === 'NOT' ? 1 : 2,
    ...(typeof n.chip === 'string' ? { chip: n.chip as LogicNode['chip'] } : {}),
    ...(n.segments === true ? { segments: true as const } : {}),
  });
  const hasPos = (n: Obj) => Number.isInteger(n.x) && Number.isInteger(n.y);
  const placed: LogicNode[] = nodes.filter(hasPos).map((n) => asNode(n, n.x as number, n.y as number));
  const out = nodes.map((n) => {
    if (hasPos(n)) return n;
    const depth = isSinkKind(String(n.kind)) ? sinkDepth : depthOf(String(n.id), new Set());
    const x = 2 + depth * COLUMN;
    let y = 0;
    while (placed.some((p) => overlaps(p, asNode(n, x, y)))) y++;
    placed.push(asNode(n, x, y));
    return { ...n, x, y };
  });
  return { ...raw, nodes: out };
}

export function logicSet(f: LabFile, args: { diagram: unknown }): ToolResult {
  if (!isObj(args.diagram)) return fail('邏輯圖有問題：diagram 要是物件（version、nodes、wires）');
  const parsed = parseLogicDiagram(layoutMissing({ version: 1, ...args.diagram }));
  if (!parsed.ok) return fail(`邏輯圖有問題：${parsed.error}`);
  // 子專案 24：新的邏輯圖沒有題目時，保留檔案裡原本的真值表題目。
  const kept = !parsed.diagram.task && f.logic.task ? f.logic.task : undefined;
  const d = kept ? { ...parsed.diagram, task: kept } : parsed.diagram;
  const count = (pred: (n: LogicNode) => boolean) => d.nodes.filter(pred).length;
  const blocks = count((n) => n.kind === 'BLOCK');
  const sinks = count((n) => n.kind === 'OUTPUT' || n.kind === 'DISPLAY');
  const lines = [
    `寫入邏輯圖：輸入 ${count((n) => n.kind === 'INPUT')} 個、閘 ${count((n) => isGate(n.kind))} 個${blocks > 0 ? `、IC 方塊 ${blocks} 個` : ''}、輸出 ${sinks} 個、線 ${d.wires.length} 條。`,
  ];
  const issues = checkDiagram(d);
  lines.push(issues.length === 0 ? '檢查：沒有發現問題。' : `檢查：\n${issues.map((i) => `- ${i.message}`).join('\n')}`);
  if (kept) lines.push('保留檔案裡的真值表題目。');
  return { text: lines.join('\n'), file: { ...f, logic: d } };
}

const NO_LOGIC = '檔案裡還沒有邏輯圖；用 logic_set 寫入';

export function logicTruthTable(f: LabFile, args: { pulses?: number } = {}): ToolResult {
  if (f.logic.nodes.length === 0) return fail(NO_LOGIC);
  // 子專案 46：時序電路回傳時序表。
  if (isSequential(f.logic)) return sequenceReply(f.logic, args.pulses ?? 16);
  const t = truthTable(f.logic);
  if (!t.ok) {
    if (t.reason === 'loop') return { text: `邏輯圖有迴圈（${(t.loop ?? []).join('、')}），算不出真值表。` };
    if (t.reason === 'too-many') return { text: '輸入超過 8 個，真值表太長，不列出。' };
    return { text: '邏輯圖沒有輸入端和輸出端。' };
  }
  const cell = (v: string | number) => (v === 'X' ? '?' : String(v));
  const lines = [`${t.inputs.join(' ')} | ${t.outputs.join(' ')}`, ...t.rows.map((r) => `${r.in.join(' ')} | ${r.out.map(cell).join(' ')}`)];
  // 子專案 40：每個輸出照圖寫出來與化簡後的布林式（和網頁真值表分頁一樣）。
  const formulas = diagramFormulas(f.logic).outputs;
  if (formulas.length > 0) {
    lines.push('', '布林式：');
    for (const o of formulas) {
      lines.push(o.read === null ? `- ${o.name}：${o.readProblem}` : `- ${o.name} = ${o.read}（照圖寫出來）`);
      lines.push(o.simplified === null ? `  化簡：${o.simplifiedProblem}` : `  化簡：${o.name} = ${o.simplified}`);
    }
  }
  const issues = checkDiagram(f.logic);
  if (issues.length > 0) lines.push('', '檢查：', ...issues.map((i) => `- ${i.message}`));
  return { text: lines.join('\n') };
}

/** 子專案 46（規格 2026-10-24 sequential-logic 第 6 節）：時序表的文字（從重設開始，其他輸入用檔案裡開關的值）。 */
function sequenceReply(d: LogicDiagram, pulses: number): ToolResult {
  const t = sequenceTable(d, Math.max(1, Math.min(64, Math.floor(pulses))));
  if (!t.ok) {
    if (t.reason === 'loop') return { text: `邏輯圖有迴圈（${(t.loop ?? []).join('、')}）：閘的輸出不能再接回前面（要經過正反器或計數器）。` };
    if (t.reason === 'no-clock') return { text: '這是時序電路（有正反器或計數器），但沒有時脈：加一個 kind 為 CLOCK 的節點，接到 CLK 腳。' };
    return { text: '邏輯圖沒有輸出端或 7 段顯示器。' };
  }
  const cell = (v: string | number) => (v === 'X' ? '?' : String(v));
  const inputs = sortedIo(d).inputs;
  const lines = [
    `時序表（從重設開始：正反器、計數器都是 0；${inputs.length > 0 ? `其他輸入：${inputs.map((n) => `${n.name} = ${n.value ?? 0}`).join('、')}` : '沒有其他輸入'}）：`,
    `${t.clock} 第幾次 | ${t.outputs.join(' ')}`,
    ...t.rows.map((r) => `${r.pulse} | ${r.out.map(cell).join(' ')}`),
  ];
  const issues = checkDiagram(d);
  if (issues.length > 0) lines.push('', '檢查：', ...issues.map((i) => `- ${i.message}`));
  return { text: lines.join('\n') };
}

/** 依名稱比對的白話結果（check_against_diagram、logic_to_breadboard 共用）。 */
function diagramCheckText(d: LogicDiagram, circuit: Circuit): string {
  const c = checkByNames(d, circuit);
  if (c.kind === 'none') return '不能比對：邏輯圖算不出真值表（要有輸入端和輸出端），或麵包板上沒有元件。';
  if (c.kind === 'hint') return '還不能比對：把開關、LED 的名稱設成邏輯圖上的名稱（例如 A、B、X），可以用 set_part 設定。';
  if (c.kind === 'incomplete') return `還不能和邏輯圖比對：\n${c.issues.map((i) => `- ${i}`).join('\n')}`;
  const pair = (bits: string[]) => c.outputs.map((name, i) => `${name} = ${bits[i] ?? '?'}`).join('、');
  const row = (inputs: string) => `${c.inputs.join(' ')} = ${[...inputs].join(' ')}`;
  const lines =
    c.result.mismatches.length === 0
      ? [verifyText(c.result, c.outputs)]
      : [`有 ${c.result.mismatches.length} 列不一致：`, ...c.result.mismatches.map((m) => `- ${row(m.inputs)}：應該 ${pair(m.expected)}，麵包板 ${pair(m.actual)}`)];
  return [...lines, `對應：${c.mapping}`].join('\n');
}

export function checkAgainstDiagram(f: LabFile): ToolResult {
  if (f.logic.nodes.length === 0) return fail(NO_LOGIC);
  return { text: diagramCheckText(f.logic, f.circuit) };
}

export type LogicToBreadboardArgs = {
  switch_to?: 'vcc' | 'gnd';
  board?: 'auto' | LayoutId;
  gates?: 'direct' | 'nand' | 'nor';
  pulls?: boolean;
  inputs?: 'switch' | 'button';
  display?: 'ca' | 'cc';
  /** 子專案 44：7 段顯示器每段一顆電阻或共用一顆（沒給時 1 個顯示器每段一顆、2 個共用一顆）。 */
  display_resistors?: 'each' | 'shared';
};

const convertOptionsOf = (args: LogicToBreadboardArgs): ConvertOptions & { display: 'ca' | 'cc' } =>
  ({ switchTo: args.switch_to ?? 'vcc', board: args.board ?? 'auto', gates: args.gates ?? 'direct', pulls: args.pulls ?? false, inputs: args.inputs ?? 'switch', display: args.display ?? 'ca', ...(args.display_resistors ? { displayResistors: args.display_resistors } : {}) }) as const;

export function logicToBreadboard(f: LabFile, args: LogicToBreadboardArgs): ToolResult {
  if (f.logic.nodes.length === 0) return fail(NO_LOGIC);
  const options = convertOptionsOf(args);
  // 子專案 36：和網頁一樣，試好幾種擺法挑佈線最好的（自動選板時 MB-102 都排不完才用 EIC-1106）；電源接最近的軌（子專案 34）。
  const converted = convertAndRoute(f.logic, options);
  if (!converted.ok) return fail(converted.reason);
  return convertedReply(f, options, converted);
}

/** 子專案 42：同樣的轉換，佈線交給 routeMany（MCP 伺服器用好幾個執行緒同時跑）。 */
export async function logicToBreadboardParallel(f: LabFile, args: LogicToBreadboardArgs, routeMany: (jobs: RouteJob[]) => Promise<RoutingResult[]>, parallel: number): Promise<ToolResult> {
  if (f.logic.nodes.length === 0) return fail(NO_LOGIC);
  const options = convertOptionsOf(args);
  const converted = await convertAndRouteParallel(f.logic, options, routeMany, parallel);
  if (!converted.ok) return fail(converted.reason);
  return convertedReply(f, options, converted);
}

/**
 * logic_to_breadboard 的回覆與要寫入的檔案（測試時可以給假的佈線結果）。
 * 子專案 39（規格 2026-10-20 wiring-rules）：佈線沒有完成時不寫入檔案：預定的連線是元件腳之間的直線，常常是斜的、會交叉，
 * 不符合接線規則；改成說明哪幾個 Net 沒接好（接在哪些腳）。
 */
export function convertedReply(f: LabFile, options: { display: 'ca' | 'cc' }, converted: Extract<ConvertRouted, { ok: true }>): ToolResult {
  const { result: r, routed, tried } = converted;
  const notes = [`試了 ${tried} 種擺法，用佈線最好的一種。`];
  const done = routed.status === 'success';
  const circuit = done ? applyRouting(r.circuit, routed) : r.circuit;
  const bom = r.bom;
  const parts = [
    ...Object.entries(bom.ics).map(([id, n]) => `${id} × ${n}`),
    switchText(bom),
    `電阻 × ${bom.resistors}`,
    `LED × ${bom.leds}`,
    ...(bom.displays > 0 ? [`7 段顯示器 × ${bom.displays}（${options.display === 'cc' ? '共陰極' : '共陽極'}）`] : []),
  ];
  const lines = [
    `轉成麵包板（${bom.layout === 'MB102' ? 'MB-102' : 'EIC-1106'}）：${parts.join('、')}。`,
    ...notes,
    ...routingSummaryText(summarizeRouting(circuit, { beforeScore: analyzeCircuit(r.circuit).routing, result: routed })),
  ];
  if (!done) {
    const nets = new Map(extractNets(r.circuit).map((n) => [n.id, n]));
    const pins = (netId: string) =>
      (nets.get(netId)?.pins ?? []).map((p) => `${p.componentId} 第 ${p.pinNumber} 腳`).join('、') || '找不到接在哪些腳';
    const missing = routed.failedNets.map((n) => `${n.netId}（${pins(n.netId)}）`).join('；');
    lines.push(
      `佈線沒有完成，沒有寫入檔案：還沒接好的連線不能用斜的或交叉的線代替（每條線只能水平或垂直、不能交叉、不能跨過 IC）。沒接好的是 ${missing}。`,
      '可以改用 board: "EIC1106"、加上 / 下拉電阻或只用一種閘再轉一次。',
    );
    return { text: lines.join('\n') };
  }
  lines.push(`比對：${diagramCheckText(f.logic, circuit)}`);
  return { text: lines.join('\n'), file: { ...f, circuit } };
}
