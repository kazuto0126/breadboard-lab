# 新元件與 IC 腳位圖（子專案 9）設計規格

- 日期：2026-10-11
- 狀態：已完成（2026-10-11）
- 來源：使用者 2026-10-10 的新需求第 3 項「點選 IC 在右上方顯示該 IC 的腳位圖」、第 7 項「元件新增 74LS83 74LS11 74LS21 74LS47 74LS73 74LS76 74LS85 74LS151 74LS153 四腳 NE555F 7 段式 LED」
- 前提：子專案 6–8（PR #7–#9）；這個分支接在 `feat/ic-placement` 後面

---

## 0. 目的

實驗課常用的晶片都能放上麵包板、照真的腳位接線、按「▶ 模擬」看到正確的結果；接線時點一下 IC 就能看到腳位圖，不用另外翻資料表。

## 1. 使用者的決定

| 項目 | 決定 |
|---|---|
| 腳位圖的位置 | 右邊「屬性」面板最上面（不蓋住麵包板） |
| NE555 的頻率 | 在屬性裡設頻率（像現在的時脈元件）；另外新增電容元件，讓板上能擺出完整的實體電路，模擬不看電容 |
| 7 段顯示器 | 只做共陽極（配 74LS47） |
| NE555 的腳數 | 查不到 4 腳的 NE555；用一般的 8 腳 DIP（每邊 4 腳），NE555F 是 Philips 的 8 腳 555 |

## 2. 新元件

### 2.1 IC（元件類別 `ic`，DIP，腳位照原廠資料表）

| 元件 | 腳數 | 腳位（第 1 腳起） | 模擬模型 |
|---|---|---|---|
| 74LS11 三組 3 輸入 AND | 14 | 1A 1B 2A 2B 2C 2Y GND 3Y 3A 3B 3C 1Y 1C VCC | `gates`（`and` 三個輸入） |
| 74LS21 兩組 4 輸入 AND | 14 | 1A 1B NC 1C 1D 1Y GND 2Y 2A 2B NC 2C 2D VCC | `gates`（`and` 四個輸入） |
| 74LS83 4 位元全加器 | 16 | A4 S3 A3 B3 VCC S2 B2 A2 S1 A1 B1 GND C0 C4 S4 B4 | `adder`（和 74LS283 同樣的腳名） |
| 74LS73 雙 JK 正反器（清除） | 14 | 1CLK 1/CLR 1K VCC 2CLK 2/CLR 2J 2/Q 2Q 2K GND 1Q 1/Q 1J | 新 `jkff` |
| 74LS76 雙 JK 正反器（預設、清除） | 16 | 1CLK 1/PRE 1/CLR 1J VCC 2CLK 2/PRE 2/CLR 2J 2/Q 2Q 2K GND 1/Q 1Q 1K | 新 `jkff` |
| 74LS85 4 位元比較器 | 16 | B3 IA<B IA=B IA>B OA>B OA=B OA<B GND B0 A0 B1 A1 A2 B2 A3 VCC | 新 `comparator` |
| 74LS151 8 選 1 多工器 | 16 | D3 D2 D1 D0 Y W /G GND C B A D7 D6 D5 D4 VCC | 新 `mux` |
| 74LS153 雙 4 選 1 多工器 | 16 | /1G B 1C3 1C2 1C1 1C0 1Y GND 2Y 2C0 2C1 2C2 2C3 A /2G VCC | 新 `mux` |
| 74LS47 BCD 轉 7 段解碼器 | 16 | B C /LT /BI/RBO /RBI D A GND /e /d /c /b /a /g /f VCC | 新 `bcd7seg` |
| NE555 計時器 | 8 | GND TRIG OUT /RESET CONT THRES DISCH VCC | 新 `timer555` |

腳位名稱以 `/` 開頭的是低電位有效。NE555 的 TRIG、CONT、THRES、DISCH 是 `passive`（接電容、電阻，模擬不讀）；74LS21 的 NC 腳是 `nc`。

### 2.2 新的邏輯模型

- **`jkff`**：每個正反器 `{ j, k, clock, q, qn, preset?, clear? }`。時脈**下降緣**動作：JK = 00 保持、01 → 0、10 → 1、11 反相。
  預設、清除是非同步、低電位有效；兩個同時有效時 Q 與 /Q 都是 1（和現有 `dff` 相同的處理）。
- **`comparator`**（74LS85）：A、B 各 4 位元（LSB 在前）與三個串接輸入。A > B → OA>B = 1、其他 0；A < B → OA<B = 1、其他 0；
  相等時 OA=B = IA=B、OA>B = (IA=B 與 IA<B 都是 0)、OA<B = (IA=B 與 IA>B 都是 0)（資料表的串接真值表）。
- **`mux`**：每個單元 `{ select, data, enable, output?, outputN? }`（選擇線 LSB 在前）。致能時 Y = data[選擇值]、W = 反相；不致能時 Y = 0、W = 1。
- **`bcd7seg`**（74LS47）：輸入 DCBA（A 是 LSB）。輸出低電位有效、開集極：亮 → 0，不亮 → Z（斷開）。
  優先順序：/BI 為 0 → 全暗；/LT 為 0 → 全亮；/RBI 為 0 且輸入是 0 → 全暗；否則照資料表的 0–15 字形：
  0 abcdef、1 bc、2 abdeg、3 abcdg、4 bcfg、5 acdfg、6 cdefg、7 abc、8 abcdefg、9 abcfg、10 deg、11 cdg、12 bfg、13 adfg、14 defg、15 全暗。
  /BI/RBO 當成輸入 /BI（不模擬 RBO 輸出）。
- **`timer555`**：有供電、/RESET 不是 0 時，OUT 是一個方波（頻率 = 元件屬性 `frequency`，預設 1 Hz，從 LOW 開始）；/RESET 為 0 時 OUT = 0。
  實作：編譯模擬時替每顆 NE555 建一個虛擬節點當振盪器，登記在 `SimCircuit.clocks`（和時脈元件一樣由模擬時間驅動、單步也會停在它的邊緣），
  模型讀虛擬腳 `~OSC`。

`parseLogic` 要驗證新模型的欄位與腳位名稱，和現有模型相同。

### 2.3 7 段顯示器（新類別 `seven-seg`）

- 共陽極 10 腳，DIP 兩排間距 6 格（0.6 吋，跨凹槽）：1 e、2 d、3 CA、4 c、5 dp、6 b、7 a、8 CA、9 f、10 g。CA 兩腳內部相通。
- 角色：CA 是 `anode`、各段是 `cathode`。
- 模擬：某段亮 = CA 的電位是 1、那一段的腳是 0（和 LED 一樣，電位可以經過電阻傳過來）。`SimResult` 加
  `litSegments: Record<元件 ID, 段名[]>`（依 a b c d e f g dp 的順序）。
- 畫法：深色本體、一個「8.」字形，亮的段畫紅色、不亮的畫暗紅；腳和 IC 一樣畫在兩排。
- Check Circuit：
  - CA 接到 GND → `LED_REVERSED`。
  - 有接線的段，那一段的 Net 和 CA 的 Net 都沒有電阻 → `LED_NO_RESISTOR`（每個顯示器一則，列出哪幾段）。
  - 沒用到的段（例如 dp）不報「腳未連接」；CA 沒接才報。
- 不會被子專案 8 搬動（它是輸出）。

### 2.4 電容（新類別 `capacitor`）

- `capacitor-ceramic`（陶瓷，不分極性）與 `capacitor-electrolytic`（電解，第 1 腳 +、第 2 腳 −），兩腳元件，預設跨 2 格、最少 1 格。
- 屬性 `capacitance`（法拉）。元件庫預設：陶瓷 0.01 µF、0.1 µF；電解 1 µF、10 µF、100 µF。屬性面板顯示容量（例如「10 µF」），可以改。
- 模擬當成斷路（不影響任何電位）。畫法：陶瓷是橘色圓片，電解是藍色圓筒、負極側有白色條紋。

### 2.5 元件庫

- IC 區改名「IC（74LS、NE555）」，依數字排序（NE555 排在最前）。
- LED 區改名「LED 與顯示器」，加 7 段顯示器。
- 新增「電容」區。

### 2.6 NE555 的屬性

- 和時脈元件一樣的頻率欄位。
- 下面附說明：「實際頻率由外接元件決定：f ≈ 1.44 ÷ ((R1 + 2 × R2) × C)。例：R1 = 1 kΩ、R2 = 68 kΩ、C = 10 µF → 約 1 Hz。」

## 3. 腳位圖

- 選取 IC（含 NE555）或 7 段顯示器，或選取它們的某一隻腳時，右邊「屬性」面板最上面顯示腳位圖（`data-testid="pinout"`）。指撥開關不顯示。
- 方向和它插在板上的方向一樣：旋轉 0 度時缺口在左、第 1 腳在左下；轉 180 度時缺口在右、第 1 腳在右上。
- 每隻腳：號碼與名稱；VCC 紅色、GND 藍灰色、NC 灰色；名稱以 `/` 開頭的畫成上面一條橫線（例如 Y0 上面一條線）。
- 點一隻腳 → 選取那隻腳（板上會出現圓圈，下面的屬性換成那隻腳）；腳位圖仍然顯示，那隻腳加框。
- 模擬中，每隻腳旁邊的圓點用現有的電位顏色（`LEVEL_COLORS`）。
- 7 段顯示器另外畫一個小「8.」標出 a–g、dp 的位置。
- 版面計算放在 `src/editor/pinout.ts`（純函式，可以測試），畫面在 `src/components/PropertyPanel/PinoutDiagram.tsx`。

## 4. 範例電路

- 「74LS47 + 7 段顯示器」：4 位元指撥開關輸入 BCD，74LS47 經 7 顆電阻推動 7 段顯示器，顯示 0–9。
- 「NE555 時脈 + 74LS93 計數器」：NE555（1 Hz）接 74LS93 的 CKA，QA–QD 經電阻點亮 4 顆 LED；R1、R2、C 照標準無穩態接法擺上。

兩個範例都要能用「AI 標準佈線」佈完（`tests/routing/examples.test.ts` 自動涵蓋），Check Circuit 沒有錯誤。

## 5. 測試與驗收

- 每個新 IC：依真值表測模型（`tests/simulation/models.test.ts` 或新檔）；每個 JSON 能被元件庫載入（現有測試）。
- 74LS47 + 7 段顯示器：撥出 0–9，`litSegments` 和字形表相同；/LT、/BI、/RBI 的行為。
- NE555：模擬時間前進時 OUT 依頻率翻轉；/RESET 接 GND 時 OUT 一直是 0；推動 74LS93 時計數會增加。
- 7 段顯示器的 Check Circuit 規則：沒有電阻、CA 接 GND、dp 沒接不報。
- 腳位圖的版面：0 / 180 度的排列、橫線、顏色分類（`tests/editor/pinout.test.ts`）。
- 端對端：放一顆 74LS47 → 屬性面板出現腳位圖、有「VCC」與第 16 腳；點第 8 腳 → 屬性換成第 8 腳、腳位圖那隻腳加框。

## 6. 不做

- 共陰極顯示器、74LS48。
- 依實際接的電阻、電容算 NE555 的頻率；NE555 的單穩態接法。
- 電解電容接反的檢查、74LS47 的 RBO 輸出。
- 多位數的 7 段顯示器。
