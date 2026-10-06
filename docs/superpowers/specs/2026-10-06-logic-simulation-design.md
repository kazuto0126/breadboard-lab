# 子專案 4：74LS 數位邏輯模擬 設計規格

- 日期：2026-10-06
- 狀態：已完成（2026-10-06）
- 來源需求：`digitaldesigned.md` 第三十二章（MVP 完成後加入 74LS Logic Simulation）、第三十五章 Phase 11、第三十七章（Clock）
- 前置：子專案 1 核心引擎、子專案 2 Web App（皆已完成）

---

## 0. 目的與成功標準

學生在網頁上接好電路後，按「▶ 模擬」就能像在實驗桌上一樣操作：撥指撥開關、按按鈕、讓時脈跑起來，
看 LED 有沒有亮、每隻腳是 HIGH 還是 LOW，在插實體麵包板之前先確認電路邏輯正確。

**成功標準**：

1. 20 顆 74LS IC 都有依 datasheet 寫的邏輯模型，每顆都有真值表 / 時序的單元測試。
2. 3 個範例電路模擬結果正確：驗收電路的 LED 亮；74LS93 計數器每按一次按鈕 LED 顯示的二進位數加 1；
   74LS283 加法器的 LED 顯示「A + B」的結果。
3. 模擬引擎與佈線引擎一樣是**不依賴 DOM 的純函式**、結果確定、可以在 Node 測試。
4. 模擬只依「實際插在麵包板上的連接」計算：導線只有端點導電、導通群組、元件內部導通、開關的開合。

---

## 1. 範圍

**包含**：IC 邏輯模型（JSON `logic` 欄位 + TypeScript 行為模型）、模擬引擎、時脈元件（Clock）、
畫面上的模擬模式（LED 發光、腳位 / 導線端點的電位顏色、直接在板上撥開關與按按鈕、時脈的開始 / 暫停 / 單步 / 重置）。

**不包含**：類比模擬（電壓、電流值）、傳播延遲與時序違規、Logic Analyzer / 示波器、真值表自動產生
（留給之後；架構上保留每次 settle 的完整結果，可以接上去）。

---

## 2. 已確認的決策

| 項目 | 決定 |
|---|---|
| 邏輯值 | 輸入讀到的值：`0`、`1`、`X`（衝突 / 未知）。節點電位：`0`、`1`、`Z`（浮接）、`X` |
| TTL 輸入浮接 | 讀成 `1`（74LS 的實際行為；Check Circuit 也會警告 `INPUT_FLOATING`） |
| 電阻 | 弱連接：一端沒有強驅動時，取另一端的值（上拉、下拉、LED 限流電阻都適用） |
| LED | 陽極電位為 `1` 且陰極電位為 `0` 時發光；LED 不傳遞電位 |
| IC 供電 | VCC 腳電位為強驅動的 `1`、GND 腳為強驅動的 `0` 才會運作；否則輸出浮接並標示「未供電」 |
| 開關 | 指撥開關第 k 個開關 ON 時把腳 k 與腳 n+1−k 接通；按鈕按下時把腳 1–2 與腳 3–4 兩組接通 |
| 時序 | 零延遲、事件迭代到穩定（最多 100 輪）；超過代表電路在震盪，標示「不穩定」 |
| 上電狀態 | 所有正反器、計數器從 0 開始（實體 IC 是隨機的，模擬取 0 方便學生理解）；「重置」回到上電狀態 |
| 編輯 | 模擬中鎖定結構編輯（放置、移動、接線、刪除），可以選取、查看、撥開關、按按鈕；Undo 仍可用 |
| 開關狀態 | 撥指撥開關會寫回元件的 `switchStates`（可 Undo、會存檔）；按鈕是瞬間的，不存檔 |

---

## 3. 邏輯模型（`ComponentDefinition.logic`）

邏輯以「模型名稱 + 腳位名稱對應」寫在元件 JSON 中，TypeScript 只實作少數幾種通用模型。
新增 IC 時，若行為屬於既有模型（例如 74LS10 三組 3 輸入 NAND → `gates`），只需要新增 JSON。

訊號的極性用 `{ "pin": "/CLR", "active": "low" }` 表示（pin 為腳位名稱）。

| 模型 | 參數 | 使用的 IC |
|---|---|---|
| `gates` | `gates: [{ op, in: [...], out }]`，op ∈ and / or / nand / nor / xor / xnor / not / buf | 00、02、04、08、32、86 |
| `decoder` | `units: [{ select: [LSB…], enable: [極性…], outputs: [...], outputActive }]` | 138、154 |
| `dff` | `flipflops: [{ d, clock, q?, qn?, preset?, clear? }]`、`load?: [極性…]`（全部有效才載入）、`outputEnable?: [極性…]`（否則輸出 Z）；上升緣觸發 | 74、173、174、175、273 |
| `ripple-counter` | `stages: [{ clock, modulus, outputs: [LSB…] }]`、`presets: [{ when: [極性…], values: [每段的值] }]`（先列的優先）；下降緣觸發 | 90、93 |
| `sync-counter` | `outputs`、`data`、`clock`、`clear: { 極性, mode: async \| sync }`、`load`、`enable: [極性…]`、`carry: { output, enable }`；上升緣觸發 | 161、163 |
| `updown-counter` | `outputs`、`data`、`up`、`down`、`clear`、`load`、`carry`、`borrow` | 193 |
| `adder` | `a`、`b`（LSB 在前）、`carryIn`、`sum`、`carryOut` | 283 |
| `transceiver` | `a`、`b`、`direction: { pin, aToB: high \| low }`、`enable` | 245 |

`parseDefinition` 會驗證：模型名稱已知、參數齊全、所有腳位名稱都存在於 `pins` 中。

X 的處理：AND 類有 0 就是 0、OR 類有 1 就是 1，否則只要有 X 就是 X；正反器在觸發時 D 為 X 則 Q 變 X；
計數器的控制腳為 X 時整個計數值變 X。X 只會出現在短路或輸出互接時（Check Circuit 已報錯）。

---

## 4. 時脈元件 `clock`

| id | 封裝 | 腳位 | 預設屬性 |
|---|---|---|---|
| `clock` | single | 1：CLK（output） | `frequency`：1（Hz，可選 0.5 / 1 / 2 / 5 / 10） |

新增元件類別 `clock`（編號前綴 `CLK`）。它是訊號來源而不是電源：Check Circuit 把它當作 output
（接到 VCC / GND 或其他輸出會報 `OUTPUT_CONFLICT`）。

---

## 5. 模擬引擎（`src/core/simulation/`）

```ts
compileSimulation(circuit): SimCircuit          // 依電路參照快取；電路一改就重新編譯
initialSimState(sim): SimState
settle(sim, state, inputs): { state: SimState; result: SimResult }

interface SimInputs {
  pressed: Record<string, boolean>;             // 按鈕 componentId → 是否按下
  clocks: Record<string, 0 | 1>;                // 時脈 componentId → 目前電位
}

interface SimResult {
  stable: boolean;
  iterations: number;
  groupLevels: Record<string, Level>;           // 導通群組 ID → 電位
  pinLevels: Record<string, Level>;             // `${componentId}#${pin}` → 電位
  litLeds: string[];
  unpowered: string[];                          // 沒有供電的 IC
  conflicts: string[];                          // 電位為 X 的導通群組
}
```

**編譯**：

1. 靜態節點：以 union-find 合併「導線兩端的群組」與「元件內部導通的腳位群組」（與 `extractNets` 相同）。
2. 可切換的連接：指撥開關每個開關、按鈕，記錄兩端節點。
3. 強驅動：`vcc-source` → 1、`gnd-source` → 0、時脈、IC 輸出。
4. 弱連接：每顆電阻的兩端節點。
5. IC：依 `logic` 建立模型實例，記錄每個腳位名稱對應的節點與 VCC / GND 節點。
6. LED：陽極、陰極節點。

**settle**（每次輸入改變時呼叫）：

```text
依目前開關狀態把靜態節點再合併一次
重複（最多 100 輪）：
  解析每個節點的電位：強驅動合併（不一致 → X）→ 沒有強驅動的節點沿電阻一層一層取鄰居的值 → 都沒有則 Z
  所有 IC 用同一份節點電位求值（輸入 Z 讀成 1）；循序電路比較上一次的輸入找出時脈邊緣
  輸出都沒變 → 穩定，結束
```

所有 IC 在同一輪讀同一份電位（Jacobi 式），結果與 IC 的順序無關。

---

## 6. 畫面

- 工具列：「▶ 模擬」開始；模擬中顯示「■ 停止」「⏸ 暫停 / ▶ 繼續時脈」「⏭ 單步」「↺ 重置」。
- 麵包板：
  - LED 發光（亮色圓頂 + 光暈）。
  - IC 腳片、導線端點依電位上色：1 = 亮綠、0 = 深灰、Z = 藍、X = 紅。
  - 未供電的 IC 顯示「未供電」。
  - 直接點指撥開關的小開關切換 ON / OFF；在按鈕上按住 = 按下、放開 = 放開。
- 狀態提示：模擬時間、時脈頻率、不穩定（震盪）與未供電的 IC。
- 滑鼠提示與右側面板顯示孔位 / 腳位 / Net 的電位；腳位表多一欄電位。

時脈以 25 ms 為一個 tick 推進模擬時間，每個時脈的電位 = ⌊時間 × 2f⌋ mod 2；有時脈改變才重新 settle。
「單步」把時間推進到下一個時脈邊緣。

---

## 7. 測試

| 範圍 | 方式 |
|---|---|
| 邏輯模型 | 每顆 IC 依 datasheet 的真值表 / 功能表測試：閘、解碼器致能、正反器的 preset / clear / 邊緣、計數器的計數 / 重置 / 載入 / 進位、收發器方向與致能、加法器 |
| 元件資料 | 20 顆 IC 都有 `logic`；`parseDefinition` 擋下未知模型、缺少參數、不存在的腳位名稱 |
| 模擬引擎 | 開關接通、電阻上拉 / 下拉、浮接讀 1、未供電、輸出衝突為 X、SR 閂鎖保持狀態、環形振盪器判定不穩定 |
| 範例電路 | 驗收電路 LED 亮；計數器按 1–16 次的 LED 狀態；加法器數組 A + B |
| 端對端 | 開啟加法器範例 → 模擬 → 在板上撥開關 → LED 顯示正確的和 |
