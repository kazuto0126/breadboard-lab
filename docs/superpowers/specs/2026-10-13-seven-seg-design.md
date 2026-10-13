# 輸出用 7 段顯示器（子專案 16）設計規格

- 日期：2026-10-13
- 狀態：已完成（2026-10-13）
- 前一份：`2026-10-13-logic-to-breadboard-design.md`（子專案 13）、`2026-10-13-convert-extras-design.md`（子專案 14）

---

## 0. 目的

邏輯圖除了 LED 輸出端，還可以放「7 段顯示器」：4 條訊號當成 BCD 數字，畫面上直接看到 0–9；轉成麵包板時換成 74LS47 解碼器、
共陽極 7 段顯示器與 7 顆限流電阻，和實驗課常做的接法一樣。

## 1. 決定

| 項目 | 決定 |
|---|---|
| 新的元件種類 | `DISPLAY`（7 段顯示器），4 個輸入腳，沒有輸出腳 |
| 腳的順序 | 第 0–3 腳 = A（1）、B（2）、C（4）、D（8），和 74LS47 的 A–D 一樣；畫面上由上到下標 A、B、C、D |
| 名稱 | 和輸出端一樣有名稱（同一套規則、不能和其他名稱重複），預設 `S1`、`S2`… |
| 值 | 輸入都是 0 / 1 時是 0–15；有 X 時是 X |
| 畫面上的數字 | 依 74LS47 的字形（`BCD_GLYPHS`）點亮 a–g；10–15 是 74LS47 實際的怪字形；X 時只亮 g（「–」） |
| 真值表 | 顯示器算一個輸出欄，和輸出端一起依名稱排序；格子裡寫十進位數字（0–15）或 `?` |
| 轉換 | 每個顯示器：1 顆 74LS47、1 個 `7seg-ca`、7 顆 220 Ω 電阻；/LT、/BI/RBO、/RBI、CA 接 +5 V |
| 數量限制 | 一張圖最多 2 個顯示器（轉換時檢查；畫圖時不限制） |
| 不做 | 共陰極、小數點、單獨點亮某一段、顯示器的輸出再接到別的閘 |

## 2. 資料（`src/logic/types.ts`、`shapes.ts`、`file.ts`）

- `NodeKind` 加 `'DISPLAY'`；`isGate` 對它回傳 false。新增 `isSink(kind)`：`OUTPUT` 或 `DISPLAY`（不能當線的來源）。
- `LogicNode.name` 也用在顯示器。
- `inputCountOf`：`DISPLAY` = 4。`nodeSize`：`DISPLAY` 為 4 × 5（輸入腳的位置和 4 輸入閘相同：0、1、3、4 列）。
- `outputPin`：`DISPLAY` 回傳 null。
- `defaultName(d, 'DISPLAY')`：`S1`、`S2`…第一個沒用過的。
- 讀檔：`DISPLAY` 要有合法名稱；不能有 `inputs`、`value`（有也忽略）。線的來源是 `DISPLAY` 時拒絕（「方向不對」）。
- 編輯（`connect`）：來源是 `DISPLAY` 時拒絕，和輸出端一樣。

## 3. 計算（`src/logic/evaluate.ts`）

- 新型別 `OutValue = Bit | number`（number 是 0–15）。
- `evaluate` 多回傳 `displays: Map<string, number | 'X'>`：4 個輸入都是 0 / 1 時算出 A + 2B + 4C + 8D，否則 X。
- `sortedIo` 的 `outputs` 包含 `OUTPUT` 與 `DISPLAY`，一起依名稱排序。
- `truthTable` 的 `rows[].out` 型別改成 `OutValue[]`：輸出端是 0 / 1 / X，顯示器是數字或 X。
- `src/logic/sevenSeg.ts`（新）：`glyphOf(value: number | 'X'): string` 回傳亮的段（`BCD_GLYPHS[value]`，X 回傳 `'g'`）；
  `valueOfSegments(lit: string[]): number | null`：亮的段（不管順序）對回 0–15，對不到回傳 null。

## 4. 檢查（`src/logic/check.ts`）

- 顯示器的每個沒接線的腳：`LOGIC_INPUT_OPEN`，訊息「顯示器 S1 的 C 腳沒有接線，值不確定」。
- 「邏輯圖還沒有輸出端」的判斷把顯示器也算成輸出。
- 顯示器不會有 `LOGIC_UNUSED`。
- `nodeLabel(DISPLAY)` = 「顯示器 S1」。

## 5. 畫面（`src/components/Logic/*`）

- 元件庫多一個「7 段顯示器」，放法和輸出端一樣。
- 畫布：4 × 5 的深色方框，左側 4 個輸入腳標 A、B、C、D，中間畫 7 段（亮的段紅色、不亮的段暗灰色），上方寫名稱。
  畫面上的值跟著輸入端的開關即時更新（和輸出端的燈一樣）。
- 屬性面板：選到顯示器時可以改名稱、刪除，並寫出目前的值（「目前顯示 7（輸入 D C B A = 0 1 1 1）」）。
- 真值表：顯示器欄的格子寫數字或 `?`。

## 6. 轉成麵包板（`src/logic/synth.ts`、`toBreadboard.ts`）

- `convertProblem`：輸出端與顯示器至少一個；顯示器超過 2 個時回傳「7 段顯示器最多 2 個（零件太多，佈線接不完）」。
  顯示器的腳沒接好，照現有規則擋下（「還有沒接好的腳」）。
- 只用 NAND 時，接到顯示器的訊號和接到輸出端的一樣要保留（`toNandUnits` 的 `keep`）。
- 每個顯示器 k（依名稱排序，k = 1、2）：
  - `U?`：74LS47，和其他 IC 一起排在 IC 那一列（寬 8 欄），放在所有邏輯閘 IC 後面。
    A、B、C、D 腳接顯示器第 0–3 腳的訊號；VCC、GND 接電源；/LT、/BI/RBO、/RBI 接 +5 V。
  - `DS{k}`：`7seg-ca`，放在輸出那一區、跨過凹槽（寬 5 欄）；兩個 CA 腳接 +5 V；`labels: [名稱]` 顯示在顯示器上方。
  - 7 顆 220 Ω 電阻 `R?`：74LS47 的 /a–/g → 電阻 → 顯示器的 a–g；和 LED 的電阻一樣兩個一組放在 A 列與 J 列。
  - 腳號都從元件定義依腳名查（`/a`…、`a`…、`A`…、`/LT`、`/BI/RBO`、`/RBI`、`CA`），不寫死。
- `ConvertResult` 多 `displays: Record<string, string>`（顯示器節點 id → `DS?`）；`Bom` 多 `displays: number`；
  `ics` 照常把 74LS47 算進去，電阻數包含顯示器的 7 顆。
- 自動選板時，有顯示器就直接用 EIC-1106（實作時試過：MB-102 放得下，但 AI 佈線排不完）；EIC-1106 也放不下時回傳現有的「零件太多」訊息。
  使用者指定 MB-102 時照樣轉換，佈線排不完時照現有規則（store 自動改用 EIC-1106）。
- 轉換預覽（`ToBreadboardDialog`）的零件清單多一行「7 段顯示器 × n（共陽極）」。
- 7 段顯示器可以加名稱：`labelSlots` 對 `seven-seg` 回傳 1；屬性面板出現「顯示器名稱」輸入框；畫面在顯示器上方顯示名稱。

## 7. 驗證（`src/logic/verifyBreadboard.ts`）

- `VerifyMap` 多 `displays?: Record<string, string>`。
- 每列真值表：顯示器的實際值 = `valueOfSegments(litSegments[DS?])`；對不到字形時寫 `?`。
- 比對時每個輸出欄各自比較字串（輸出端 `0` / `1`、顯示器十進位數字）；`verifyText` 的說明照樣列出「S1 = 7」這種格式。
- 預期值是 X（`?`）的欄照現有做法：麵包板上的值不會是 `?`，所以算不一致 —— 但轉換前已經擋下沒接好的腳，實際上不會出現。

## 8. 範例（`src/logic/examples.ts`）

「BCD 顯示」：輸入端 W、X、Y、Z（W 是最高位元）直接接到顯示器 S1 的 D、C、B、A。真值表 16 列，0–9 是數字、10–15 是 74LS47 的怪字形。
轉成麵包板後驗證全部一致。

## 9. 測試

- 單元：形狀與腳位、讀檔（合法、來源是顯示器時拒絕）、`connect` 拒絕、`evaluate` 的值（含 X）、真值表欄位與排序、
  `glyphOf` / `valueOfSegments`（0–15 來回、X、對不到）、檢查訊息、`convertProblem`（超過 2 個）、
  `toBreadboard`（零件清單、74LS47 的控制腳接 +5 V、電阻兩端的訊號、`labels`、NAND 模式保留訊號）、
  `verifyBreadboard`（BCD 範例 16 列全部一致；把一顆電阻的訊號改錯時找出不一致）、`labelSlots`。
- 端對端：放一個顯示器、接 4 個輸入端、撥開關看到數字改變；載入 BCD 範例轉成麵包板，轉換結果卡片寫「全部一致」。

## 10. 之後

- 整次佈線的 AI 總說明、老師提供金鑰（清單上剩下的兩項）。
- 共陰極顯示器（74LS48）、多位數顯示。
