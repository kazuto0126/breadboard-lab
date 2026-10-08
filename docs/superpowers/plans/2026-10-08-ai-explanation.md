# 離線錯誤解說（子專案 5 第一部分）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 學生點一個檢查錯誤時，顯示「為什麼錯」與具體到孔位的「怎麼改」，並在麵包板上用綠色標出建議的孔與導線。

**Architecture:** `src/editor/explain/` 是不依賴 DOM 的純函式：`explainIssue(circuit, issue)` 依錯誤代碼分派到各個解說函式，失敗時退回通用說明，結果依（電路, 錯誤）快取。
畫面只負責顯示：`ExplanationCard`（右側面板）與 `SuggestionMarks`（畫布）。建議導線用手動接線同一個 `planWirePath`。

**Tech Stack:** TypeScript、React 19、Zustand、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-08-ai-explanation-design.md`

## Global Constraints

- `src/editor/explain/` 不能用 DOM / 瀏覽器 API（`tsconfig.json` 不含 DOM 型別）。
- 核心的 `validateCircuit` 與既有測試都不改。
- 文字用繁體中文；孔位名稱一律用 `holeLabel(circuit, p)`（多塊板時是 `b2:A12`）。
- 步驟文字用 `{0}`、`{1}` 代表 `step.holes[0]`、`step.holes[1]`；`plainText(circuit, step)` 換成孔位名稱。
- 電源軌選擇、從腳拉線、找不到空孔的規則照規格第 3 節；LED 電阻位置照規格第 3.2 節。
- 推送前跑 `npm run typecheck && npm test`；改到畫面時跑 e2e（本機：`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向 Edge）。

## Review Focus

- 建議的孔剛好是要放電源元件的孔（沒有電源時）：導線終點不能和它重疊。→ Task 2「沒有 GND 時先放一個」。
- 腳那一排插滿：不能給出不存在的孔。→ Task 2「那一排沒有空孔」。
- 照建議做之後錯誤要真的消失（不是只有文字看起來對）。→ Task 2–4 的「套用建議」測試。
- 解說函式遇到意外資料（錯誤沒有點位）不能讓面板壞掉。→ Task 1「退回通用說明」。
- 多塊板時孔位名稱要帶板子 ID。→ Task 1 `plainText` 用 `holeLabel`。

---

## 檔案

| 檔案 | 責任 |
|---|---|
| `src/editor/explain/types.ts` | `Explanation`、`ExplainStep` |
| `src/editor/explain/helpers.ts` | 找腳、找空孔、選電源軌、從腳拉線、組合解說、`plainText` |
| `src/editor/explain/generic.ts` | 18 種代碼的「為什麼 / 怎麼改」文字與通用解說 |
| `src/editor/explain/power.ts` | `IC_POWER_MISSING`、`NO_POWER_SOURCE`、`INPUT_FLOATING` |
| `src/editor/explain/parts.ts` | `PIN_UNCONNECTED`、`LED_REVERSED`、`LED_NO_RESISTOR` |
| `src/editor/explain/short.ts` | `SHORT_CIRCUIT` |
| `src/editor/explain/index.ts` | `explainIssue`（分派、try/catch、快取） |
| `src/components/PropertyPanel/ExplanationCard.tsx` | 解說卡 |
| `src/components/PropertyPanel/PropertyPanel.tsx` | 檢查分頁與屬性分頁顯示解說卡 |
| `src/components/Breadboard/overlays.tsx`、`BreadboardCanvas.tsx` | 板上綠色標示 |
| `tests/editor/explain.test.ts`、`e2e/explain.spec.ts` | 測試 |

---

### Task 1: 解說的資料結構、共用工具、通用說明

**Files:** Create `src/editor/explain/{types,helpers,generic,index}.ts`；Test `tests/editor/explain.test.ts`

**Interfaces — Produces:**
- `ExplainStep { text; holes }`、`Explanation { why; steps; holes; wires; removeWireIds }`
- helpers：`pinAt(circuit, point | undefined): PinHit`（找不到時丟例外）、`pinOfRole(hit, role)`、`pinLabel(hit)`、`roleOf(circuit, ref)`、
  `freeHolesInGroup(circuit, point)`（依 y、x 排序）、`groupIsEmpty(circuit, point)`、`pinCountInGroup(circuit, point)`、`Rail`、`RAIL_TEXT`、`railCarries`、`chooseRail(circuit, point, '+' | '-')`、
  `railHole(circuit, boardId, rail, x, exclude?)`、`wireToRail(circuit, point, rail, exclude?): WirePlan | null`、`step(text, ...holes)`、
  `explanation(why, steps, wires?, removeWireIds?)`、`plainText(circuit, step)`、`samePoint`
- generic：`ISSUE_TEXT: Record<CircuitErrorCode, { why; fix }>`、`genericExplanation(circuit, issue)`
- index：`explainIssue(circuit, issue)`、`registerExplainer`（只給 index 內部用的分派表 `EXPLAINERS`，Task 2–4 加入項目）

- [ ] **Step 1: 寫失敗的測試**（`tests/editor/explain.test.ts` 第一部分）

```ts
import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { explainIssue, plainText } from '../../src/editor/explain';
import { ISSUE_TEXT } from '../../src/editor/explain/generic';
import { chooseRail, freeHolesInGroup } from '../../src/editor/explain/helpers';
import type { Circuit, CircuitError, CircuitErrorCode } from '../../src/types/circuit';
import { circuit, comp, hole, wire } from '../fixtures/build';

const fake = (code: CircuitErrorCode, over: Partial<CircuitError> = {}): CircuitError => ({
  code, severity: 'error', message: 'x', points: [], componentIds: [], wireIds: [], netIds: [], ...over,
});
const texts = (c: Circuit, issue: CircuitError) => explainIssue(c, issue).steps.map((s) => plainText(c, s));
const issueOf = (c: Circuit, code: CircuitErrorCode, at?: string) =>
  validateCircuit(c).find((e) => e.code === code && (!at || e.points.some((p) => p.x === hole(at).x && p.y === hole(at).y)))!;
const names = (c: Circuit, points: { x: number; y: number }[]) => points.map((p) => `${p.x},${p.y}`);

/** 74LS00 跨在凹槽上：第 1–7 腳在 F10–F16，第 14–8 腳在 E10–E16；VCC 在 T+3、GND 在 B-3，第 7 腳已接 GND。 */
const icBase = () => [comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3')];
const gndWire = () => wire('g1', 'J16', 'B-16');

describe('explanations: shared parts', () => {
  const generic: CircuitErrorCode[] = [
    'PLACEMENT_INVALID', 'PIN_COLLISION', 'BODY_OVERLAP', 'WIRE_ENDPOINT_INVALID', 'WIRE_PATH_INVALID',
    'WIRE_THROUGH_OBSTACLE', 'WIRE_OVERLAP', 'IC_PIN_SHORT', 'OUTPUT_CONFLICT', 'COMPONENT_SHORTED',
  ];

  it('gives every text-only issue a reason and at least one step', () => {
    for (const code of generic) {
      const e = explainIssue(circuit([]), fake(code));
      expect(e.why, code).toBe(ISSUE_TEXT[code].why);
      expect(e.steps.length, code).toBeGreaterThan(0);
      expect(e.holes, code).toEqual([]);
    }
  });

  it('falls back to the generic text when an explainer cannot read the issue', () => {
    const e = explainIssue(circuit([]), fake('IC_POWER_MISSING'));
    expect(e.why).toBe(ISSUE_TEXT.IC_POWER_MISSING.why);
    expect(e.steps.map((s) => s.text)).toEqual([ISSUE_TEXT.IC_POWER_MISSING.fix]);
  });

  it('lists free holes of a row and picks the rail on the same side that carries power', () => {
    const c = circuit(icBase(), [gndWire()]);
    expect(names(c, freeHolesInGroup(c, hole('E10')))).toEqual(names(c, ['A10', 'B10', 'C10', 'D10'].map(hole)));
    expect(chooseRail(c, hole('E10'), '+')).toEqual({ rail: 'T+', powered: true });
    expect(chooseRail(c, hole('F16'), '+')).toEqual({ rail: 'T+', powered: true });
    expect(chooseRail(c, hole('E10'), '-')).toEqual({ rail: 'B-', powered: true });
    expect(chooseRail(circuit([comp('U1', '74LS00', 'F10')]), hole('F16'), '-')).toEqual({ rail: 'B-', powered: false });
  });

  it('writes hole names into the step text', () => {
    const c = circuit(icBase(), [gndWire()]);
    expect(plainText(c, { text: '從 {0} 到 {1}', holes: [hole('A10'), hole('T+10')] })).toBe('從 A10 到 T+10');
  });
});
```

（`texts`、`issueOf` 在 Task 2–4 使用。）

- [ ] **Step 2: 確認失敗** — Run: `npx vitest run tests/editor/explain.test.ts` — Expected: FAIL，找不到 `src/editor/explain`。

- [ ] **Step 3: 實作**

`src/editor/explain/types.ts`：

```ts
import type { GridPoint } from '../../types/geometry';

/** 一個修改步驟。text 裡的 {0}、{1} 代表 holes[0]、holes[1]（畫面上變成可以點的孔位按鈕）。 */
export interface ExplainStep {
  text: string;
  holes: GridPoint[];
}

export interface Explanation {
  why: string;
  steps: ExplainStep[];
  /** 板上用綠色虛線圈標示並編號的孔：依步驟裡第一次出現的順序，不重複。 */
  holes: GridPoint[];
  /** 建議的導線路徑（綠色虛線預覽）。 */
  wires: GridPoint[][];
  /** 建議拔掉的既有導線。 */
  removeWireIds: string[];
}
```

`src/editor/explain/helpers.ts`：

```ts
import { nodeIdOf } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { Circuit, PinRef } from '../../types/circuit';
import type { ComponentDefinition, ComponentInstance, PinDefinition, PinRole } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { analyzeCircuit, groupIdAt, holeLabel, occupancyOf } from '../analysis';
import { isFreeHoleWith, planWirePath } from '../manualWire';
import type { ExplainStep, Explanation } from './types';

export interface PinHit {
  instance: ComponentInstance;
  def: ComponentDefinition;
  pin: PinDefinition;
  point: GridPoint;
}

export function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.boardId === b.boardId && a.x === b.x && a.y === b.y;
}

function hitOf(instance: ComponentInstance, def: ComponentDefinition, pinNumber: number): PinHit | null {
  const pin = def.pins.find((p) => p.number === pinNumber);
  const point = resolveFootprint(instance, def).pins.find((p) => p.pinNumber === pinNumber)?.point;
  return pin && point ? { instance, def, pin, point } : null;
}

/** 插在 point 的元件腳；沒有時丟出例外（explainIssue 會退回通用說明）。 */
export function pinAt(circuit: Circuit, point: GridPoint | undefined): PinHit {
  if (point) {
    for (const instance of circuit.components) {
      const def = getComponentDefinition(instance.defId);
      const fp = def && resolveFootprint(instance, def).pins.find((p) => samePoint(p.point, point));
      const hit = def && fp ? hitOf(instance, def, fp.pinNumber) : null;
      if (hit) return hit;
    }
  }
  throw new Error('No component pin at the issue point');
}

/** 同一個元件上某種角色的腳（例如 LED 的陰極）。 */
export function pinOfRole(hit: PinHit, role: PinRole): PinHit {
  const pin = hit.def.pins.find((p) => p.role === role);
  const other = pin ? hitOf(hit.instance, hit.def, pin.number) : null;
  if (!other) throw new Error(`No ${role} pin on ${hit.instance.id}`);
  return other;
}

export function pinLabel(hit: PinHit): string {
  return `${hit.instance.id} 第 ${hit.pin.number} 腳（${hit.pin.name}）`;
}

export function roleOf(circuit: Circuit, ref: PinRef): PinRole | undefined {
  const instance = circuit.components.find((c) => c.id === ref.componentId);
  return instance ? getComponentDefinition(instance.defId)?.pins.find((p) => p.number === ref.pinNumber)?.role : undefined;
}

function holesOfGroup(circuit: Circuit, boardId: string, groupId: string): GridPoint[] {
  const instance = circuit.boards.find((b) => b.id === boardId);
  if (!instance) return [];
  return getBoard(instance.layoutId, instance.id)
    .nodes.filter((n) => n.groupId === groupId && n.kind === 'hole')
    .map((n) => ({ boardId, x: n.x, y: n.y }));
}

/** 和 point 同一條導通排的空孔（沒有腳、沒被蓋住、沒有導線端點或經過），依 y、x 排序。 */
export function freeHolesInGroup(circuit: Circuit, point: GridPoint): GridPoint[] {
  const groupId = groupIdAt(circuit, point);
  if (!groupId) return [];
  const occ = occupancyOf(circuit, point.boardId);
  return holesOfGroup(circuit, point.boardId, groupId)
    .filter((p) => isFreeHoleWith(occ, p))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/** point 所在的那一排整排沒有任何元件腳與導線端點（新的一排，不會接到別的東西）。 */
export function groupIsEmpty(circuit: Circuit, point: GridPoint): boolean {
  const groupId = groupIdAt(circuit, point);
  if (!groupId) return false;
  const occ = occupancyOf(circuit, point.boardId);
  return holesOfGroup(circuit, point.boardId, groupId).every((p) => !occ.pins.has(nodeIdOf(p)) && !occ.wireEnds.has(nodeIdOf(p)));
}

/** point 所在的那一排插了幾隻元件腳。 */
export function pinCountInGroup(circuit: Circuit, point: GridPoint): number {
  const groupId = groupIdAt(circuit, point);
  if (!groupId) return 0;
  const occ = occupancyOf(circuit, point.boardId);
  return holesOfGroup(circuit, point.boardId, groupId).filter((p) => occ.pins.has(nodeIdOf(p))).length;
}

export type Rail = 'T+' | 'T-' | 'B+' | 'B-';

export const RAIL_TEXT: Record<Rail, string> = {
  'T+': '上方的 + 電源軌',
  'T-': '上方的 − 電源軌',
  'B+': '下方的 + 電源軌',
  'B-': '下方的 − 電源軌',
};

const railGroupId = (boardId: string, rail: Rail) => `${boardId}:rail-${rail}`;

/** 這條電源軌所在的 Net 有沒有 role 這種電源腳（vcc-source / gnd-source）。 */
export function railCarries(circuit: Circuit, boardId: string, rail: Rail, role: PinRole): boolean {
  const net = analyzeCircuit(circuit).netByGroup.get(railGroupId(boardId, rail));
  return net !== undefined && net.pins.some((ref) => roleOf(circuit, ref) === role);
}

/** 規格第 3 節：上半部（A–E）用上方的軌、下半部用下方的軌；那條沒電而另一條同極性的有電時改用另一條。 */
export function chooseRail(circuit: Circuit, point: GridPoint, polarity: '+' | '-'): { rail: Rail; powered: boolean } {
  const role: PinRole = polarity === '+' ? 'vcc-source' : 'gnd-source';
  const top = point.y < 10;
  const near = `${top ? 'T' : 'B'}${polarity}` as Rail;
  const far = `${top ? 'B' : 'T'}${polarity}` as Rail;
  if (railCarries(circuit, point.boardId, near, role)) return { rail: near, powered: true };
  if (railCarries(circuit, point.boardId, far, role)) return { rail: far, powered: true };
  return { rail: near, powered: false };
}

/** 電源軌上和 x 最接近的空孔（同距離選 x 較小的）。 */
export function railHole(circuit: Circuit, boardId: string, rail: Rail, x: number, exclude: GridPoint[] = []): GridPoint | null {
  const occ = occupancyOf(circuit, boardId);
  const holes = holesOfGroup(circuit, boardId, railGroupId(boardId, rail)).filter(
    (p) => isFreeHoleWith(occ, p) && !exclude.some((e) => samePoint(e, p)),
  );
  holes.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x) || a.x - b.x);
  return holes[0] ?? null;
}

export interface WirePlan {
  from: GridPoint;
  to: GridPoint;
  path: GridPoint[];
}

/** 從 point 那一排最靠近目標軌的空孔，拉到軌上 x 最接近的空孔。那一排或那條軌沒有空孔時回傳 null。 */
export function wireToRail(circuit: Circuit, point: GridPoint, rail: Rail, exclude: GridPoint[] = []): WirePlan | null {
  const holes = freeHolesInGroup(circuit, point);
  if (holes.length === 0) return null;
  const from = rail.startsWith('T') ? holes[0] : holes[holes.length - 1];
  const to = railHole(circuit, point.boardId, rail, from.x, exclude);
  return to ? { from, to, path: planWirePath(circuit, from, to, 'v') } : null;
}

export function step(text: string, ...holes: GridPoint[]): ExplainStep {
  return { text, holes };
}

export function explanation(why: string, steps: ExplainStep[], wires: GridPoint[][] = [], removeWireIds: string[] = []): Explanation {
  const holes: GridPoint[] = [];
  for (const s of steps) for (const h of s.holes) if (!holes.some((x) => samePoint(x, h))) holes.push(h);
  return { why, steps, holes, wires, removeWireIds };
}

/** 把步驟裡的 {0}、{1} 換成孔位名稱。 */
export function plainText(circuit: Circuit, s: ExplainStep): string {
  return s.text.replace(/\{(\d+)\}/g, (_, i: string) => {
    const p = s.holes[Number(i)];
    return p ? holeLabel(circuit, p) : '';
  });
}
```

`src/editor/explain/generic.ts`：

```ts
import type { Circuit, CircuitError, CircuitErrorCode } from '../../types/circuit';
import { explanation, step } from './helpers';
import type { Explanation } from './types';

/** 規格第 3 節：每種錯誤的「為什麼」與通用的「怎麼改」。 */
export const ISSUE_TEXT: Record<CircuitErrorCode, { why: string; fix: string }> = {
  IC_POWER_MISSING: {
    why: '74LS 晶片要從 VCC 腳拿 +5 V、從 GND 腳接地才會動作；這隻腳沒有接上，整顆 IC 都不會工作。',
    fix: '用導線把這隻腳所在的那一排接到電源軌：VCC 腳接 + 軌、GND 腳接 − 軌。',
  },
  NO_POWER_SOURCE: {
    why: '電路裡沒有 VCC 和 GND，任何元件都拿不到電。',
    fix: '從元件庫放一個 VCC 到 + 電源軌、一個 GND 到 − 電源軌，再把用到電的元件接到這兩條軌。',
  },
  INPUT_FLOATING: {
    why: 'TTL 輸入腳空著時會被當成 HIGH，但很容易受雜訊干擾，結果時好時壞。',
    fix: '要用的話接到開關或其他閘的輸出；用不到的話接到 + 電源軌，讓它固定是 HIGH。',
  },
  PIN_UNCONNECTED: {
    why: '這隻腳所在的那一排只有它自己，沒有接到任何東西，電流沒有路可走。',
    fix: '從這一排的空孔拉線到要接的地方（電源軌，或另一個元件的腳所在的那一排）。',
  },
  LED_NO_RESISTOR: {
    why: 'LED 直接接在電源上電流太大，會燒掉 LED 或 IC 的輸出腳；要串一顆 220–330 Ω 的電阻限流。',
    fix: '在 LED 陰極那一側串一顆 220 Ω 電阻：電阻一腳和陰極插同一排，另一腳插到新的一排，原本接陰極的線改接到新的那一排。',
  },
  LED_REVERSED: {
    why: 'LED 只能單向導通：陽極（A，長腳）要接高電位、陰極（K，短腳）接 GND。現在接反了，LED 不會亮。',
    fix: '把 LED 轉半圈，讓陽極和陰極對調位置。',
  },
  SHORT_CIRCUIT: {
    why: '電源沒有經過任何元件就直接接到 GND（或接到不同電壓的電源），電流非常大，電源會過熱或啟動保護。',
    fix: '找出把電源和 GND 接在一起的那條導線，先拔掉它，再確認原本想接到哪裡。',
  },
  PLACEMENT_INVALID: {
    why: '元件有腳沒插在孔上，或兩腳距離太小，實體元件插不進去。',
    fix: '把元件拖到每隻腳都在孔上的位置；電阻、LED 可以在屬性面板加長兩腳距離。',
  },
  PIN_COLLISION: {
    why: '一個孔只能插一隻腳或一條線，兩個東西擠在同一孔實際上插不進去。',
    fix: '移開其中一個元件或導線，改插同一排的其他空孔（同一排是導通的，接法不變）。',
  },
  BODY_OVERLAP: {
    why: '兩個元件的本體疊在一起，實體上放不下。',
    fix: '把其中一個元件移到旁邊空的位置。',
  },
  WIRE_ENDPOINT_INVALID: {
    why: '導線的端點要插在空孔上：不能在板面、元件下面，也不能和別條線插同一孔。',
    fix: '刪掉這條線，從空孔重新拉一條；要接同一排時改用同一排的其他空孔。',
  },
  WIRE_PATH_INVALID: {
    why: '導線要沿著孔走、只能水平或垂直轉彎；這條線的路徑不合法（通常是舊檔案或手動編輯的檔案造成）。',
    fix: '刪掉這條線重新拉。',
  },
  WIRE_THROUGH_OBSTACLE: {
    why: '跳線平貼在板上，不能壓過元件的腳、本體或別條線的端點。',
    fix: '刪掉這條線重新拉（接線時會自動繞開），或按「AI 標準佈線」。',
  },
  WIRE_OVERLAP: {
    why: '兩條線在板上疊在同一段，實際上插不下，也很難看出誰接誰。',
    fix: '刪掉其中一條改走別的路，或按「AI 標準佈線」重新排。',
  },
  IC_PIN_SHORT: {
    why: 'IC 的兩隻腳插在同一條導通排上，等於被接在一起（通常是 IC 沒有跨在中間凹槽上）。',
    fix: '把 IC 移到跨過中間凹槽的位置，讓上下兩排腳分開。',
  },
  OUTPUT_CONFLICT: {
    why: '兩個輸出腳接在一起（或輸出腳直接接電源），兩邊各自想送 HIGH / LOW 會互相打架，可能燒壞 IC。',
    fix: '一個 Net 只能有一個輸出；拔掉多出來的那條連線，必要時改用邏輯閘合併。',
  },
  COMPONENT_SHORTED: {
    why: '元件的兩隻腳插在同一條導通排上，電流直接從排上流過，元件等於沒接。',
    fix: '把元件轉 90° 或移位置，讓兩隻腳在不同的排。',
  },
  CIRCUIT_VALID: {
    why: '電路檢查通過，沒有錯誤也沒有警告。',
    fix: '可以按「AI 標準佈線」整理導線，再照接線清單插實體麵包板。',
  },
};

export function genericExplanation(_circuit: Circuit, issue: CircuitError): Explanation {
  const text = ISSUE_TEXT[issue.code];
  return explanation(text.why, [step(text.fix)]);
}
```

`src/editor/explain/index.ts`：

```ts
import type { Circuit, CircuitError, CircuitErrorCode } from '../../types/circuit';
import { genericExplanation } from './generic';
import type { Explanation } from './types';

export type { Explanation, ExplainStep } from './types';
export { plainText } from './helpers';

type Explainer = (circuit: Circuit, issue: CircuitError) => Explanation;

/** 有具體孔位建議的錯誤（規格第 3.1 節）；其他錯誤用通用說明。 */
const EXPLAINERS: Partial<Record<CircuitErrorCode, Explainer>> = {};

const cache = new WeakMap<Circuit, WeakMap<CircuitError, Explanation>>();

/** 針對一個檢查錯誤產生解說。解說函式出錯時退回通用說明；同一個電路與錯誤只算一次。 */
export function explainIssue(circuit: Circuit, issue: CircuitError): Explanation {
  let perCircuit = cache.get(circuit);
  if (!perCircuit) {
    perCircuit = new WeakMap();
    cache.set(circuit, perCircuit);
  }
  const cached = perCircuit.get(issue);
  if (cached) return cached;
  let result: Explanation;
  try {
    result = (EXPLAINERS[issue.code] ?? genericExplanation)(circuit, issue);
  } catch {
    result = genericExplanation(circuit, issue);
  }
  perCircuit.set(issue, result);
  return result;
}
```

- [ ] **Step 4: 確認通過** — Run: `npx vitest run tests/editor/explain.test.ts` — Expected: PASS（4 tests）；`npm run typecheck` 無錯誤。

- [ ] **Step 5: Commit 並推送**

```bash
git add src/editor/explain tests/editor/explain.test.ts
git commit -m "feat(editor): explanation model, shared helpers and generic issue texts"
git push
```

---

### Task 2: 電源相關的解說（`IC_POWER_MISSING`、`NO_POWER_SOURCE`、`INPUT_FLOATING`）

**Files:** Create `src/editor/explain/power.ts`；Modify `src/editor/explain/index.ts`；Test `tests/editor/explain.test.ts`

**Interfaces — Produces:** `explainPowerMissing`、`explainNoPowerSource`、`explainInputFloating`（`Explainer`），登記在 `EXPLAINERS`。

- [ ] **Step 1: 寫失敗的測試**（加到 `tests/editor/explain.test.ts`）

```ts
const withWire = (c: Circuit, path: Circuit['wires'][number]['path']): Circuit => ({
  ...c,
  wires: [...c.wires, { id: 'sug', color: '#22c55e', source: 'manual', start: path[0], end: path[path.length - 1], path }],
});

describe('explanations: power', () => {
  it('suggests a wire from the VCC pin row to the + rail, and following it fixes the issue', () => {
    const c = circuit(icBase(), [gndWire()]);
    const issue = issueOf(c, 'IC_POWER_MISSING', 'E10');
    const e = explainIssue(c, issue);
    expect(texts(c, issue)).toEqual(['從 U1 第 14 腳（VCC）那一排的空孔 A10，拉一條線到上方的 + 電源軌 T+10。']);
    expect(names(c, e.holes)).toEqual(names(c, [hole('A10'), hole('T+10')]));
    expect(e.wires).toHaveLength(1);
    const fixed = withWire(c, e.wires[0]);
    expect(validateCircuit(fixed).some((x) => x.code === 'IC_POWER_MISSING' && x.points[0].x === 10 && x.points[0].y === hole('E10').y)).toBe(false);
  });

  it('asks to place a GND first when no rail carries ground, without reusing that hole for the wire', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3')], [wire('v1', 'A10', 'T+10')]);
    const issue = issueOf(c, 'IC_POWER_MISSING', 'F16');
    expect(texts(c, issue)).toEqual([
      '先從元件庫放一個 GND 到下方的 − 電源軌，例如 B-3。',
      '從 U1 第 7 腳（GND）那一排的空孔 J16，拉一條線到下方的 − 電源軌 B-16。',
    ]);
  });

  it('uses the other + rail when only that one has power', () => {
    const c = circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'B+3'), comp('G1', 'gnd', 'B-3')], [gndWire()]);
    expect(texts(c, issueOf(c, 'IC_POWER_MISSING', 'E10'))).toEqual(['從 U1 第 14 腳（VCC）那一排的空孔 D10，拉一條線到下方的 + 電源軌 B+10。']);
  });

  it('says so when the pin row has no free hole', () => {
    const full = ['A', 'B', 'C', 'D'].map((r, i) => wire(`x${i}`, `${r}10`, `${r}${20 + i}`));
    const c = circuit(icBase(), [gndWire(), ...full]);
    const e = explainIssue(c, issueOf(c, 'IC_POWER_MISSING', 'E10'));
    expect(e.steps.map((s) => plainText(c, s))).toEqual(['U1 第 14 腳（VCC）那一排已經沒有空孔，請先移開那一排上的導線或元件，再拉線到上方的 + 電源軌。']);
    expect(e.holes).toEqual([]);
  });

  it('places VCC and GND on the rails when the circuit has no power at all', () => {
    const c = circuit([comp('U1', '74LS00', 'F10')]);
    const issue = issueOf(c, 'NO_POWER_SOURCE');
    expect(texts(c, issue)).toEqual([
      '從元件庫放一個 VCC 到上方的 + 電源軌，例如 T+3。',
      '從元件庫放一個 GND 到下方的 − 電源軌，例如 B-3。',
      '再把 IC 的 VCC 腳接到 + 軌、GND 腳接到 − 軌；其他元件也從這兩條軌拿電。',
    ]);
  });

  it('offers to tie an unused input to the + rail, and following it fixes the warning', () => {
    const c = circuit(icBase(), [gndWire(), wire('v1', 'A10', 'T+10')]);
    const issue = issueOf(c, 'INPUT_FLOATING', 'F10');
    const e = explainIssue(c, issue);
    expect(texts(c, issue)).toEqual([
      '如果這隻腳要用：從 G10 拉線到開關，或其他閘的輸出腳所在的那一排。',
      '如果用不到：從 U1 第 1 腳（1A）那一排的空孔 G10，拉一條線到上方的 + 電源軌 T+9，讓它固定是 HIGH。',
    ]);
    const fixed = withWire(c, e.wires[0]);
    expect(validateCircuit(fixed).some((x) => x.code === 'INPUT_FLOATING' && x.points[0].x === 10 && x.points[0].y === hole('F10').y)).toBe(false);
  });
});
```

- [ ] **Step 2: 確認失敗** — Run: `npx vitest run tests/editor/explain.test.ts` — Expected: 新的 6 個測試 FAIL（目前是通用說明）。

- [ ] **Step 3: 實作** `src/editor/explain/power.ts`：

```ts
import type { Circuit, CircuitError } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';
import { ISSUE_TEXT } from './generic';
import {
  chooseRail, explanation, freeHolesInGroup, pinAt, pinLabel, RAIL_TEXT, railHole, step, wireToRail,
  type PinHit, type Rail,
} from './helpers';
import type { ExplainStep, Explanation } from './types';

interface Connection {
  steps: ExplainStep[];
  wires: GridPoint[][];
  /** 起點（那一排的空孔）；那一排插滿時是 null。 */
  from: GridPoint | null;
}

/**
 * 規格第 3 節：把一隻腳接到某個極性的電源軌。沒有那種電源時先放一個（那個孔不再當導線終點）；
 * lead / tail 是接在拉線那一步前後的文字。
 */
function connectToRail(circuit: Circuit, hit: PinHit, polarity: '+' | '-', lead = '', tail = ''): Connection {
  const { rail, powered } = chooseRail(circuit, hit.point, polarity);
  const steps: ExplainStep[] = [];
  const exclude: GridPoint[] = [];
  if (!powered) {
    const source = polarity === '+' ? 'VCC' : 'GND';
    const at = railHole(circuit, hit.point.boardId, rail, 0);
    if (at) exclude.push(at);
    steps.push(at ? step(`${lead}先從元件庫放一個 ${source} 到${RAIL_TEXT[rail]}，例如 {0}。`, at) : step(`${lead}先從元件庫放一個 ${source} 到${RAIL_TEXT[rail]}。`));
    lead = '';
  }
  if (freeHolesInGroup(circuit, hit.point).length === 0) {
    steps.push(step(`${lead}${pinLabel(hit)} 那一排已經沒有空孔，請先移開那一排上的導線或元件，再拉線到${RAIL_TEXT[rail]}。`));
    return { steps, wires: [], from: null };
  }
  const plan = wireToRail(circuit, hit.point, rail as Rail, exclude);
  if (!plan) {
    steps.push(step(`${lead}${RAIL_TEXT[rail]}已經沒有空孔，請先移開軌上的導線。`));
    return { steps, wires: [], from: null };
  }
  steps.push(step(`${lead}從 ${pinLabel(hit)} 那一排的空孔 {0}，拉一條線到${RAIL_TEXT[rail]} {1}${tail}。`, plan.from, plan.to));
  return { steps, wires: [plan.path], from: plan.from };
}

export function explainPowerMissing(circuit: Circuit, issue: CircuitError): Explanation {
  const hit = pinAt(circuit, issue.points[0]);
  const { steps, wires } = connectToRail(circuit, hit, hit.pin.role === 'ground' ? '-' : '+');
  return explanation(ISSUE_TEXT.IC_POWER_MISSING.why, steps, wires);
}

export function explainNoPowerSource(circuit: Circuit): Explanation {
  const boardId = circuit.components[0]?.boardId ?? circuit.boards[0].id;
  const vcc = railHole(circuit, boardId, 'T+', 0);
  const gnd = railHole(circuit, boardId, 'B-', 0);
  return explanation(ISSUE_TEXT.NO_POWER_SOURCE.why, [
    vcc ? step('從元件庫放一個 VCC 到上方的 + 電源軌，例如 {0}。', vcc) : step('從元件庫放一個 VCC 到 + 電源軌。'),
    gnd ? step('從元件庫放一個 GND 到下方的 − 電源軌，例如 {0}。', gnd) : step('從元件庫放一個 GND 到 − 電源軌。'),
    step('再把 IC 的 VCC 腳接到 + 軌、GND 腳接到 − 軌；其他元件也從這兩條軌拿電。'),
  ]);
}

export function explainInputFloating(circuit: Circuit, issue: CircuitError): Explanation {
  const hit = pinAt(circuit, issue.points[0]);
  const tie = connectToRail(circuit, hit, '+', '如果用不到：', '，讓它固定是 HIGH');
  if (!tie.from) return explanation(ISSUE_TEXT.INPUT_FLOATING.why, tie.steps, tie.wires);
  const use = step('如果這隻腳要用：從 {0} 拉線到開關，或其他閘的輸出腳所在的那一排。', tie.from);
  return explanation(ISSUE_TEXT.INPUT_FLOATING.why, [use, ...tie.steps], tie.wires);
}
```

`src/editor/explain/index.ts`：import 三個函式，`EXPLAINERS` 改成

```ts
const EXPLAINERS: Partial<Record<CircuitErrorCode, Explainer>> = {
  IC_POWER_MISSING: explainPowerMissing,
  NO_POWER_SOURCE: explainNoPowerSource,
  INPUT_FLOATING: explainInputFloating,
};
```

- [ ] **Step 4: 確認通過** — Run: `npx vitest run tests/editor/explain.test.ts` — Expected: PASS（10 tests）；`npm run typecheck` 無錯誤。

- [ ] **Step 5: Commit 並推送** — `git commit -m "feat(editor): explain missing IC power, missing power source and floating inputs"`

---

### Task 3: 元件腳與 LED 的解說（`PIN_UNCONNECTED`、`LED_REVERSED`、`LED_NO_RESISTOR`）

**Files:** Create `src/editor/explain/parts.ts`；Modify `index.ts`；Test `tests/editor/explain.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
describe('explanations: parts', () => {
  it('points at the free hole nearest the centre channel of an unconnected leg', () => {
    const c = circuit([comp('R1', 'resistor', 'A30')]);
    expect(texts(c, issueOf(c, 'PIN_UNCONNECTED', 'A30'))).toEqual([
      '從 R1 第 1 腳（1）那一排的空孔 E30 拉線到要接的地方（電源軌，或另一個元件的腳所在的那一排）。',
    ]);
  });

  /** 陽極接 GND、陰極接 VCC 的 LED。 */
  const reversed = () =>
    circuit(
      [comp('D1', 'led', 'G40'), comp('V1', 'vcc', 'B+3'), comp('G1', 'gnd', 'B-3')],
      [wire('a1', 'J40', 'B-40'), wire('k1', 'J41', 'B+41')],
    );

  it('shows where the anode and the cathode are when an LED is reversed', () => {
    const c = reversed();
    const e = explainIssue(c, issueOf(c, 'LED_REVERSED'));
    expect(names(c, e.holes)).toEqual(names(c, [hole('G40'), hole('G41')]));
    expect(e.steps.map((s) => plainText(c, s))[0]).toBe('陽極（A）現在在 G40、陰極（K）在 G41：實體 LED 拔起來轉半圈再插回去，讓陽極改插 G41、陰極改插 G40。');
  });

  /** 陽極接 VCC、陰極直接接 GND，沒有限流電阻。 */
  const bare = () =>
    circuit(
      [comp('D1', 'led', 'G40'), comp('V1', 'vcc', 'B+3'), comp('G1', 'gnd', 'B-3')],
      [wire('a1', 'J40', 'B+40'), wire('k1', 'J41', 'B-41')],
    );

  it('places a resistor on the cathode side and moves the cathode wire, which fixes the warning', () => {
    const c = bare();
    const e = explainIssue(c, issueOf(c, 'LED_NO_RESISTOR'));
    expect(e.steps.map((s) => plainText(c, s))).toEqual([
      '電阻（元件庫的 220Ω）一腳插在 LED 陰極那一排的 F41，另一腳插在 F45。',
      '把 k1 插在 J41 的那一端拔起來，改插到 J45。',
    ]);
    expect(e.removeWireIds).toEqual(['k1']);
    const path = e.wires[0];
    const fixed: Circuit = {
      ...c,
      components: [...c.components, comp('R9', 'resistor', 'F41', { props: { resistance: 220 } })],
      wires: [...c.wires.filter((w) => w.id !== 'k1'), { id: 'k2', color: '#000000', source: 'manual', start: path[0], end: path[path.length - 1], path }],
    };
    expect(validateCircuit(fixed).some((x) => x.code === 'LED_NO_RESISTOR')).toBe(false);
  });

  it('wires the new resistor row to ground when the cathode was not connected', () => {
    const c = circuit([comp('D1', 'led', 'G40'), comp('V1', 'vcc', 'B+3'), comp('G1', 'gnd', 'B-3')], [wire('a1', 'J40', 'B+40')]);
    expect(texts(c, issueOf(c, 'LED_NO_RESISTOR'))).toEqual([
      '電阻（元件庫的 220Ω）一腳插在 LED 陰極那一排的 F41，另一腳插在 F45。',
      '從電阻另一腳那一排的空孔 J45，拉一條線到下方的 − 電源軌 B-45。',
    ]);
  });
});
```

- [ ] **Step 2: 確認失敗** — 新的 4 個測試 FAIL。

- [ ] **Step 3: 實作** `src/editor/explain/parts.ts`：

```ts
import type { Circuit, CircuitError } from '../../types/circuit';
import type { ComponentInstance } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { groupIdAt } from '../analysis';
import { planWirePath } from '../manualWire';
import { checkPlacement } from '../placement';
import { ISSUE_TEXT } from './generic';
import {
  chooseRail, explanation, freeHolesInGroup, groupIsEmpty, pinAt, pinCountInGroup, pinLabel, pinOfRole, RAIL_TEXT, railHole, samePoint, step, wireToRail,
} from './helpers';
import type { ExplainStep, Explanation } from './types';

/** 離中間凹槽（第 9.5 列）近的先。 */
const byChannel = (a: GridPoint, b: GridPoint) => Math.abs(a.y - 9.5) - Math.abs(b.y - 9.5) || a.x - b.x;
const distance = (a: GridPoint, b: GridPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function explainPinUnconnected(circuit: Circuit, issue: CircuitError): Explanation {
  const hit = pinAt(circuit, issue.points[0]);
  const free = freeHolesInGroup(circuit, hit.point).sort(byChannel)[0];
  return explanation(ISSUE_TEXT.PIN_UNCONNECTED.why, [
    free
      ? step(`從 ${pinLabel(hit)} 那一排的空孔 {0} 拉線到要接的地方（電源軌，或另一個元件的腳所在的那一排）。`, free)
      : step(`${pinLabel(hit)} 那一排已經沒有空孔，請先移開那一排上的導線或元件。`),
  ]);
}

export function explainLedReversed(circuit: Circuit, issue: CircuitError): Explanation {
  const anode = pinAt(circuit, issue.points[0]);
  const cathode = pinOfRole(anode, 'cathode');
  return explanation(ISSUE_TEXT.LED_REVERSED.why, [
    step('陽極（A）現在在 {0}、陰極（K）在 {1}：實體 LED 拔起來轉半圈再插回去，讓陽極改插 {1}、陰極改插 {0}。', anode.point, cathode.point),
    step(`畫面上：選取 ${anode.instance.id} 後按 R 旋轉，直到陽極在 {0}、陰極在 {1}。`, cathode.point, anode.point),
  ]);
}

interface ResistorSpot {
  instance: ComponentInstance;
  near: GridPoint;
  far: GridPoint;
}

/** 規格第 3.2 節第 1 步：電阻一腳在陰極那一排的空孔、另一腳往右（再往左）4 格，放得下而且另一排整排空著。 */
function resistorSpot(circuit: Circuit, cathode: GridPoint): ResistorSpot | null {
  for (const near of freeHolesInGroup(circuit, cathode).sort(byChannel)) {
    for (const dir of [1, -1]) {
      const instance: ComponentInstance = {
        id: '__suggested_resistor__',
        defId: 'resistor',
        boardId: near.boardId,
        anchor: { x: near.x, y: near.y },
        rotation: dir > 0 ? 0 : 180,
        props: { resistance: 220 },
      };
      const far = { boardId: near.boardId, x: near.x + 4 * dir, y: near.y };
      if (!checkPlacement(circuit, instance).ok) continue;
      if (groupIdAt(circuit, far) === groupIdAt(circuit, near) || !groupIsEmpty(circuit, far)) continue;
      return { instance, near, far };
    }
  }
  return null;
}

export function explainLedNoResistor(circuit: Circuit, issue: CircuitError): Explanation {
  const anode = pinAt(circuit, issue.points[0]);
  const cathode = pinOfRole(anode, 'cathode');
  const why = ISSUE_TEXT.LED_NO_RESISTOR.why;
  const fallback = explanation(why, [step(`先把 ${anode.instance.id} 移到旁邊空的位置，再在陰極那一側串一顆 220 Ω 電阻。`)]);
  const cathodeGroup = groupIdAt(circuit, cathode.point);
  const spot = resistorSpot(circuit, cathode.point);
  if (!spot || !cathodeGroup) return fallback;

  const withResistor: Circuit = { ...circuit, components: [...circuit.components, spot.instance] };
  const steps: ExplainStep[] = [step('電阻（元件庫的 220Ω）一腳插在 LED 陰極那一排的 {0}，另一腳插在 {1}。', spot.near, spot.far)];
  const wires: GridPoint[][] = [];
  const removeWireIds: string[] = [];
  const inCathodeRow = (p: GridPoint) => groupIdAt(circuit, p) === cathodeGroup;
  const attached = circuit.wires.filter((w) => inCathodeRow(w.start) || inCathodeRow(w.end));

  if (attached.length > 0) {
    const used: GridPoint[] = [];
    for (const w of attached) {
      const end = inCathodeRow(w.start) ? w.start : w.end;
      const other = end === w.start ? w.end : w.start;
      const without: Circuit = { ...withResistor, wires: withResistor.wires.filter((x) => x.id !== w.id) };
      const target = freeHolesInGroup(without, spot.far)
        .filter((p) => !used.some((u) => samePoint(u, p)))
        .sort((a, b) => distance(a, other) - distance(b, other) || a.y - b.y || a.x - b.x)[0];
      if (!target) return fallback;
      used.push(target);
      steps.push(step(`把 ${w.id} 插在 {0} 的那一端拔起來，改插到 {1}。`, end, target));
      removeWireIds.push(w.id);
      wires.push(planWirePath(without, target, other, 'v'));
    }
    return explanation(why, steps, wires, removeWireIds);
  }

  // 陰極那一排除了陰極自己還插著其他元件的腳：沒有導線可以改接，要先移開 LED。
  if (pinCountInGroup(circuit, cathode.point) > 1) return fallback;
  const { rail, powered } = chooseRail(withResistor, spot.far, '-');
  const plan = wireToRail(withResistor, spot.far, rail);
  if (!plan) return fallback;
  if (!powered) {
    const at = railHole(withResistor, spot.far.boardId, rail, 0, [plan.to]);
    if (at) steps.push(step(`先從元件庫放一個 GND 到${RAIL_TEXT[rail]}，例如 {0}。`, at));
  }
  steps.push(step(`從電阻另一腳那一排的空孔 {0}，拉一條線到${RAIL_TEXT[rail]} {1}。`, plan.from, plan.to));
  return explanation(why, steps, [plan.path]);
}
```

`index.ts` 的 `EXPLAINERS` 加入 `PIN_UNCONNECTED`、`LED_REVERSED`、`LED_NO_RESISTOR`。

- [ ] **Step 4: 確認通過** — Expected: PASS（14 tests）；typecheck 無錯誤。

- [ ] **Step 5: Commit 並推送** — `git commit -m "feat(editor): explain unconnected legs, reversed LEDs and missing LED resistors"`

---

### Task 4: 短路的解說（`SHORT_CIRCUIT`）

**Files:** Create `src/editor/explain/short.ts`；Modify `index.ts`；Test `tests/editor/explain.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
describe('explanations: short circuit', () => {
  it('names the wire whose removal ends the short, and removing it fixes the error', () => {
    const c = circuit([comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3')], [wire('s1', 'T+20', 'B-20'), wire('u1', 'A30', 'A35')]);
    const e = explainIssue(c, issueOf(c, 'SHORT_CIRCUIT'));
    expect(e.removeWireIds).toEqual(['s1']);
    expect(e.steps.map((s) => plainText(c, s))[0]).toBe('拔掉 s1（T+20 → B-20）就不會短路。');
    const fixed: Circuit = { ...c, wires: c.wires.filter((w) => w.id !== 's1') };
    expect(validateCircuit(fixed).some((x) => x.code === 'SHORT_CIRCUIT')).toBe(false);
  });

  it('explains a short made by parts alone', () => {
    const c = circuit([comp('V1', 'vcc', 'A20'), comp('G1', 'gnd', 'B20')]);
    const e = explainIssue(c, issueOf(c, 'SHORT_CIRCUIT'));
    expect(e.removeWireIds).toEqual([]);
    expect(e.steps[0].text).toBe('這個 Net 上的元件腳直接把電源和 GND 接在一起（G1、V1），請把其中一個元件移到別的排。');
  });
});
```

- [ ] **Step 2: 確認失敗。**

- [ ] **Step 3: 實作** `src/editor/explain/short.ts`：

```ts
import { validateCircuit } from '../../core/circuit/validate';
import type { Circuit, CircuitError } from '../../types/circuit';
import { analyzeCircuit, groupIdAt } from '../analysis';
import { ISSUE_TEXT } from './generic';
import { explanation, step } from './helpers';
import type { Explanation } from './types';

const shortCount = (circuit: Circuit) => validateCircuit(circuit).filter((e) => e.code === 'SHORT_CIRCUIT').length;

/** 規格第 3.1 節：逐一假設拔掉這個 Net 上的每一條導線，拔掉後短路變少的就是「建議先拔掉」的線。 */
export function explainShort(circuit: Circuit, issue: CircuitError): Explanation {
  const why = ISSUE_TEXT.SHORT_CIRCUIT.why;
  const net = analyzeCircuit(circuit).netById.get(issue.netIds[0]);
  const groups = new Set(net?.groupIds ?? []);
  const inNet = (p: (typeof circuit.wires)[number]['start']) => {
    const g = groupIdAt(circuit, p);
    return g !== null && groups.has(g);
  };
  const before = shortCount(circuit);
  const culprits = circuit.wires.filter(
    (w) => (inNet(w.start) || inNet(w.end)) && shortCount({ ...circuit, wires: circuit.wires.filter((x) => x.id !== w.id) }) < before,
  );
  if (culprits.length === 0) {
    return explanation(why, [step(`這個 Net 上的元件腳直接把電源和 GND 接在一起（${issue.componentIds.join('、')}），請把其中一個元件移到別的排。`)]);
  }
  return explanation(
    why,
    [...culprits.map((w) => step(`拔掉 ${w.id}（{0} → {1}）就不會短路。`, w.start, w.end)), step('確認這條線原本想接到哪裡，再重新接到正確的排。')],
    [],
    culprits.map((w) => w.id),
  );
}
```

`index.ts` 的 `EXPLAINERS` 加入 `SHORT_CIRCUIT: explainShort`。

- [ ] **Step 4: 確認通過** — Expected: PASS（16 tests）；`npm test` 全部 PASS；typecheck 無錯誤。

- [ ] **Step 5: Commit 並推送** — `git commit -m "feat(editor): explain short circuits by finding the wire to unplug"`

---

### Task 5: 解說卡與板上標示

**Files:** Create `src/components/PropertyPanel/ExplanationCard.tsx`；Modify `PropertyPanel.tsx`、`src/components/Breadboard/overlays.tsx`、`BreadboardCanvas.tsx`

- [ ] **Step 1: 實作** `ExplanationCard.tsx`：

```tsx
import { holeLabel } from '../../editor/analysis';
import { explainIssue, type ExplainStep } from '../../editor/explain';
import { useStore } from '../../state/store';
import type { Circuit, CircuitError } from '../../types/circuit';
import type { GridPoint } from '../../types/geometry';

const same = (a: GridPoint, b: GridPoint) => a.boardId === b.boardId && a.x === b.x && a.y === b.y;

/** 規格第 2.1 節：為什麼錯、怎麼改（孔位可以點，畫面移過去；編號和板上的綠色圈一致）。 */
export function ExplanationCard({ circuit, issue }: { circuit: Circuit; issue: CircuitError }) {
  const e = explainIssue(circuit, issue);
  const renderStep = (s: ExplainStep) =>
    s.text.split(/(\{\d+\})/).map((part, i) => {
      const m = /^\{(\d+)\}$/.exec(part);
      const p = m ? s.holes[Number(m[1])] : undefined;
      if (!p) return <span key={i}>{part}</span>;
      const n = e.holes.findIndex((h) => same(h, p)) + 1;
      return (
        <button
          key={i}
          type="button"
          onClick={() => useStore.getState().focusPoints([p])}
          className="mx-0.5 inline-flex items-center gap-1 rounded bg-emerald-900/70 px-1.5 font-mono text-emerald-100 hover:bg-emerald-800"
          title="在麵包板上顯示這個孔"
        >
          <span className="text-[10px] text-emerald-300">{n}</span>
          {holeLabel(circuit, p)}
        </button>
      );
    });
  return (
    <div data-testid="explanation" className="mt-1 space-y-2 rounded border border-emerald-700/60 bg-slate-950/70 px-3 py-2 text-xs leading-6 text-slate-200">
      <p>
        <span className="font-semibold text-emerald-300">為什麼：</span>
        {e.why}
      </p>
      <div>
        <div className="font-semibold text-emerald-300">怎麼改：</div>
        <ol className="list-decimal space-y-1 pl-5">
          {e.steps.map((s, i) => (
            <li key={i}>{renderStep(s)}</li>
          ))}
        </ol>
      </div>
      {e.wires.length > 0 && <p className="text-slate-400">麵包板上的綠色虛線是建議的導線，照著從 1 號孔拉到 2 號孔就可以。</p>}
    </div>
  );
}
```

`PropertyPanel.tsx`：

1. `import { ExplanationCard } from './ExplanationCard';`
2. `CheckTab` 加 `const circuit = useStore((s) => s.circuit);`，`list` 裡的 `<li>` 在按鈕後面加 `{active && <ExplanationCard circuit={circuit} issue={issue} />}`。
3. 屬性分頁 `case 'issue'`：`<IssueList issues={[issue]} />` 後面加 `<ExplanationCard circuit={circuit} issue={issue} />`。

`overlays.tsx` 加入：

```tsx
/** 規格第 2.2 節：建議的孔（綠色虛線圈與編號）、建議的導線（綠色虛線）、建議拔掉的導線（紅色光暈）。 */
export function SuggestionMarks({ frames, circuit, explanation }: { frames: BoardFrame[]; circuit: Circuit; explanation: Explanation }) {
  return (
    <g data-ui="explanation" pointerEvents="none">
      {explanation.removeWireIds.map((id) => {
        const w = circuit.wires.find((x) => x.id === id);
        return w ? <WireGlow key={id} frames={frames} wire={w} color={UI.error} width={0.9} opacity={0.55} /> : null;
      })}
      {explanation.wires.map((path, i) => (
        <PathPreview key={i} frames={frames} path={path} color={UI.ok} valid />
      ))}
      {explanation.holes.map((p, i) => {
        const c = toWorld(frames, p);
        if (!c) return null;
        return (
          <g key={i} data-suggested-hole={holeLabel(circuit, p)}>
            <circle cx={c.x} cy={c.y} r={0.55 * P} fill="none" stroke={UI.ok} strokeWidth={2.4} strokeDasharray={`${0.25 * P} ${0.18 * P}`} />
            <text x={c.x + 0.75 * P} y={c.y - 0.75 * P} fontSize={0.8 * P} fontWeight={700} fill={UI.ok} stroke="#0f172a" strokeWidth={0.15 * P} paintOrder="stroke" textAnchor="middle" dominantBaseline="central">
              {i + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}
```

（需要 import `holeLabel`（`../../editor/analysis`）、`Explanation`（`../../editor/explain`）、`UI`（`../../render/theme`）。）

`BreadboardCanvas.tsx`：

1. import `explainIssue` 與 `SuggestionMarks`。
2. `shownIssues` 之後加：

```ts
  const explanation = useMemo(() => {
    const picked = selection?.kind === 'issue' ? analysis.issues[selection.index] : undefined;
    return picked ? explainIssue(circuit, picked) : null;
  }, [selection, analysis, circuit]);
```

3. `data-ui="over"` 裡畫完 `shownIssues` 之後加 `{explanation && <SuggestionMarks frames={frames} circuit={circuit} explanation={explanation} />}`。

- [ ] **Step 2: 確認** — `npm run typecheck`、`npm test` 全部通過；`npm run dev` 用瀏覽器打開，放一顆沒接 VCC 的 74LS00，點錯誤看到解說卡與綠色標示。

- [ ] **Step 3: Commit 並推送** — `git commit -m "feat(app): explanation card in the check tab and suggested holes on the board"`

---

### Task 6: 端對端測試與文件

**Files:** Create `e2e/explain.spec.ts`；Modify `README.md`、`CHANGELOG.md`、`docs/PROGRESS.md`

- [ ] **Step 1: 寫端對端測試**

```ts
import { expect, test, type Page } from '@playwright/test';

async function centerOf(page: Page, selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 74LS00 跨在凹槽上（第 1 腳 F10），VCC 在 T+3、GND 在 B-3；第 7 腳已接 GND，第 14 腳（VCC）還沒接。 */
const circuit = {
  version: 1,
  boards: [{ id: 'b1', layoutId: 'MB102', x: 0, y: 0, groupId: null }],
  components: [
    { id: 'U1', defId: '74LS00', boardId: 'b1', anchor: { x: 10, y: 11 }, rotation: 0, props: {} },
    { id: 'V1', defId: 'vcc', boardId: 'b1', anchor: { x: 3, y: 2 }, rotation: 0, props: {} },
    { id: 'G1', defId: 'gnd', boardId: 'b1', anchor: { x: 3, y: 18 }, rotation: 0, props: {} },
  ],
  wires: [
    {
      id: 'g1', color: '#212121', source: 'manual',
      start: { boardId: 'b1', x: 16, y: 15 }, end: { boardId: 'b1', x: 16, y: 18 },
      path: [15, 16, 17, 18].map((y) => ({ boardId: 'b1', x: 16, y })),
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-hole]')).toHaveCount(830);
});

test('點一個檢查錯誤看到為什麼與具體孔位，照著接線後錯誤消失', async ({ page }) => {
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'explain.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(circuit)) });
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1);

  await page.getByTestId('check-badge').getByRole('button').click();
  const issue = page.getByRole('button', { name: /第 14 腳 VCC 未連接/ });
  await issue.click();
  const card = page.getByTestId('explanation');
  await expect(card).toContainText('為什麼');
  await expect(card).toContainText('74LS 晶片要從 VCC 腳拿 +5 V');
  await expect(card.getByRole('button', { name: /A10/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /T\+10/ })).toBeVisible();
  await expect(page.locator('[data-suggested-hole="A10"]')).toHaveCount(1);
  await expect(page.locator('[data-suggested-hole="T+10"]')).toHaveCount(1);

  // 照建議從 1 號孔拉到 2 號孔。
  const a = await centerOf(page, '[data-hole="A10"]');
  const b = await centerOf(page, '[data-hole="T+10"]');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /第 14 腳 VCC 未連接/ })).toHaveCount(0);
});
```

- [ ] **Step 2: 執行** — Run: `npx playwright test e2e/explain.spec.ts`（本機加 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`）— Expected: PASS。接著全部 e2e — Expected: 全部 PASS。

- [ ] **Step 3: 文件** — `README.md` 功能表加「點檢查錯誤看解說與建議孔位」、路線圖第 5 列改成「第一部分完成（離線錯誤解說）；接 Claude API 規劃中」；`CHANGELOG.md` 最上面加「子專案 5 第一部分：離線錯誤解說」；`docs/PROGRESS.md` 更新進行中與接下來；規格狀態改「已完成（2026-10-08）」。

- [ ] **Step 4: Commit 並推送** — `git commit -m "test: end-to-end check of error explanations; docs for sub-project 5 part 1"`
