# 問 AI（Gemini 追問）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 錯誤解說卡下面加「問 AI」，把電路摘要、錯誤與離線解說連同學生的問題送給 Gemini `gemini-3.5-flash`，串流顯示繁體中文回答，可以接著追問。

**Architecture:** 純函式 `src/editor/explain/brief.ts` 產生電路摘要與第一則訊息；`src/ai/gemini.ts` 動態載入 `@google/genai`，用 `Chat` 串流；
`src/ai/errors.ts` 把錯誤分類成固定文字；`src/state/apiKey.ts` 保存金鑰；`src/state/ai.ts` 是獨立的 Zustand store（金鑰、目前對話、送出 / 停止）；
畫面是 `AskAi.tsx`（解說卡裡）與 `Dialogs.tsx` 的金鑰設定對話框。

**Tech Stack:** TypeScript、React 19、Zustand 5、`@google/genai` ^2.28.0、Vitest 5、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-10-ai-followup-design.md`

## Global Constraints

- 模型 ID `gemini-3.5-flash`；`thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM }`；不設 temperature / topP / topK；不設 `retryOptions`。
- `@google/genai` 版本 `^2.28.0`，只能用動態 `import('@google/genai')` 載入。
- 金鑰存放的 key：`breadboard-lab:gemini-api-key`；預設 `sessionStorage`，勾選記住才放 `localStorage`，兩邊不會同時有。
- `src/editor/` 不能用瀏覽器 API（`tsconfig.json` 沒有 DOM 型別）。
- 介面文字、註解用繁體中文；commit message 用英文；每個任務結束 commit + push，並更新 `CHANGELOG.md` 與 `docs/PROGRESS.md`。
- 推送前跑 `npm run typecheck && npm test`；改畫面時再跑 e2e（本機：`PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" npx playwright test`）。

## Review Focus

1. 用注音 / 倉頡等輸入法打字時，按 Enter 選字不能把問題送出（`isComposing`）。→ Task 4 的 e2e 不容易模擬，改在 `AskAi` 的 `onKeyDown` 明確檢查並在審查時確認。
2. 回答串流途中改了電路（拖元件、Undo）：要停止請求、清掉對話，不能把舊電路的回答留在新電路的卡片上。→ Task 3 測試「drops the conversation when the circuit changes」。
3. 另一個錯誤的對話還在回答時，對新的錯誤發問：舊的要停掉，新的對話要重新帶電路摘要。→ Task 3 測試「starts a new conversation for another issue」。
4. 金鑰換掉之後，不能繼續用舊金鑰的連線。→ Task 3 同一個測試檢查 `setKey` 之後對話清空、下一次重新建立連線。
5. 瀏覽器不允許 `sessionStorage` / `localStorage`（無痕模式設定、file:// 限制）：不能讓設定金鑰整個壞掉。→ Task 3 測試「keeps working in memory when storage is blocked」。

---

### Task 1: 電路摘要與第一則訊息（`brief.ts`）

**Files:**
- Create: `src/editor/explain/brief.ts`
- Test: `tests/editor/brief.test.ts`

**Interfaces:**
- Consumes: `analyzeCircuit`、`holeLabel`（`src/editor/analysis.ts`）；`explainIssue`、`plainText`（`src/editor/explain`）；`colorName`（`src/editor/checklist.ts`）；`formatResistance`、`LED_COLOR_NAMES`（`src/editor/library.ts`）
- Produces:
  - `AI_SYSTEM_INSTRUCTION: string`
  - `circuitBrief(circuit: Circuit): string`
  - `issueBrief(circuit: Circuit, issue: CircuitError): string`
  - `firstMessage(circuit: Circuit, issue: CircuitError, question: string): string`

- [ ] **Step 1: Write the failing test** — `tests/editor/brief.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { AI_SYSTEM_INSTRUCTION, circuitBrief, firstMessage, issueBrief } from '../../src/editor/explain/brief';
import { board, circuit, comp, wire } from '../fixtures/build';

/** 和 explain.test.ts 一樣：74LS00 第 1 腳在 F10，VCC 在 T+3、GND 在 B-3，第 7 腳已接 GND，第 14 腳還沒接。 */
const icCircuit = () => circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3')], [wire('g1', 'J16', 'B-16')]);
const vccIssue = (c: ReturnType<typeof icCircuit>) => validateCircuit(c).find((e) => e.code === 'IC_POWER_MISSING')!;

describe('circuit brief for Gemini', () => {
  it('lists every component pin with its hole, the wires and the nets', () => {
    const text = circuitBrief(icCircuit());
    expect(text).toContain('【電路摘要】');
    expect(text).toContain('麵包板：b1');
    expect(text).toContain('- U1 74LS00 — 四組 2 輸入 NAND 閘');
    expect(text).toContain('第 1 腳 1A @ F10');
    expect(text).toContain('第 7 腳 GND @ F16');
    expect(text).toContain('第 14 腳 VCC @ E10');
    expect(text).toContain('- V1 VCC 5 V');
    expect(text).toContain('- g1：J16 → B-16');
    expect(text).toMatch(/- GND（地）：.*U1 第 7 腳（GND）/);
    expect(text).toMatch(/- GND（地）：.*G1 第 1 腳（GND）/);
    expect(text).toMatch(/沒有和其他腳相連的腳：.*U1 第 14 腳（VCC）/);
  });

  it('adds resistor values, LED colours, wire colours and board ids', () => {
    const c = circuit(
      [comp('R1', 'resistor', 'A20', { props: { resistance: 220 } }), comp('D1', 'led', 'A30', { props: { color: 'green' } }), comp('R2', 'resistor', 'A20', { board: 'b2' })],
      [{ ...wire('w1', 'B20', 'B30'), color: '#d32f2f' }],
      [board('b1'), board('b2', 0, 20)],
    );
    const text = circuitBrief(c);
    expect(text).toContain('麵包板：b1、b2');
    expect(text).toContain('- R1 Resistor 220Ω');
    expect(text).toContain('第 1 腳 @ b1:A20');
    expect(text).toContain('- D1 LED 綠色');
    expect(text).toContain('b2:A20');
    expect(text).toContain('- w1（紅色）：b1:B20 → b1:B30');
  });

  it('says so when there is nothing yet', () => {
    const text = circuitBrief(circuit([]));
    expect(text).toContain('元件：（沒有）');
    expect(text).toContain('導線：（沒有）');
    expect(text).toContain('連在一起的腳（Net）：（沒有）');
  });

  it('describes the issue with the offline steps written as hole names', () => {
    const c = icCircuit();
    const text = issueBrief(c, vccIssue(c));
    expect(text).toContain('【學生正在看的錯誤】');
    expect(text).toContain(vccIssue(c).message);
    expect(text).toContain('為什麼：74LS 晶片要從 VCC 腳拿 +5 V');
    expect(text).toMatch(/1\. .*A10.*T\+10/);
    expect(text).not.toMatch(/\{\d\}/);
  });

  it('puts the brief, the issue and the trimmed question in that order', () => {
    const c = icCircuit();
    const m = firstMessage(c, vccIssue(c), '  為什麼會這樣？ \n');
    expect(m.indexOf('【電路摘要】')).toBe(0);
    expect(m.indexOf('【學生正在看的錯誤】')).toBeGreaterThan(0);
    expect(m.endsWith('【學生的問題】\n為什麼會這樣？')).toBe(true);
    expect(AI_SYSTEM_INSTRUCTION).toContain('繁體中文');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor/brief.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/editor/explain/brief"`.

- [ ] **Step 3: Write minimal implementation** — `src/editor/explain/brief.ts`

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editor/brief.test.ts`
Expected: PASS（5 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/editor/explain/brief.ts tests/editor/brief.test.ts
git commit -m "feat(editor): circuit brief and first message for asking Gemini"
```

---

### Task 2: Gemini 連線與錯誤分類（`gemini.ts`、`errors.ts`）

**Files:**
- Modify: `package.json`、`package-lock.json`（`npm install @google/genai@^2.28.0`）
- Create: `src/ai/errors.ts`、`src/ai/gemini.ts`
- Test: `tests/web/gemini.test.ts`

**Interfaces:**
- Produces:
  - `type AiErrorKind = 'bad-key' | 'rate-limit' | 'busy' | 'network' | 'empty' | 'unknown'`
  - `interface AiError { kind: AiErrorKind; status?: number }`
  - `classifyAiError(error: unknown): AiError`
  - `aiErrorText(error: AiError): string`
  - `GEMINI_MODEL = 'gemini-3.5-flash'`
  - `interface AiSession { send(message: string, signal: AbortSignal): AsyncGenerator<string, void, undefined> }`
  - `createGeminiSession(apiKey: string, systemInstruction: string, fetchImpl?: typeof fetch): Promise<AiSession>`

- [ ] **Step 1: Install the SDK**

Run: `npm install @google/genai@^2.28.0`
Expected: `package.json` 的 dependencies 出現 `"@google/genai": "^2.28.0"`。

- [ ] **Step 2: Write the failing test** — `tests/web/gemini.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { aiErrorText, classifyAiError } from '../../src/ai/errors';
import { createGeminiSession, GEMINI_MODEL } from '../../src/ai/gemini';

const event = (text: string) => `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, index: 0 }] })}\r\n\r\n`;
const sse = (...texts: string[]) => new Response(texts.map(event).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });

/** 先送出 first，之後一直等到請求被停止。 */
function hanging(first: string, signal: AbortSignal | null | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(event(first)));
      signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

interface Call {
  url: string;
  headers: Headers;
  body: { contents: Array<{ role: string; parts: Array<{ text?: string }> }>; systemInstruction?: unknown; generationConfig?: { thinkingConfig?: { thinkingLevel?: string } } };
}

function fakeFetch(replies: Array<(init: RequestInit | undefined) => Response>) {
  const calls: Call[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    return reply(init);
  };
  return { fetch: fn as typeof fetch, calls };
}

async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let text = '';
  for await (const part of stream) text += part;
  return text;
}

/** 套件把串流的每一段各記成一筆 model 內容；比較時把連續同一方的內容接起來。 */
function turns(call: { contents: Array<{ role: string; parts: Array<{ text?: string }> }> }): string[] {
  const out: Array<{ role: string; text: string }> = [];
  for (const c of call.contents) {
    const text = c.parts.map((p) => p.text ?? '').join('');
    const prev = out.at(-1);
    if (prev && prev.role === c.role) prev.text += text;
    else out.push({ role: c.role, text });
  }
  return out.map((t) => `${t.role}:${t.text}`);
}
const open = () => new AbortController().signal;

describe('Gemini session', () => {
  it('streams the answer and sends the model, key, system instruction and thinking level', async () => {
    const f = fakeFetch([() => sse('第一段', '第二段')]);
    const session = await createGeminiSession('test-key', '系統指示', f.fetch);
    expect(await collect(session.send('問題一', open()))).toBe('第一段第二段');
    const [call] = f.calls;
    expect(call.url).toContain(`models/${GEMINI_MODEL}:streamGenerateContent`);
    expect(call.headers.get('x-goog-api-key')).toBe('test-key');
    expect(call.body.systemInstruction).toMatchObject({ parts: [{ text: '系統指示' }] });
    expect(call.body.generationConfig?.thinkingConfig?.thinkingLevel).toBe('MEDIUM');
    expect(turns(call.body)).toEqual(['user:問題一']);
  });

  it('sends earlier turns with the next question and leaves out a stopped turn', async () => {
    const f = fakeFetch([() => sse('答一'), (init) => hanging('答二前半', init?.signal), () => sse('答三')]);
    const session = await createGeminiSession('k', 's', f.fetch);
    expect(await collect(session.send('問一', open()))).toBe('答一');

    const stop = new AbortController();
    const second = session.send('問二', stop.signal);
    expect((await second.next()).value).toBe('答二前半');
    stop.abort();
    await expect(second.next()).rejects.toMatchObject({ name: 'AbortError' });

    expect(await collect(session.send('問三', open()))).toBe('答三');
    expect(turns(f.calls[2].body)).toEqual(['user:問一', 'model:答一', 'user:問三']);
  });

  it('turns HTTP errors into the error kinds the student sees', async () => {
    const json = (status: number, message: string) =>
      new Response(JSON.stringify({ error: { code: status, message, status: 'X' } }), { status, headers: { 'content-type': 'application/json' } });
    const f = fakeFetch([() => json(400, 'API key not valid. Please pass a valid API key.'), () => json(429, 'Resource has been exhausted')]);
    const session = await createGeminiSession('bad', 's', f.fetch);
    const failure = async () => collect(session.send('問', open())).then(() => null, (e: unknown) => e);
    expect(classifyAiError(await failure())).toEqual({ kind: 'bad-key', status: 400 });
    expect(classifyAiError(await failure())).toEqual({ kind: 'rate-limit', status: 429 });
  });
});

describe('AI error kinds', () => {
  const withStatus = (status: number, message = 'x') => Object.assign(new Error(message), { status });

  it('classifies by status code and error type', () => {
    expect(classifyAiError(withStatus(403))).toEqual({ kind: 'bad-key', status: 403 });
    expect(classifyAiError(withStatus(401))).toEqual({ kind: 'bad-key', status: 401 });
    expect(classifyAiError(withStatus(400, 'Invalid JSON payload'))).toEqual({ kind: 'unknown', status: 400 });
    expect(classifyAiError(withStatus(503))).toEqual({ kind: 'busy', status: 503 });
    expect(classifyAiError(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' });
    expect(classifyAiError(new Error('boom'))).toEqual({ kind: 'unknown' });
    expect(classifyAiError(null)).toEqual({ kind: 'unknown' });
  });

  it('has a sentence for every kind and adds the status to unknown errors', () => {
    expect(aiErrorText({ kind: 'bad-key' })).toBe('金鑰不正確或沒有權限，請重新設定。');
    expect(aiErrorText({ kind: 'rate-limit' })).toContain('免費額度每分鐘有次數限制');
    expect(aiErrorText({ kind: 'busy' })).toBe('Gemini 暫時忙碌，請稍後再試。');
    expect(aiErrorText({ kind: 'network' })).toBe('連不上 Gemini，請確認網路。');
    expect(aiErrorText({ kind: 'empty' })).toBe('Gemini 沒有回答這個問題，請換個問法。');
    expect(aiErrorText({ kind: 'unknown', status: 418 })).toBe('Gemini 回傳錯誤，請稍後再試。（狀態碼 418）');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/web/gemini.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/ai/errors"`.

- [ ] **Step 4: Write the implementation** — `src/ai/errors.ts`

```ts
/** 規格第 4 節：問 AI 出錯時的分類。按「停止」造成的中斷不是錯誤，由呼叫的一方自己判斷。 */
export type AiErrorKind = 'bad-key' | 'rate-limit' | 'busy' | 'network' | 'empty' | 'unknown';

export interface AiError {
  kind: AiErrorKind;
  status?: number;
}

/** 依 @google/genai 的 ApiError.status 與錯誤種類分類。 */
export function classifyAiError(error: unknown): AiError {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number') {
    const message = error instanceof Error ? error.message : '';
    if (status === 401 || status === 403 || (status === 400 && /api[ _-]?key/i.test(message))) return { kind: 'bad-key', status };
    if (status === 429) return { kind: 'rate-limit', status };
    if (status >= 500 && status < 600) return { kind: 'busy', status };
    return { kind: 'unknown', status };
  }
  // fetch 連不上（離線、DNS、被擋）時瀏覽器丟出 TypeError。
  if (error instanceof TypeError) return { kind: 'network' };
  return { kind: 'unknown' };
}

const TEXT: Record<AiErrorKind, string> = {
  'bad-key': '金鑰不正確或沒有權限，請重新設定。',
  'rate-limit': '已達使用上限（免費額度每分鐘有次數限制），請稍等一下再問。',
  busy: 'Gemini 暫時忙碌，請稍後再試。',
  network: '連不上 Gemini，請確認網路。',
  empty: 'Gemini 沒有回答這個問題，請換個問法。',
  unknown: 'Gemini 回傳錯誤，請稍後再試。',
};

export function aiErrorText(error: AiError): string {
  return error.kind === 'unknown' && error.status !== undefined ? `${TEXT.unknown}（狀態碼 ${error.status}）` : TEXT[error.kind];
}
```

`src/ai/gemini.ts`

```ts
/** 規格 1、3.3：問 AI 用的模型。 */
export const GEMINI_MODEL = 'gemini-3.5-flash';

export interface AiSession {
  /** 送出一則訊息，逐段產生回答文字。中途停止或出錯的那一輪不會留在對話紀錄裡（套件的 Chat 只記完整的回答）。 */
  send(message: string, signal: AbortSignal): AsyncGenerator<string, void, undefined>;
}

/**
 * 建立一段對話。@google/genai 在第一次發問時才載入（約 450 KB），網站開啟速度不受影響。
 * fetchImpl 只給測試注入假的回應。
 */
export async function createGeminiSession(apiKey: string, systemInstruction: string, fetchImpl?: typeof fetch): Promise<AiSession> {
  const { GoogleGenAI, ThinkingLevel } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey, ...(fetchImpl ? { httpOptions: { fetch: fetchImpl } } : {}) });
  const config = { systemInstruction, thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } };
  const chat = ai.chats.create({ model: GEMINI_MODEL, config });
  return {
    async *send(message, signal) {
      // 每一則都要帶完整的 config：傳了 config 就不會再用建立時的那一份。
      const stream = await chat.sendMessageStream({ message, config: { ...config, abortSignal: signal } });
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield text;
      }
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/web/gemini.test.ts`
Expected: PASS（5 tests）。若套件送出的欄位名稱和測試不同（例如 `generationConfig` 的位置），以套件實際送出的格式為準修改測試，並記一條 Ruling。

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: 沒有錯誤。

```bash
git add package.json package-lock.json src/ai tests/web/gemini.test.ts
git commit -m "feat(ai): Gemini chat session and error kinds"
```

---

### Task 3: 金鑰保存與問 AI 的狀態（`apiKey.ts`、`ai.ts`）

**Files:**
- Create: `src/state/apiKey.ts`、`src/state/ai.ts`
- Test: `tests/web/ai.test.ts`

**Interfaces:**
- Consumes: `AI_SYSTEM_INSTRUCTION`、`firstMessage`（Task 1）；`classifyAiError`、`AiError`（Task 2）；`createGeminiSession`、`AiSession`（Task 2）；`useStore`（`src/state/store.ts`）
- Produces:
  - `interface StoredKey { key: string; remembered: boolean }`
  - `loadApiKey(): StoredKey | null`、`saveApiKey(key: string, remember: boolean): boolean`、`clearApiKey(): void`、`API_KEY_STORAGE = 'breadboard-lab:gemini-api-key'`
  - `interface AiMessage { role: 'user' | 'model'; text: string; state?: 'streaming' | 'done' | 'stopped' | 'failed' }`
  - `interface AiChat { circuit: Circuit; issue: CircuitError; messages: AiMessage[]; sending: boolean; error: AiError | null }`
  - `useAi`：`{ key: StoredKey | null; chat: AiChat | null; setKey(key, remember); clearKey(); ask(circuit, issue, question): Promise<void>; stop() }`

- [ ] **Step 1: Write the failing test** — `tests/web/ai.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { API_KEY_STORAGE, clearApiKey, loadApiKey, saveApiKey } from '../../src/state/apiKey';
import { useAi } from '../../src/state/ai';
import { initialState, useStore } from '../../src/state/store';
import { circuit, comp, wire } from '../fixtures/build';

const h = vi.hoisted(() => ({
  sent: [] as string[],
  keys: [] as string[],
  script: null as null | ((message: string, signal: AbortSignal) => AsyncGenerator<string>),
}));

vi.mock('../../src/ai/gemini', () => ({
  GEMINI_MODEL: 'gemini-3.5-flash',
  createGeminiSession: async (apiKey: string) => {
    h.keys.push(apiKey);
    return {
      send(message: string, signal: AbortSignal) {
        h.sent.push(message);
        return h.script!(message, signal);
      },
    };
  },
}));

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

/** 回答 parts 之後一直等，直到按停止（或電路改變）才中斷。 */
function untilStopped(...parts: string[]) {
  return async function* (_m: string, signal: AbortSignal) {
    yield* parts;
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  };
}

const icCircuit = () => circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3')], [wire('g1', 'J16', 'B-16')]);
const ai = () => useAi.getState();
const last = () => ai().chat!.messages.at(-1)!;

let c = icCircuit();
let issues: ReturnType<typeof validateCircuit> = [];

beforeEach(() => {
  vi.stubGlobal('window', { sessionStorage: memoryStorage(), localStorage: memoryStorage() });
  h.sent.length = 0;
  h.keys.length = 0;
  h.script = async function* () {
    yield '答';
    yield '案';
  };
  c = icCircuit();
  useStore.setState({ ...initialState(), circuit: c });
  issues = validateCircuit(c);
  useAi.setState({ key: { key: 'k1', remembered: false }, chat: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API key storage', () => {
  it('keeps the key in the tab unless asked to remember it, and clears both', () => {
    expect(loadApiKey()).toBeNull();
    expect(saveApiKey('abc', false)).toBe(true);
    expect(window.sessionStorage.getItem(API_KEY_STORAGE)).toBe('abc');
    expect(window.localStorage.getItem(API_KEY_STORAGE)).toBeNull();
    expect(loadApiKey()).toEqual({ key: 'abc', remembered: false });

    saveApiKey('abc', true);
    expect(window.sessionStorage.getItem(API_KEY_STORAGE)).toBeNull();
    expect(window.localStorage.getItem(API_KEY_STORAGE)).toBe('abc');
    expect(loadApiKey()).toEqual({ key: 'abc', remembered: true });

    clearApiKey();
    expect(loadApiKey()).toBeNull();
  });

  it('keeps working in memory when storage is blocked', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('blocked');
      },
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    });
    expect(saveApiKey('abc', false)).toBe(false);
    expect(loadApiKey()).toBeNull();
    expect(() => clearApiKey()).not.toThrow();
    ai().setKey('  abc  ', true);
    expect(ai().key).toEqual({ key: 'abc', remembered: true });
  });
});

describe('asking Gemini about an issue', () => {
  it('sends the circuit brief with the first question only and streams the answer', async () => {
    await ai().ask(c, issues[0], '  為什麼會這樣？ ');
    expect(h.sent[0]).toMatch(/^【電路摘要】/);
    expect(h.sent[0].endsWith('【學生的問題】\n為什麼會這樣？')).toBe(true);
    expect(ai().chat).toMatchObject({ circuit: c, issue: issues[0], sending: false, error: null });
    expect(ai().chat!.messages).toEqual([
      { role: 'user', text: '為什麼會這樣？' },
      { role: 'model', text: '答案', state: 'done' },
    ]);

    await ai().ask(c, issues[0], '還有呢？');
    expect(h.sent[1]).toBe('還有呢？');
    expect(ai().chat!.messages).toHaveLength(4);
    expect(h.keys).toEqual(['k1']);
  });

  it('does nothing without a key or with an empty question', async () => {
    await ai().ask(c, issues[0], '   ');
    useAi.setState({ key: null });
    await ai().ask(c, issues[0], '為什麼？');
    expect(h.sent).toEqual([]);
    expect(ai().chat).toBeNull();
  });

  it('keeps the partial answer and records the error kind when Gemini fails', async () => {
    h.script = async function* () {
      yield '一半';
      throw Object.assign(new Error('quota'), { status: 429 });
    };
    await ai().ask(c, issues[0], '問');
    expect(last()).toEqual({ role: 'model', text: '一半', state: 'failed' });
    expect(ai().chat).toMatchObject({ sending: false, error: { kind: 'rate-limit', status: 429 } });

    h.script = async function* () {
      yield '好了';
    };
    await ai().ask(c, issues[0], '再問一次');
    expect(ai().chat!.error).toBeNull();
    expect(last()).toEqual({ role: 'model', text: '好了', state: 'done' });
  });

  it('reports an empty answer', async () => {
    h.script = async function* () {};
    await ai().ask(c, issues[0], '問');
    expect(last()).toEqual({ role: 'model', text: '', state: 'failed' });
    expect(ai().chat!.error).toEqual({ kind: 'empty' });
  });

  it('marks the answer as stopped when the student presses stop', async () => {
    h.script = untilStopped('前半');
    const pending = ai().ask(c, issues[0], '問');
    await vi.waitFor(() => expect(last().text).toBe('前半'));
    expect(ai().chat!.sending).toBe(true);
    ai().stop();
    await pending;
    expect(last()).toEqual({ role: 'model', text: '前半', state: 'stopped' });
    expect(ai().chat).toMatchObject({ sending: false, error: null });
  });

  it('drops the conversation when the circuit changes while Gemini is answering', async () => {
    h.script = untilStopped('前半');
    const pending = ai().ask(c, issues[0], '問');
    await vi.waitFor(() => expect(last().text).toBe('前半'));
    useStore.setState({ circuit: circuit([]) });
    await pending;
    expect(ai().chat).toBeNull();
  });

  it('starts a new conversation for another issue, and again after the key changes', async () => {
    expect(issues.length).toBeGreaterThan(1);
    h.script = untilStopped('舊的');
    const first = ai().ask(c, issues[0], '問一');
    await vi.waitFor(() => expect(last().text).toBe('舊的'));

    h.script = async function* () {
      yield '新的';
    };
    await ai().ask(c, issues[1], '問二');
    await first;
    expect(h.sent[1]).toMatch(/^【電路摘要】/);
    expect(ai().chat).toMatchObject({ issue: issues[1], sending: false });
    expect(ai().chat!.messages.map((m) => m.text)).toEqual(['問二', '新的']);

    ai().setKey('k1', true);
    expect(ai().chat).not.toBeNull();
    ai().setKey('k2', false);
    expect(ai().chat).toBeNull();
    await ai().ask(c, issues[1], '問三');
    expect(h.sent[2]).toMatch(/^【電路摘要】/);
    expect(h.keys).toEqual(['k1', 'k1', 'k2']);

    ai().clearKey();
    expect(ai()).toMatchObject({ key: null, chat: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/web/ai.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/state/apiKey"`.

- [ ] **Step 3: Write the implementation** — `src/state/apiKey.ts`

```ts
/**
 * 規格 1：Gemini API 金鑰只存在使用者自己的瀏覽器。預設存在這個分頁（sessionStorage，關掉分頁就忘記），
 * 勾選「在這台電腦記住」才存進 localStorage；兩邊不會同時有。
 */
export const API_KEY_STORAGE = 'breadboard-lab:gemini-api-key';

export interface StoredKey {
  key: string;
  remembered: boolean;
}

type Area = 'sessionStorage' | 'localStorage';

/** 瀏覽器不允許（或 Node 測試沒有 window）時回傳 null。 */
function area(name: Area): Storage | null {
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}

export function loadApiKey(): StoredKey | null {
  try {
    const session = area('sessionStorage')?.getItem(API_KEY_STORAGE);
    if (session) return { key: session, remembered: false };
    const local = area('localStorage')?.getItem(API_KEY_STORAGE);
    if (local) return { key: local, remembered: true };
  } catch {
    // 讀不到就當作沒有金鑰。
  }
  return null;
}

/** 存進瀏覽器；不行時回傳 false（金鑰只留在記憶體，重新整理就沒了）。 */
export function saveApiKey(key: string, remember: boolean): boolean {
  try {
    area(remember ? 'sessionStorage' : 'localStorage')?.removeItem(API_KEY_STORAGE);
    const target = area(remember ? 'localStorage' : 'sessionStorage');
    if (!target) return false;
    target.setItem(API_KEY_STORAGE, key);
    return true;
  } catch {
    return false;
  }
}

export function clearApiKey(): void {
  for (const name of ['sessionStorage', 'localStorage'] as const) {
    try {
      area(name)?.removeItem(API_KEY_STORAGE);
    } catch {
      // 忽略：本來就存不進去。
    }
  }
}
```

`src/state/ai.ts`

```ts
import { create } from 'zustand';
import { classifyAiError, type AiError } from '../ai/errors';
import { createGeminiSession, type AiSession } from '../ai/gemini';
import { AI_SYSTEM_INSTRUCTION, firstMessage } from '../editor/explain/brief';
import type { Circuit, CircuitError } from '../types/circuit';
import { clearApiKey, loadApiKey, saveApiKey, type StoredKey } from './apiKey';
import { useStore } from './store';

export interface AiMessage {
  role: 'user' | 'model';
  text: string;
  /** 只用在 Gemini 的回答：回答中、完整、按停止中斷、出錯中斷。 */
  state?: 'streaming' | 'done' | 'stopped' | 'failed';
}

/** 一段對話屬於「某個電路 + 某個錯誤」（參照比較）；畫面只在兩者都和目前一樣時顯示。 */
export interface AiChat {
  circuit: Circuit;
  issue: CircuitError;
  messages: AiMessage[];
  sending: boolean;
  error: AiError | null;
}

interface AiState {
  key: StoredKey | null;
  chat: AiChat | null;
  setKey(key: string, remember: boolean): void;
  clearKey(): void;
  ask(circuit: Circuit, issue: CircuitError, question: string): Promise<void>;
  stop(): void;
}

/** 目前這段對話在 Gemini 那邊的連線；換對話、換金鑰就丟掉。 */
let link: { circuit: Circuit; issue: CircuitError; session: Promise<AiSession> } | null = null;
let controller: AbortController | null = null;

const sameChat = (chat: AiChat | null, circuit: Circuit, issue: CircuitError): chat is AiChat => !!chat && chat.circuit === circuit && chat.issue === issue;

function forget(): void {
  controller?.abort();
  link = null;
}

/** 規格 1、2、4：問 AI 的金鑰與對話（獨立於主 store，不進 Undo）。 */
export const useAi = create<AiState>((set, get) => ({
  key: loadApiKey(),
  chat: null,

  setKey(key, remember) {
    const value = key.trim();
    if (!value) return;
    saveApiKey(value, remember);
    // 換了金鑰：舊的連線綁著舊金鑰，對話重新開始。只改「記住」就保留對話。
    if (get().key?.key !== value) {
      forget();
      set({ chat: null });
    }
    set({ key: { key: value, remembered: remember } });
  },

  clearKey() {
    clearApiKey();
    forget();
    set({ key: null, chat: null });
  },

  stop() {
    controller?.abort();
  },

  async ask(circuit, issue, question) {
    const text = question.trim();
    const key = get().key?.key;
    const previous = get().chat;
    const same = sameChat(previous, circuit, issue);
    if (!text || !key || (same && previous.sending)) return;

    controller?.abort(); // 另一段對話還在回答：停掉它
    const fresh = !link || link.circuit !== circuit || link.issue !== issue;
    if (fresh) {
      const session = createGeminiSession(key, AI_SYSTEM_INSTRUCTION);
      const mine = { circuit, issue, session };
      link = mine;
      // 套件載入失敗（例如離線）：下一次發問重新建立。
      session.catch(() => {
        if (link === mine) link = null;
      });
    }
    const pending = link!;
    const ctrl = new AbortController();
    controller = ctrl;

    const messages: AiMessage[] = [...(same ? previous.messages : []), { role: 'user', text }, { role: 'model', text: '', state: 'streaming' }];
    set({ chat: { circuit, issue, messages, sending: true, error: null } });

    /** 更新最後一則回答；對話已經被換掉時不動。 */
    const finish = (patch: Partial<AiMessage>, extra: Partial<AiChat> = {}) => {
      const chat = get().chat;
      if (!sameChat(chat, circuit, issue)) return;
      const list = chat.messages.slice();
      list[list.length - 1] = { ...list[list.length - 1], ...patch };
      set({ chat: { ...chat, messages: list, ...extra } });
    };
    const stale = () => useStore.getState().circuit !== circuit;
    // 回答中改了電路：停止這一輪（畫面上這個錯誤可能已經不存在）。
    const unsubscribe = useStore.subscribe((s) => {
      if (s.circuit !== circuit) ctrl.abort();
    });

    let answer = '';
    try {
      const session = await pending.session;
      for await (const delta of session.send(fresh ? firstMessage(circuit, issue, text) : text, ctrl.signal)) {
        if (ctrl.signal.aborted) break;
        answer += delta;
        finish({ text: answer });
      }
      if (ctrl.signal.aborted) throw new DOMException('aborted', 'AbortError');
      if (answer) finish({ state: 'done' }, { sending: false });
      else finish({ state: 'failed' }, { sending: false, error: { kind: 'empty' } });
    } catch (error) {
      if (stale()) {
        if (sameChat(get().chat, circuit, issue)) set({ chat: null });
        if (link === pending) link = null;
      } else if (ctrl.signal.aborted) finish({ state: 'stopped' }, { sending: false });
      else finish({ state: 'failed' }, { sending: false, error: classifyAiError(error) });
    } finally {
      unsubscribe();
      if (controller === ctrl) controller = null;
    }
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/web/ai.test.ts`
Expected: PASS（9 tests）。

- [ ] **Step 5: Full suite, typecheck, commit**

Run: `npm run typecheck && npm test`
Expected: 全部通過。

```bash
git add src/state/apiKey.ts src/state/ai.ts tests/web/ai.test.ts
git commit -m "feat(state): API key storage and the ask-AI conversation state"
```

---

### Task 4: 畫面（`AskAi.tsx`、金鑰對話框、選單）與端對端測試

**Files:**
- Create: `src/components/PropertyPanel/AskAi.tsx`、`e2e/ask-ai.spec.ts`
- Modify: `src/components/PropertyPanel/ExplanationCard.tsx`（卡片最後加 `<AskAi>`）、`src/components/common/Dialogs.tsx`（`AiKeyDialog`）、
  `src/state/store.ts:66`（`Dialog` 加 `'ai-key'`）、`src/components/Toolbar/Toolbar.tsx:200`（「說明」選單）

**Interfaces:**
- Consumes: `useAi`、`AiMessage`（Task 3）；`aiErrorText`（Task 2）；`GEMINI_MODEL`（Task 2）；`useStore().openDialog`
- Produces: `AskAi({ circuit, issue })`；`data-testid="ask-ai"`、`data-ai-message`、`data-testid="ai-error"`、`data-testid="ai-key-status"`

- [ ] **Step 1: Write the failing e2e test** — `e2e/ask-ai.spec.ts`

```ts
import { expect, test, type Page } from '@playwright/test';

/** 和 explain.spec.ts 同一個電路：74LS00 第 14 腳（VCC）還沒接。 */
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

const KEY = 'breadboard-lab:gemini-api-key';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const sse = (...texts: string[]) =>
  texts.map((text) => `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, index: 0 }] })}\r\n\r\n`).join('');

interface Sent {
  url: string;
  key: string | undefined;
  contents: Array<{ role: string; parts: Array<{ text?: string }> }>;
}

/** 攔截送往 Gemini 的請求，回傳假的回答；不會真的連到 Google、不需要真的金鑰。 */
async function fakeGemini(page: Page, reply: (n: number) => { status: number; type: string; body: string }) {
  const sent: Sent[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const headers = await request.allHeaders();
    sent.push({ url: request.url(), key: headers['x-goog-api-key'], contents: request.postDataJSON().contents });
    const r = reply(sent.length);
    await route.fulfill({ status: r.status, headers: { ...CORS, 'content-type': r.type }, body: r.body });
  });
  return sent;
}

async function openVccIssue(page: Page) {
  await page.getByRole('button', { name: '檔案', exact: true }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: '匯入 JSON… Import' }).click()]);
  await chooser.setFiles({ name: 'ask.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(circuit)) });
  await expect(page.locator('g[data-component-id="U1"]')).toHaveCount(1);
  await page.getByRole('button', { name: '電路', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Check Circuit 檢查電路' }).click();
  await page.getByRole('button', { name: /第 14 腳 VCC 未連接/ }).click();
  return page.getByTestId('ask-ai');
}

/** 套件把串流的每一段各記成一筆 model 內容；比較時把連續同一方的內容接起來。 */
function turns(call: { contents: Array<{ role: string; parts: Array<{ text?: string }> }> }): string[] {
  const out: Array<{ role: string; text: string }> = [];
  for (const c of call.contents) {
    const text = c.parts.map((p) => p.text ?? '').join('');
    const prev = out.at(-1);
    if (prev && prev.role === c.role) prev.text += text;
    else out.push({ role: c.role, text });
  }
  return out.map((t) => `${t.role}:${t.text}`);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await expect(page.locator('[data-hole]')).toHaveCount(830);
});

test('設定金鑰後按建議問題、接著打字追問；追問時帶著前一輪的問答', async ({ page }) => {
  const sent = await fakeGemini(page, (n) => ({ status: 200, type: 'text/event-stream', body: n === 1 ? sse('因為 VCC 腳', '沒有接到 +5 V。') : sse('也可以接 B+ 軌。') }));
  const ask = await openVccIssue(page);

  await ask.getByRole('button', { name: '設定 Gemini API 金鑰' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gemini API 金鑰' });
  await expect(dialog.getByRole('link', { name: 'Google AI Studio' })).toHaveAttribute('href', 'https://aistudio.google.com/apikey');
  await dialog.getByLabel('API 金鑰').fill('test-key-123');
  await dialog.getByRole('button', { name: '儲存' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate((k) => [sessionStorage.getItem(k), localStorage.getItem(k)], KEY)).toEqual(['test-key-123', null]);

  await ask.getByRole('button', { name: '為什麼會這樣？' }).click();
  await expect(ask.locator('[data-ai-message="model"]')).toHaveText('Gemini：因為 VCC 腳沒有接到 +5 V。');
  expect(sent[0].url).toContain('models/gemini-3.5-flash:streamGenerateContent');
  expect(sent[0].key).toBe('test-key-123');
  expect(turns(sent[0])).toHaveLength(1);
  expect(turns(sent[0])[0]).toContain('【電路摘要】');
  expect(turns(sent[0])[0]).toContain('第 14 腳 VCC @ E10');
  expect(turns(sent[0])[0]).toMatch(/【學生的問題】\n為什麼會這樣？$/);
  await expect(ask.getByRole('button', { name: '為什麼會這樣？' })).toHaveCount(0);

  const box = ask.getByLabel('問 AI 的問題');
  await box.fill('不想接 T+ 軌可以嗎？');
  await box.press('Enter');
  await expect(ask.locator('[data-ai-message="model"]').nth(1)).toHaveText('Gemini：也可以接 B+ 軌。');
  expect(turns(sent[1]).slice(1)).toEqual(['model:因為 VCC 腳沒有接到 +5 V。', 'user:不想接 T+ 軌可以嗎？']);
  await expect(box).toHaveValue('');
  await expect(ask).toContainText('AI 的回答可能有錯');
});

test('記住金鑰、金鑰錯誤時顯示原因，可以從選單重新設定或清除', async ({ page }) => {
  await fakeGemini(page, () => ({
    status: 400,
    type: 'application/json',
    body: JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }),
  }));
  await page.getByRole('button', { name: '說明', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gemini API 金鑰設定…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gemini API 金鑰' });
  await expect(dialog.getByTestId('ai-key-status')).toHaveText('目前沒有金鑰。');
  await dialog.getByLabel('API 金鑰').fill('wrong-key');
  await dialog.getByLabel('在這台電腦記住（關掉分頁後仍保留）').check();
  await dialog.getByRole('button', { name: '儲存' }).click();
  expect(await page.evaluate((k) => [sessionStorage.getItem(k), localStorage.getItem(k)], KEY)).toEqual([null, 'wrong-key']);

  const ask = await openVccIssue(page);
  await ask.getByRole('button', { name: '有沒有別的改法？' }).click();
  await expect(ask.getByTestId('ai-error')).toContainText('金鑰不正確或沒有權限，請重新設定。');
  await ask.getByRole('button', { name: '重新設定金鑰' }).click();
  await expect(dialog.getByTestId('ai-key-status')).toHaveText('已設定，記在這台電腦。');
  await dialog.getByRole('button', { name: '清除金鑰' }).click();
  await expect(dialog.getByTestId('ai-key-status')).toHaveText('目前沒有金鑰。');
  expect(await page.evaluate((k) => [sessionStorage.getItem(k), localStorage.getItem(k)], KEY)).toEqual([null, null]);
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(ask.getByRole('button', { name: '設定 Gemini API 金鑰' })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" npx playwright test e2e/ask-ai.spec.ts`
Expected: FAIL — `getByTestId('ask-ai')` 找不到。

- [ ] **Step 3: Add the dialog kind and menu entry**

`src/state/store.ts`：

```ts
export type Dialog = 'open' | 'save-as' | 'confirm-new' | 'help' | 'ai-key' | null;
```

`src/components/Toolbar/Toolbar.tsx`（「說明」選單）：

```ts
    [
      'help',
      '說明',
      [
        { label: '操作說明與快捷鍵', shortcut: '?', onClick: run(() => store.openDialog('help')) },
        { label: 'Gemini API 金鑰設定…', onClick: run(() => store.openDialog('ai-key')) },
      ],
    ],
```

- [ ] **Step 4: Write `AskAi.tsx`**

```tsx
import { useState, type KeyboardEvent } from 'react';
import { aiErrorText } from '../../ai/errors';
import { useAi, type AiMessage } from '../../state/ai';
import { useStore } from '../../state/store';
import type { Circuit, CircuitError } from '../../types/circuit';

const SUGGESTED = ['為什麼會這樣？', '有沒有別的改法？', '實體麵包板上要注意什麼？'];
const small = 'rounded px-2 py-1 text-xs disabled:opacity-50';

function Message({ m }: { m: AiMessage }) {
  const model = m.role === 'model';
  // 一個字都沒收到就出錯：只顯示下面的錯誤原因。
  if (model && !m.text && m.state === 'failed') return null;
  return (
    <li data-ai-message={m.role} className={model ? 'text-slate-100' : 'text-slate-300'}>
      <span className={model ? 'text-sky-300' : 'text-slate-400'}>{model ? 'Gemini：' : '你：'}</span>
      <span className="whitespace-pre-wrap">{m.text || (m.state === 'streaming' ? '…' : '')}</span>
      {m.state === 'stopped' && <span className="text-amber-300">（已停止）</span>}
    </li>
  );
}

/** 規格 2.1：錯誤解說卡下面的「問 AI」。 */
export function AskAi({ circuit, issue }: { circuit: Circuit; issue: CircuitError }) {
  const hasKey = useAi((s) => s.key !== null);
  const chat = useAi((s) => (s.chat && s.chat.circuit === circuit && s.chat.issue === issue ? s.chat : null));
  const [draft, setDraft] = useState('');
  const sending = chat?.sending ?? false;
  const openKey = () => useStore.getState().openDialog('ai-key');
  const ask = (question: string) => void useAi.getState().ask(circuit, issue, question);
  const submit = () => {
    if (sending || !draft.trim()) return;
    ask(draft);
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 用輸入法選字時按 Enter 不能送出。
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  };

  return (
    <div data-testid="ask-ai" className="border-t border-slate-700 pt-2">
      <div className="font-semibold text-sky-300">問 AI（Gemini）</div>
      {!hasKey ? (
        <div className="mt-1 space-y-1">
          <p className="text-slate-400">問 AI 需要網路和你自己的 Gemini API 金鑰。</p>
          <button type="button" onClick={openKey} className={`${small} bg-sky-700 text-white hover:bg-sky-600`}>
            設定 Gemini API 金鑰
          </button>
        </div>
      ) : (
        <div className="mt-1 space-y-1.5">
          {chat && (
            <ul className="space-y-1.5">
              {chat.messages.map((m, i) => (
                <Message key={i} m={m} />
              ))}
            </ul>
          )}
          {sending && (
            <div className="flex items-center gap-2 text-slate-400">
              Gemini 回答中…
              <button type="button" onClick={() => useAi.getState().stop()} className={`${small} bg-slate-700 hover:bg-slate-600`}>
                停止
              </button>
            </div>
          )}
          {chat?.error && (
            <p data-testid="ai-error" className="text-red-300">
              {aiErrorText(chat.error)}
              {chat.error.kind === 'bad-key' && (
                <button type="button" onClick={openKey} className={`${small} ml-2 bg-slate-700 text-slate-100 hover:bg-slate-600`}>
                  重新設定金鑰
                </button>
              )}
            </p>
          )}
          {!chat && (
            <div className="flex flex-wrap gap-1">
              {SUGGESTED.map((q) => (
                <button key={q} type="button" onClick={() => ask(q)} className={`${small} bg-slate-800 text-slate-100 hover:bg-slate-700`}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1">
            <textarea
              aria-label="問 AI 的問題"
              rows={2}
              maxLength={500}
              value={draft}
              placeholder={chat ? '接著追問…（Enter 送出，Shift+Enter 換行）' : '自己打字問…（Enter 送出，Shift+Enter 換行）'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              className="min-w-0 flex-1 resize-none rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
            />
            <button type="button" onClick={submit} disabled={sending || !draft.trim()} className={`${small} bg-sky-700 text-white hover:bg-sky-600`}>
              送出
            </button>
          </div>
          {chat && <p className="text-[11px] text-slate-500">AI 的回答可能有錯，請以實際電路和老師的說明為準。</p>}
        </div>
      )}
    </div>
  );
}
```

`ExplanationCard.tsx`：import `AskAi`，在最後一個 `{e.wires.length > 0 && …}` 之後加 `<AskAi circuit={circuit} issue={issue} />`。

- [ ] **Step 5: Write `AiKeyDialog` in `Dialogs.tsx`**

```tsx
function AiKeyDialog() {
  const store = useStore.getState();
  const stored = useAi((s) => s.key);
  const [value, setValue] = useState('');
  const [remember, setRemember] = useState(() => stored?.remembered ?? false);
  const save = () => {
    if (value.trim()) useAi.getState().setKey(value, remember);
    else if (stored && stored.remembered !== remember) useAi.getState().setKey(stored.key, remember);
    store.closeDialog();
  };
  const status = !stored ? '目前沒有金鑰。' : stored.remembered ? '已設定，記在這台電腦。' : '已設定，只保留到關掉這個分頁。';
  return (
    <Modal title="Gemini API 金鑰" onClose={() => store.closeDialog()} width="w-[520px]">
      <div className="space-y-2 text-sm text-slate-300">
        <p>「問 AI」會把目前的電路內容、錯誤說明和你的問題送到 Google Gemini（模型 {GEMINI_MODEL}）。</p>
        <p>
          到{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-sky-300 underline hover:text-sky-200">
            Google AI Studio
          </a>{' '}
          免費申請金鑰。
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">
          <li>免費額度：不用付費，但內容可能被 Google 用來改進產品，請不要在問題裡寫個人資料；每分鐘有次數上限。</li>
          <li>付費金鑰：費用由金鑰擁有人支付，一次追問通常不到新台幣 1 元。</li>
          <li>金鑰只存在這個瀏覽器，只會送到 Google 的 Gemini API。</li>
        </ul>
      </div>
      <label className="mt-3 block text-sm text-slate-300">
        API 金鑰
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={stored ? '已設定（輸入新的金鑰會取代）' : '貼上你的 Gemini API 金鑰'}
          className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        在這台電腦記住（關掉分頁後仍保留）
      </label>
      <p data-testid="ai-key-status" className="mt-1 text-xs text-slate-400">
        {status}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        {stored && (
          <button type="button" className={`${button} mr-auto bg-slate-700 text-red-200 hover:bg-slate-600`} onClick={() => useAi.getState().clearKey()}>
            清除金鑰
          </button>
        )}
        <button type="button" className={`${button} bg-slate-700 hover:bg-slate-600`} onClick={() => store.closeDialog()}>
          取消
        </button>
        <button type="button" className={`${button} bg-sky-600 text-white hover:bg-sky-500`} onClick={save}>
          儲存
        </button>
      </div>
    </Modal>
  );
}
```

加上 import（`useAi` from `../../state/ai`、`GEMINI_MODEL` from `../../ai/gemini`）與 `case 'ai-key': return <AiKeyDialog />;`。

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" npx playwright test e2e/ask-ai.spec.ts`
Expected: PASS（2 tests）。

- [ ] **Step 7: Typecheck, unit tests, full e2e, commit**

Run: `npm run typecheck && npm test`，再跑全部 e2e（含單一 HTML 離線版）。
Expected: 全部通過。

```bash
git add src/components src/state/store.ts e2e/ask-ai.spec.ts
git commit -m "feat(app): ask Gemini follow-up questions on the explanation card"
```

---

### Task 5: 文件

**Files:**
- Modify: `README.md`（功能表「錯誤解說」下面加「問 AI」一列；路線圖子專案 5 改成兩部分都完成）、`CHANGELOG.md`、`docs/PROGRESS.md`、
  `docs/superpowers/specs/2026-10-10-ai-followup-design.md`（狀態改「已完成（日期）」）

- [ ] **Step 1: Update docs** — README 功能表新增：

```markdown
| 問 AI | 在錯誤解說卡下面用白話追問 Google Gemini（gemini-3.5-flash）；需要網路與自己的 Gemini API 金鑰（Google AI Studio 免費申請），金鑰只存在瀏覽器 |
```

路線圖：`| 5 | AI 解說：離線錯誤解說、問 AI（Gemini 追問）已完成 | 完成 |`。CHANGELOG 在「子專案 5 第二部分」區段加「新增」：功能、金鑰、錯誤、測試數量。
PROGRESS：「進行中」寫 PR 待建立、「接下來」第 1 項 GitHub Pages 不變，第 2 項改成「等使用者審查 feat/ai-followup」。

- [ ] **Step 2: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: 通過。

```bash
git add README.md CHANGELOG.md docs
git commit -m "docs: sub-project 5 part 2 (ask Gemini) is done"
```
