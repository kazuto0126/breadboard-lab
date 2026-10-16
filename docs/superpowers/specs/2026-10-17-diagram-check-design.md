# 依名稱對照邏輯圖檢查麵包板（子專案 22）設計規格

- 日期：2026-10-17
- 狀態：已完成（2026-10-17；使用者 2026-10-17 同意設計：題目來源是「照邏輯圖接麵包板」，對應方式是「依名稱」）
- 前一份：`2026-10-13-logic-to-breadboard-design.md`（子專案 13，第 7 節的比對）、`2026-10-13-convert-extras-design.md`（子專案 14，開關與 LED 的名稱）
- 出處：`docs/ideas/backlog.md`「對照題目檢查麵包板」

---

## 0. 目的

實驗課常見的流程是「照邏輯圖接麵包板」。學生自己手接的麵包板，只要把開關、LED、7 段顯示器標上和邏輯圖一樣的名稱，
「檢查」分頁就自動逐列模擬、和邏輯圖的真值表比對；不一致時點那一列，開關會撥成那一列並開始模擬，直接在板上看哪裡不對。

現在的比對卡只認得「從邏輯圖轉換來的麵包板」（靠轉換時記下的對應）。改成依名稱對應後，轉換來的麵包板（轉換時已經自動填好名稱）
和手接的麵包板用同一套比對。

## 1. 決定

| 項目 | 決定 |
|---|---|
| 正確答案 | 同一個專案裡的邏輯圖（它的真值表） |
| 對應方式 | 依名稱：邏輯圖的輸入端 ↔ 同名的指撥開關（某一個開關）；輸出端 ↔ 同名的 LED；7 段顯示器 ↔ 同名的 7 段顯示器 |
| 名稱比對 | 去掉前後空白後完全相同（大小寫有別） |
| 開關 ON 代表 1 還是 0 | 看接線：開關一邊接到 +5 V（Net 是電源）→ ON = 1；一邊接到 GND → ON = 0 |
| 沒對應到的開關 | 維持目前的狀態 |
| 一列的結果 | LED 亮 = 1、不亮 = 0；7 段顯示器讀亮的段對回數字 |
| 不一致時 | 點那一列：開關撥成那一列（一個復原步驟），並開始模擬 |
| 舊的比對卡 | 換成這張卡；store 的 `conversion` 不再需要，移除 |
| 不做 | 按鈕當輸入（按鈕還不能命名）、時序電路、直接輸入真值表當題目、名稱不分大小寫 |

## 2. 對應（`src/logic/diagramCheck.ts`，純函式）

```ts
export interface SwitchBinding {
  node: string;      // 邏輯圖輸入端的 id
  switchId: string;  // 指撥開關元件 id
  index: number;     // 第幾個開關（0 起算）
  onIs: 0 | 1;       // 撥 ON 時輸入是 1 還是 0
}
export interface Bindings {
  inputs: SwitchBinding[];          // 依名稱排序（和真值表的輸入欄同一順序）
  leds: Record<string, string>;     // 輸出端 id → LED id
  displays: Record<string, string>; // 顯示器 id → 7 段顯示器 id
}
export function bindByLabels(d: LogicDiagram, circuit: Circuit): { bindings: Bindings; issues: string[]; matched: number };
```

- 找名稱：指撥開關第 k 個開關是 `props.labels[k]`；LED、7 段顯示器是 `props.labels[0]`。
- 開關的兩隻腳：第 k 個開關（0 起算）是第 k + 1 腳和第 n − k 腳（n 是腳數）。用 `analyzeCircuit` 的 Net 種類判斷：
  一邊是 `power` → `onIs = 1`；一邊是 `ground` → `onIs = 0`。
- `matched`：找到同名零件的輸入端、輸出端、顯示器個數（用來決定要不要只顯示提示）。
- `issues`（依這個順序列出）：
  - 「輸入 C：找不到名稱是 C 的開關」「輸出 X：找不到名稱是 X 的 LED」「顯示器 S1：找不到名稱是 S1 的 7 段顯示器」
  - 「名稱 A 用在好幾個開關：SW1 第 1 個、SW2 第 3 個」「名稱 X 用在好幾顆 LED：D1、D3」（7 段顯示器同理）
  - 「SW1 第 1 個開關（A）沒有接到 +5 V 或 GND」；兩邊都接電源時「SW1 第 1 個開關（A）兩邊都接到電源」

## 3. 比對（`src/logic/verifyBreadboard.ts`、`src/logic/diagramCheck.ts`）

- `verifyRows(d, circuit, bindings): VerifyResult`：真值表每一列——對應到的開關撥成「該列的值 === onIs」，其他開關不動——模擬一次，
  讀 LED 與顯示器。結果格式和現在的 `VerifyResult` 一樣。
- 現有的 `verifyBreadboard(d, circuit, switchTo, map)` 改成把參數換成 `Bindings` 再呼叫 `verifyRows`（測試沿用）。
- `checkAgainstDiagram(d, circuit): DiagramCheck`：

```ts
export type DiagramCheck =
  | { kind: 'none' }                                  // 不顯示
  | { kind: 'hint' }                                  // 只顯示一行提示
  | { kind: 'incomplete'; issues: string[] }          // 還不能比對
  | { kind: 'done'; bindings: Bindings; result: VerifyResult; outputs: string[]; inputs: string[]; mapping: string };
```

  - `none`：麵包板沒有元件；或邏輯圖算不出真值表（空的、有迴圈、輸入超過 8 個）；或邏輯圖沒有輸入端或沒有輸出端（含顯示器）。
  - `hint`：一個同名的零件都沒有（`matched === 0`）。
  - `incomplete`：有 `issues`；或真值表裡有不確定的輸出（「邏輯圖有些輸出不確定（還有沒接好的腳），先把邏輯圖接好」）。
  - `done`：逐列比對的結果；`mapping` 是「A → SW1 第 1 個開關（ON = 1）、X → D1」這樣的說明。

## 4. 畫面（`src/components/PropertyPanel/DiagramCheckCard.tsx`）

- 放在「檢查」分頁最上面（取代 `ConversionCard`），`data-testid="diagram-check"`；用目前的電路與邏輯圖即時計算。
- `done` 全部一致：綠色，「和邏輯圖的真值表比對」+「8 種輸入組合，麵包板的模擬結果和真值表全部一致」+ 小字的對應說明。
- `done` 有不一致：紅色，「有 N 列不一致」，下面每一列一個按鈕（最多 8 列，再多寫「還有 N 列」）：
  「A B C = 0 1 1：應該 X = 1，麵包板 X = 0」（`data-mismatch-row`）。點了執行第 5 節的動作。
- `incomplete`：琥珀色，「還不能和邏輯圖比對」+ 每個問題一行 + 「點開關或 LED，在屬性面板的『名稱』輸入邏輯圖上的名稱」。
- `hint`：灰色一行「可以和邏輯圖比對：把開關、LED 的名稱設成邏輯圖上的名稱（例如 A、B、X）」。
- `none`：不顯示。

## 5. Store

- `applyDiagramRow(inputs: SwitchBinding[], bits: Array<0 | 1>)`：把對應的開關撥成那一列（一個復原步驟，「把開關撥成 A = 0、B = 1」）；
  沒有在模擬、也沒有在佈線時開始模擬。撥開關不是結構編輯，模擬中也可以做。
- 移除 `conversion`（型別、初始值、載入時清空、`convertLogic` 寫入）。

## 6. 測試

- 單元（`tests/logic/diagramCheck.test.ts`）：
  - 手接的 XOR（74LS86、兩個開關接 +5 V 標 A、B，LED 標 X）→ 全部一致；LED 改接到別的腳 → 列出不一致的列。
  - 開關接 GND（ON = 0）的接法也判斷得出來、比對一致。
  - 缺名稱、名稱重複、開關沒接電源 → 對應的 `issues`；一個名稱都沒有 → `hint`；邏輯圖空的 / 麵包板空的 → `none`；
    邏輯圖有沒接好的腳 → `incomplete`。
  - 邏輯圖轉成麵包板（多數決，開關接 +5 V 與 GND、只用 NAND；BCD 顯示）→ 依名稱比對全部一致。
- store（`tests/web/`）：`applyDiagramRow` 撥好開關、一個復原步驟、開始模擬；`convertLogic` 不再寫 `conversion`。
- 端對端：轉換後比對一致（現有測試改用新的 `data-testid`）；把 LED 的名稱改掉 → 顯示「找不到名稱是 X 的 LED」，改回來 → 一致；
  在邏輯圖把一個閘換種類 → 回到麵包板出現不一致的列，點一列 → 開始模擬、開關撥成那一列。

## 7. 之後

- 按鈕可以命名、當輸入；直接輸入真值表當題目（`docs/ideas/backlog.md`）。
