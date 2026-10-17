import { getBoard } from '../core/breadboard/registry';
import { parseHoleName } from '../core/breadboard/naming';
import { resolveFootprint } from '../core/circuit/footprint';
import { getComponentDefinition } from '../core/circuit/library';
import { validateCircuit } from '../core/circuit/validate';
import { holeLabel } from '../editor/analysis';
import { addWire as addWireCommand, labelSlots, makeInstance, removeItems, setLabel, updateComponentProps } from '../editor/commands';
import { circuitBrief } from '../editor/explain/brief';
import { plainText } from '../editor/explain/helpers';
import { explainIssue } from '../editor/explain/index';
import { nextComponentId } from '../editor/ids';
import { librarySections, LED_COLORS, searchLibrary } from '../editor/library';
import { defaultWireColor, straightProblemText, straightWireProblem } from '../editor/manualWire';
import { buildOccupancy, checkPlacementWith, type HardIssue, type SoftIssue } from '../editor/placement';
import { emptyDiagram, type LogicDiagram } from '../logic/types';
import type { LayoutId } from '../types/board';
import type { Circuit } from '../types/circuit';
import type { ComponentInstance, LedColor, Rotation } from '../types/component';
import type { GridPoint } from '../types/geometry';

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

const fail = (text: string): ToolResult => ({ text, error: true });
const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export function newLabFile(name: string, layout: LayoutId): LabFile {
  return { name, circuit: { version: 1, boards: [{ id: 'b1', layoutId: layout, x: 0, y: 0, groupId: null }], components: [], wires: [] }, logic: emptyDiagram() };
}

/** 孔位名稱 → 格點。有好幾塊板時一定要寫板子 ID（b2:F10）。 */
export function parseHole(circuit: Circuit, raw: string): { ok: true; point: GridPoint } | { ok: false; error: string } {
  const text = raw.trim();
  const colon = text.indexOf(':');
  let boardId: string;
  if (colon >= 0) boardId = text.slice(0, colon);
  else if (circuit.boards.length === 1) boardId = circuit.boards[0].id;
  else return { ok: false, error: `有好幾塊麵包板，孔位前面要加板子 ID（例如 ${circuit.boards[1].id}:${text}）` };
  const instance = circuit.boards.find((b) => b.id === boardId);
  if (!instance) return { ok: false, error: `沒有麵包板 ${boardId}` };
  const point = parseHoleName(getBoard(instance.layoutId, instance.id), colon >= 0 ? text : text);
  return point ? { ok: true, point } : { ok: false, error: `孔位 ${text} 不存在` };
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

