# 從題目產生邏輯圖（子專案 25）設計規格

- 日期：2026-10-17
- 狀態：已完成（2026-10-17；使用者 2026-10-17 同意做這一項；照使用者的習慣直接做、做完再看，下面的決定都是 Claude 的判斷）
- 前一份：`2026-10-17-truth-table-task-design.md`（子專案 24，真值表題目）
- 出處：`docs/ideas/backlog.md`「從題目產生邏輯圖」

---

## 0. 目的

子專案 24 可以輸入真值表題目，但邏輯圖還是要自己畫。這個子專案在「題目」分頁加上：

1. 每個輸出化簡後的布林式（積項和，例如 X = AB + AC + BC），讓學生對照自己的化簡；
2. 「產生邏輯圖」按鈕：照化簡結果畫出 AND–OR 邏輯圖（輸入在左、NOT、AND、OR、輸出在右），
   之後可以直接用原本的「轉成麵包板」接到麵包板上。

## 1. 決定

| 項目 | 決定 |
|---|---|
| 化簡方法 | Quine–McCluskey 找出所有質項，再挑最少項（同樣項數時字母最少）的組合；X（不在乎）可以拿來合併，但不必蓋到 |
| 布林式寫法 | 積項和；畫面上反相用上橫線（課本寫法），文字（測試、說明）用 `A'`；常數寫 0 或 1 |
| 邏輯圖的結構 | 兩層 AND–OR：需要反相的輸入各一個 NOT（各輸出共用）；同一個積項在不同輸出共用同一個 AND；只有一個字母的積項直接接；只有一項的輸出不用 OR |
| 閘的輸入數 | 編輯器的閘最多 4 個輸入：超過 4 個字母的積項、超過 4 項的輸出改用好幾個閘串起來 |
| 常數輸出 | 輸出全是 0 → 接 GND 常數；化簡結果是 1 → 接 5V 常數 |
| 名稱 | 輸入端、輸出端用題目的名稱；題目沒用到的輸入也放（輸入端要和題目一致才能比對） |
| 版面 | 依層分欄：輸入端一欄、NOT 一欄、之後每一層閘一欄、輸出端最右；每欄依前面接過來的線的位置排序（減少交叉），元件之間空一格 |
| 已經有邏輯圖時 | 按鈕寫「產生邏輯圖（取代目前的）」，直接取代；可以 Undo 回去 |
| 不做（之後再說） | 和積式（OR–AND）、只用 NAND / NOR 的產生（轉成麵包板時已經可以選只用 NAND）、多輸出一起化簡、MCP 工具 |

## 2. 化簡（`src/logic/minimize.ts`，純函式）

```ts
/** 一個積項：mask 的位元是被消掉的變數；value 是其他變數的值。位元 n−1−i 對應第 i 個輸入（第一個輸入是最高位元）。 */
export interface Term { value: number; mask: number }

export function primeImplicants(n: number, ones: number[], dontCares: number[]): Term[];
export function minimalCover(n: number, ones: number[], primes: Term[]): Term[];
export function minimize(n: number, ones: number[], dontCares: number[]): Term[];
export function literalsOf(term: Term, names: string[]): Array<{ name: string; negated: boolean }>;
export function sopText(terms: Term[], names: string[]): string; // 「AB + A'C」、「0」、「1」
```

- 挑組合：先拿必要質項，剩下的用分支限界找最少項（再比字母數）；搜尋步數超過上限時用目前找到最好的（一開始先用貪心法得到一個解）。
- 結果依積項在真值表裡的位置排序，輸出穩定。

## 3. 產生邏輯圖（`src/logic/design.ts`）

`designFromTask(task: TruthTask): { diagram: LogicDiagram; terms: Term[][] }`

- 依第 1 節的結構建立節點與線，題目放在 `diagram.task`。
- 版面依第 1 節；產生的圖要能通過讀檔檢查（`parseLogicDiagram`：不重疊、輸入數合法）。
- 產生的圖和題目比對（`compareDiagramToTask`）一定全部一致；沒有迴圈、沒有沒接的閘輸入，可以直接轉成麵包板。

## 4. 畫面（題目分頁）

在表格與「1 的列」下面、「和邏輯圖比對」上面加一段「化簡（積項和）」：

- 每個輸出一行：`X = AB + AC + BC`（反相用上橫線）。
- 按鈕「產生邏輯圖」（已經有邏輯圖時是「產生邏輯圖（取代目前的）」）：換成產生的邏輯圖（一個 Undo 步驟「從題目產生邏輯圖」），
  畫面縮放到看得到整張圖。

## 5. 測試

- 單元（`tests/logic/minimize.test.ts`）：多數決、XOR（不能合併）、用 X 化簡、常數 0 / 1、文字寫法；
  隨機題目（固定亂數種子，1–6 個輸入，含 X）：化簡結果在每個 1 都是 1、每個 0 都是 0；項數不比各別最小項多。
- 單元（`tests/logic/design.test.ts`）：多數決產生的圖（閘的種類與數量、名稱）、共用 NOT 與 AND、超過 4 個字母或 4 項的串接、
  常數輸出；隨機題目產生的圖都能通過讀檔檢查、和題目全部一致、可以轉成麵包板（`convertProblem` 沒有問題）。
- 端對端（`e2e/truth-table-task.spec.ts` 加一個）：建立題目 → 看到布林式 → 產生邏輯圖 → 「和邏輯圖比對」全部一致 → Undo 回到空白。
