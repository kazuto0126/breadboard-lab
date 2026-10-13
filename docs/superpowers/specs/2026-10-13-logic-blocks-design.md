# 邏輯圖的 5V / 接地與 IC 方塊（子專案 21）設計規格

- 日期：2026-10-13
- 狀態：規格待確認（使用者 2026-10-13 同意方向與 IC 清單）
- 前一份：`2026-10-11-logic-diagram-design.md`（子專案 12）、`2026-10-13-logic-to-breadboard-design.md`（子專案 13）

---

## 0. 目的

使用者 2026-10-13 的需求第 5、6 項：邏輯圖可以放「5V（常數 1）」「接地（常數 0）」，以及照實際 IC 腳名畫成的方塊
（74LS83、74LS151、74LS153、74LS138、74LS85）。方塊的值用現有的 74LS 模擬模型算；轉成麵包板時方塊就是那顆 IC。

## 1. 決定

| 項目 | 決定 |
|---|---|
| 常數 | 新種類 `HIGH`（顯示「5V」）、`LOW`（顯示「GND」）：只有一個輸出腳，2 × 1 格，沒有名稱 |
| 方塊 | 新種類 `BLOCK`，`chip: BlockChip`；輸入腳在左、輸出腳在右，依第 3 節的順序，腳旁寫腳名 |
| 多個輸出 | 線多一個欄位 `fromPin?: number`（輸出腳的序號，預設 0；只有方塊會用到 1 以上） |
| 方塊的值 | 用 `createModel(def.logic)` 算；輸入有 X 時所有輸出是 X；沒接的輸入是 X |
| 真值表 | 常數不是輸入；方塊不是輸出（要看結果就接到輸出端或顯示器） |
| 轉換 | 常數接 +5 V / GND；方塊放那顆 IC，腳依名稱接；方塊沒用到的輸出不接線 |
| 只用 NAND | 一般的閘照樣換成 NAND；方塊保留原本的 IC |
| 不做 | 時序 IC（計數器、正反器）的方塊、自訂方塊、方塊之間的匯流排 |

## 2. 資料（`src/logic/types.ts`）

```ts
export type BlockChip = '74LS83' | '74LS151' | '74LS153' | '74LS138' | '74LS85';
export type NodeKind = GateKind | 'INPUT' | 'OUTPUT' | 'DISPLAY' | 'HIGH' | 'LOW' | 'BLOCK';
export interface LogicNode { ...; chip?: BlockChip }      // 只有 BLOCK
export interface LogicWire { id; from; fromPin?: number; to: { node; pin } }
```

- `isGate` 對新種類回傳 false；新增 `isSource(kind)`：`INPUT`、`HIGH`、`LOW`。
- 訊號名稱：`signalOf(from, fromPin)` = `fromPin` 大於 0 時 `${from}.${fromPin}`，否則 `from`（舊檔案、舊測試不變）。

## 3. 方塊的腳（`src/logic/blocks.ts`）

| IC | 輸入（上到下） | 輸出（上到下） |
|---|---|---|
| 74LS83 4 位元加法器 | A1 A2 A3 A4 B1 B2 B3 B4 C0 | S1 S2 S3 S4 C4 |
| 74LS151 8 選 1 | D0–D7 A B C /G | Y W |
| 74LS153 雙 4 選 1 | 1C0–1C3 2C0–2C3 A B /1G /2G | 1Y 2Y |
| 74LS138 3 對 8 | A B C G1 /G2A /G2B | /Y0–/Y7 |
| 74LS85 4 位元比較器 | A0–A3 B0–B3 IA<B IA=B IA>B | OA<B OA=B OA>B |

- `BLOCK_PINS[chip] = { inputs: string[]; outputs: string[] }`、`BLOCK_NAMES`（元件庫上的中文名稱）。
- 形狀：寬 6 格；高 = max(輸入數, 輸出數) + 1 格；第 k 個輸入腳在 (x, y + k)，第 k 個輸出腳在 (x + 6, y + k)。

## 4. 計算與檢查

- `evaluate`：方塊依拓撲順序算；`nodes` 的鍵用 `signalOf`（方塊第 k 個輸出是 `${id}.${k}`，k = 0 時是 `${id}`）。常數是 0 / 1。
- `topoOrder` 不變（以節點為單位）。
- 檢查：方塊沒接的輸入腳 `LOGIC_INPUT_OPEN`（「方塊 U?（74LS83）的 C0 腳沒有接線」）；方塊一個輸出都沒用到時 `LOGIC_UNUSED`；
  常數沒接到任何地方時 `LOGIC_UNUSED`。

## 5. 編輯與檔案

- `addNode(d, 'BLOCK', x, y, chip)`；ID 前綴：方塊 `b`、常數 `k`。
- `connect(d, from, to, fromPin = 0)`：來源腳要存在；同一個輸入腳只能接一條線（照舊）。
- 刪除、移動、框選、複製貼上照舊（`fromPin` 一起複製）。
- 讀檔：`BLOCK` 要有合法的 `chip`；`fromPin` 必須是整數且小於來源的輸出數。

## 6. 畫面

- 元件庫多兩段：「常數」（5V、GND）、「IC 方塊」（五顆）。
- 畫布：常數畫成小方塊寫「5V」「GND」；方塊畫成方框，上方寫 IC 型號與名稱，左右兩側寫腳名；腳的連線方式和閘一樣（輸出腳 `data-logic-pin="b1:out:k"`）。
- 屬性面板：方塊顯示每個輸出腳目前的值；常數可以切換 5V / GND。

## 7. 轉成麵包板

- 常數：訊號名稱換成 `VCC` / `GND`，閘的輸入、方塊的輸入、輸出端都可以直接接電源。
- 方塊：IC 編號接在一般閘的 IC 後面、74LS47 前面；輸入腳接驅動它的訊號，輸出腳是 `signalOf` 訊號；沒用到的輸出不接。
  電源腳照角色接 VCC / GND。
- `convertProblem`：方塊有沒接的輸入腳時照現有規則擋下（「還有沒接好的腳」）。
- 驗證照舊（真值表逐列模擬比對）。

## 8. 測試

- 單元：腳位與形狀、`signalOf`、`connect` 的 `fromPin`、讀檔（舊檔不變、壞掉的 chip / fromPin 拒絕）、五顆方塊的值（加法、選擇、解碼、比較、X）、
  常數、檢查訊息、轉換（零件、腳位、常數接電源、NAND 模式保留方塊）、驗證（74LS83 做 2 位元加法、74LS151 選擇）。
- 端對端：放 74LS83 方塊與 5V / GND、撥開關看輸出；轉成麵包板比對全部一致。
