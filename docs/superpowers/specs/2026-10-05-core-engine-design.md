# 子專案 1：核心引擎 設計規格

- 日期：2026-10-05
- 狀態：待使用者審閱
- 來源需求：`digitaldesigned.md`（以下稱「需求文件」）
- 所屬總計畫：麵包板標準佈線 AI 工具，共 5 個子專案，本文件只涵蓋子專案 1

---

## 0. 目的與成功標準

**使用者**：數位邏輯實驗課的學生。上課前先在網頁上規劃接線，再照著插實體麵包板。

**本子專案要交付的東西**：一個沒有畫面的 TypeScript 核心引擎，負責：

1. 用資料描述 MB-102 麵包板的孔位、板面與導通關係。
2. 用 JSON 描述元件，並算出元件放在板上時佔用哪些孔、擋住哪些格點。
3. 從「元件 + 使用者導線」分析出電氣 Net。
4. 檢查電路錯誤（Check Circuit）。
5. 依 Net 重新決定所有導線，排出符合標準麵包板佈線規則的結果（AI 標準佈線的計算核心）。
6. 對任何一組導線評分（Routing Score）。

**成功標準**：

- 排出的每一條線都**實際插得出來**：只走水平和垂直、不重疊、不穿過元件、端點都在空孔上。
- 引擎**絕對不會**輸出違規或改變電氣關係的線。排不出來時，明確回報 "No valid routing solution." 和失敗原因。
- 同樣的輸入，一定得到同樣的輸出。
- 需求文件第三十三章的 Test 1–6 全部用自動測試驗證。

---

## 1. 範圍

**包含**：第 0 節列出的 6 項、20 顆 74LS IC 的**腳位資料**、通用元件定義、ASCII 預覽工具（`npm run demo`）。

**不包含（屬於後續子專案）**：

| 項目 | 子專案 |
|---|---|
| 畫面、互動、Undo/Redo、存檔/讀檔介面、動畫、Compare 畫面、Web Worker 包裝 | 2 |
| 多麵包板吸附、群組、群組座標系 | 3 |
| 74LS 邏輯模擬、`logic` 欄位內容 | 4 |
| 串接大型語言模型的 AI 解說 | 5 |

---

## 2. 已確認的決策

| 項目 | 決定 |
|---|---|
| 麵包板版型 | MB-102：63 欄 × A–J；每欄 A–E 導通、F–J 導通；中央凹槽 |
| 電源軌 | 上下各 2 條，每條 50 孔全長導通，共 4 組 |
| 孔位標示 | 照實體板：`A1`–`E1` 為同一組（需求文件第四章「A1–A5 同組」的寫法以實體板為準） |
| 自動佈線的權限 | 只保留「哪些導通群組要連在一起」。導線數量、端點孔、串接方式全部由引擎重新決定。**不移動元件** |
| 導線實體模型 | 平貼板面的跳線。線蓋住的孔不能再用；共用同一段或在轉彎點/端點相遇＝重疊（禁止）；在同一格點垂直直穿＝交叉（允許但重罰） |
| 導線的導電部位 | 只有兩個端點導電，中間外有絕緣皮 |
| 電源 | VCC、GND 是插在孔上的端子；DC Power 是一組 +/− 兩腳端子 |
| 輸入開關 | 指撥開關（DIP Switch），4 位元與 8 位元兩種 |
| 佈線演算法 | 協商式擁塞佈線（PathFinder 式的拆線重排）＋多起點多終點 A* |
| AI 角色 | 本子專案只做規則式分析，不串接 LLM |
| 確定性 | 全程不使用亂數 |

---

## 3. 架構

### 3.1 技術

- TypeScript（`strict: true`），測試用 Vitest，示範程式用 `tsx` 執行。
- 核心程式**不得依賴 DOM 或瀏覽器 API**，必須能直接在 Node 與 Web Worker 執行。
- 所有輸入輸出都是可以直接 `JSON.stringify` 的純資料，不使用 class 實例或 `Map` 當對外格式。

### 3.2 目錄

```text
src/
  types/                 共用介面
  data/components/
    generic/             resistor、led、vcc、gnd、dc-power、dipsw-4、dipsw-8、pushbutton
    74ls/                20 顆 IC 腳位資料，一顆一個 JSON
  core/
    breadboard/          版型資料、buildBoard、孔位命名、導通群組
    circuit/             footprint 計算、節點狀態、Net 分析、電路檢查
    routing/             A*、Net 樹建構、協商迴圈、合法性檢查、評分、套用結果
  index.ts               對外 API
tests/
  fixtures/              固定測試電路（用 TypeScript 建構函式產生純資料 Circuit，可直接 JSON 化）
scripts/
  demo.ts                ASCII 預覽
```

### 3.3 依賴方向

`routing` → `circuit` → `breadboard` → `types`。只能往下依賴，不能反向，也不能跨層循環。`data` 只放資料。

### 3.4 資料流

```text
Circuit（boards、components、wires）
  → extractNets()        Net[]
  → validateCircuit()    CircuitError[]
  → autoRoute()          RoutingResult（新 Wire[]、metrics、score、failedNets）
  → applyRouting()       新的 Circuit（只在 success 時允許）
```

---

## 4. 麵包板模型

### 4.1 格子

- 一格 = 0.1 吋（2.54 mm）。板面座標 `x ∈ [1, 63]`、`y ∈ [1, 18]`，共 1134 個格點。
- 每個格點是 `hole`（孔）或 `surface`（板面，沒有孔）。兩種都可以讓導線經過；只有 `hole` 能插元件腳或當導線端點。
- 相鄰關係只有上下左右四個方向。導線不可能走斜線。
- 導線不能離開板面範圍。

### 4.2 MB-102 版型（`MB102_LAYOUT`）

| y | 內容 | 種類 |
|---|---|---|
| 1 | 電源軌 `T-` | x = 3–7, 9–13, 15–19, 21–25, 27–31, 33–37, 39–43, 45–49, 51–55, 57–61 為 hole，其餘為 surface |
| 2 | 電源軌 `T+` | 同上 |
| 3 | 電源軌與中央區之間的空隙 | surface |
| 4–8 | 排 A、B、C、D、E | 全部 hole |
| 9–10 | 中央凹槽 | surface |
| 11–15 | 排 F、G、H、I、J | 全部 hole |
| 16 | 空隙 | surface |
| 17 | 電源軌 `B+` | 同 y = 1 |
| 18 | 電源軌 `B-` | 同 y = 1 |

孔數：中央區 63 × 10 = 630，電源軌 4 × 50 = 200，合計 830。

版型是資料。`buildBoard(layout, boardId)` 會從版型產生板子模型，之後要加 400 孔等版型時，只需要新增版型資料。

### 4.3 命名與 ID

| 種類 | 格式 | 例子 |
|---|---|---|
| 格點 ID（含 surface） | `{boardId}:{x},{y}` | `b1:12,4` |
| 孔位名稱（給人看） | 中央區 `{排}{欄}`；電源軌 `{軌}{欄}` | `A12`、`T+12`、`B-30` |
| 完整孔位名稱 | `{boardId}:{孔位名稱}` | `b1:A12` |
| 導通群組 ID | 中央區 `{boardId}:c{欄}-top` / `-bot`；電源軌 `{boardId}:rail-{軌}` | `b1:c12-top`、`b1:rail-T+` |

`holeName(board, point)` 與 `parseHoleName(board, name)` 必須能互相轉換（孔位名稱要知道版型才能解析，所以都帶 board）。`B12`（B 排）和 `B+12`（下方 + 軌）靠 `+`/`-` 區分。

### 4.4 導通群組

- 中央區：每欄 A–E 一組、F–J 一組，共 126 組。
- 電源軌：4 組，各 50 孔。
- 合計 130 組。surface 格點不屬於任何群組。

### 4.5 靜態與動態分開

- `Breadboard`（板子模型）建好之後**不會再變**，只記錄格點的座標、種類和所屬群組。
- 需求文件第二章要求的節點狀態（是否被佔用、插了哪隻腳、接了哪條線、能不能走線），由 `getNodeState(circuit, point)` 根據目前的電路**即時計算**，不寫回板子模型。

---

## 5. 元件

### 5.1 元件定義

```ts
interface ComponentDefinition {
  id: string;                    // 例如 "74LS00"、"resistor"
  name: string;
  category: "ic" | "resistor" | "led" | "vcc" | "gnd" | "dc-power" | "dip-switch" | "pushbutton";
  package: PackageSpec;
  pins: PinDefinition[];
  internalConnections: number[][];   // 內部永遠導通的腳位組，例如 [[1, 2], [3, 4]]
  defaultProps: ComponentProps;
  logic: null;                       // 子專案 4 才填
}

interface PinDefinition {
  number: number;
  name: string;
  role: "input" | "output" | "bidir" | "power" | "ground" | "nc"
      | "passive" | "anode" | "cathode" | "vcc-source" | "gnd-source";
}

type PackageSpec =
  | { type: "dip"; pinCount: number; rowSpacing: 3 | 6 }
  | { type: "two-lead"; defaultSpan: number; minSpan: number; blocksBetween: boolean }
  | { type: "single" }
  | { type: "tactile4" };
```

### 5.2 Footprint（旋轉 0° 時，以 anchor 為原點的相對座標）

座標系的 y 軸朝下。旋轉角度以順時針為正，每轉 90° 的轉換是 `(dx, dy) → (−dy, dx)`。

| 封裝 | 腳位 | 擋住的格點 |
|---|---|---|
| `dip`（n 腳，間距 s） | 腳 1 … n/2：`(i, 0)`，i = 0 … n/2−1；腳 n/2+1 … n：`(n/2−1−j, −s)`，j = 0 … n/2−1 | 矩形 `x ∈ [0, n/2−1]`、`y ∈ [−s, 0]` 內的所有格點 |
| `two-lead`（間距 span） | 腳 1：`(0, 0)`；腳 2：`(span, 0)` | `blocksBetween` 為 true 時，兩腳之間的格點 |
| `single` | 腳 1：`(0, 0)` | 無 |
| `tactile4` | 腳 1 `(0, 0)`、腳 2 `(0, −3)`、腳 3 `(2, 0)`、腳 4 `(2, −3)` | 矩形 `x ∈ [0, 2]`、`y ∈ [−3, 0]` |

標準放法的例子：

- 0.3 吋 DIP：anchor 在 F 排（y = 11），另一排腳落在 E 排（y = 8），本體蓋住凹槽。
- 0.6 吋 DIP（74LS154）：anchor 在 H 排（y = 13），另一排腳落在 D 排（y = 7）。

### 5.3 通用元件

| id | 封裝 | 腳位 | 預設屬性 |
|---|---|---|---|
| `resistor` | two-lead，span 預設 4、最小 1，擋中間 | 1、2：passive | `resistance`：220 / 330 / 470 / 1k / 2.2k / 4.7k / 10k / 100k，預設 1k |
| `led` | two-lead，span 預設 1、最小 1，不擋 | 1：anode、2：cathode | `color`：red / green / yellow / blue |
| `vcc` | single | 1：vcc-source | `voltage`：5 |
| `gnd` | single | 1：gnd-source | — |
| `dc-power` | two-lead，span 預設 1、最小 1，不擋 | 1：vcc-source（+）、2：gnd-source（−） | `voltage`：5 |
| `dipsw-4` | dip，8 腳，間距 3 | 全部 passive；第 k 個開關接在腳 k 與腳 9−k 之間 | `switchStates`：4 個 false |
| `dipsw-8` | dip，16 腳，間距 3 | 全部 passive；第 k 個開關接在腳 k 與腳 17−k 之間 | `switchStates`：8 個 false |
| `pushbutton` | tactile4 | 全部 passive；`internalConnections: [[1, 2], [3, 4]]` | — |

指撥開關的 ON/OFF 狀態**不影響** Net 分析與佈線，只給子專案 4 的邏輯模擬使用。

### 5.4 74LS IC（只有腳位資料）

| IC | 封裝 | VCC 腳 | GND 腳 |
|---|---|---|---|
| 74LS00、02、04、08、32、74、86 | DIP14，0.3 吋 | 14 | 7 |
| 74LS90、93 | DIP14，0.3 吋 | 5 | 10 |
| 74LS138、161、163、173、174、175、193、283 | DIP16，0.3 吋 | 16 | 8 |
| 74LS245、273 | DIP20，0.3 吋 | 20 | 10 |
| 74LS154 | DIP24，**0.6 吋** | 24 | 12 |

腳位名稱與角色依 TI / Motorola datasheet 逐腳建立。74LS90、93 的 NC 腳標為 `nc`；74LS245 的 A、B 埠標為 `bidir`。

### 5.5 元件實例

```ts
interface ComponentInstance {
  id: string;
  defId: string;
  boardId: string;
  anchor: { x: number; y: number };    // 腳 1 所在格點
  rotation: 0 | 90 | 180 | 270;
  span?: number;                        // 只有 two-lead 會用；不能小於 minSpan
  props: ComponentProps;                // 覆寫 defaultProps
}
```

腳位位置一律由 `resolveFootprint(instance, definition)` 計算，不另外存。旋轉不設限制；放錯的情況（例如 IC 轉 90° 導致兩排腳在同一群組）交給電路檢查報錯。

### 5.6 佔用規則

- 一個孔只能插一隻腳，或當一條導線的端點，兩者擇一。
- 被元件本體擋住的格點，不能插腳，也不能讓導線經過。
- 插著元件腳的孔，不能讓導線經過。
- 兩個元件的本體不能重疊。

---

## 6. 電路模型與 Net 分析

### 6.1 資料

```ts
interface Circuit {
  version: 1;
  boards: BreadboardInstance[];   // 本子專案只放一塊
  components: ComponentInstance[];
  wires: Wire[];
}

interface BreadboardInstance {
  id: string;                     // 例如 "b1"
  layoutId: "MB102";
  x: number; y: number;           // 在世界座標中的位置（mm），留給畫面與子專案 3
  groupId: null;                  // 子專案 3 才使用
}

interface GridPoint { boardId: string; x: number; y: number }

interface Wire {
  id: string;
  color: string;
  source: "manual" | "auto";
  netId?: string;                 // auto 線一定有
  start: GridPoint;
  end: GridPoint;
  path: GridPoint[];              // 含起點與終點；相鄰兩點必須距離 1
}
```

格子座標一律用 `x` / `y`，不使用需求文件中的 `row` / `col`，避免和 A–J 的「排」混淆。

### 6.2 Net 分析（`extractNets`）

使用 union-find，以導通群組為單位：

1. 每條導線合併「起點所在群組」與「終點所在群組」。端點不在 hole 上的導線不參與合併，由電路檢查報錯。
2. 每個元件的 `internalConnections` 合併對應腳位所在的群組。
3. 電阻、LED、指撥開關、DC Power 的兩腳**不合併**。
4. 合併後，含有至少一隻元件腳的連通塊就是一個 Net。

```ts
interface Net {
  id: string;
  name: string;                   // "VCC"、"GND"、"NET_1" …
  kind: "power" | "ground" | "signal";
  groupIds: string[];             // 所有導通群組（含沒有腳的）
  pins: { componentId: string; pinNumber: number }[];
}
```

**命名規則**：含 `vcc-source` 的 Net 叫 `VCC`（若有多個互不相連的，依序為 `VCC_2` …）；含 `gnd-source` 的叫 `GND`（同理）；其他依「最小的腳位參照（componentId 再 pinNumber）」排序後命名 `NET_1`、`NET_2` …，確保同一個電路每次命名都相同。

---

## 7. 電路檢查（`validateCircuit`）

```ts
interface CircuitError {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;                // 繁體中文，給學生看
  points: GridPoint[];
  componentIds: string[];
  wireIds: string[];
  netIds: string[];
}
```

| 等級 | code | 條件 |
|---|---|---|
| error | `PLACEMENT_INVALID` | 元件腳落在 surface、板外，或 span 小於 minSpan |
| error | `PIN_COLLISION` | 兩隻腳在同一孔，或腳與導線端點在同一孔 |
| error | `BODY_OVERLAP` | 元件本體與另一元件的本體或腳重疊 |
| error | `WIRE_ENDPOINT_INVALID` | 導線端點不是 hole，或與其他導線端點同孔 |
| error | `WIRE_PATH_INVALID` | 路徑不連續、有斜線、頭尾和 start/end 不符、超出板面 |
| error | `WIRE_THROUGH_OBSTACLE` | 路徑經過元件本體、插腳的孔，或別條線的端點 |
| error | `WIRE_OVERLAP` | 與其他導線共用一段，或在非垂直直穿的情況下共用格點 |
| error | `SHORT_CIRCUIT` | 同一 Net 同時含 vcc-source 與 gnd-source，或含電壓不同的 vcc-source |
| error | `IC_PIN_SHORT` | 同一顆 IC 的兩隻腳落在同一個導通群組 |
| error | `IC_POWER_MISSING` | IC 的 power 腳不在 VCC Net，或 ground 腳不在 GND Net |
| error | `OUTPUT_CONFLICT` | 同一 Net 有兩個以上 output 腳，或 output 腳所在 Net 含電源端子 |
| error | `NO_POWER_SOURCE` | 電路中有元件，但沒有任何 vcc-source 或 gnd-source |
| warning | `INPUT_FLOATING` | IC input 腳所在 Net 只有 input / nc 腳，沒有任何驅動來源 |
| warning | `PIN_UNCONNECTED` | passive / anode / cathode 腳所在 Net 只有它自己 |
| warning | `LED_REVERSED` | LED 陽極在 GND Net，或陰極在 VCC Net |
| warning | `LED_NO_RESISTOR` | LED 陽極 Net 與陰極 Net 中都沒有電阻的腳 |
| warning | `COMPONENT_SHORTED` | 非 IC 元件的兩隻腳在同一導通群組 |
| info | `CIRCUIT_VALID` | 沒有任何 error 與 warning |

說明：

- 程式無法知道使用者「本來想」怎麼接。需求文件的「兩個不同 Net 意外連接」用 `SHORT_CIRCUIT`、`OUTPUT_CONFLICT` 抓電氣上一定錯的情況。
- 同一顆 IC 的兩隻腳在同一個 **Net**（例如 NAND 兩輸入綁在一起當反相器）是合法的，只有在同一個**導通群組**才報 `IC_PIN_SHORT`。
- 沒接的 output 腳不報錯。

---

## 8. 佈線引擎（`autoRoute`）

### 8.1 佈線問題

- **靜態障礙**：元件本體擋住的格點、插著元件腳的孔。
- **終端群組**：每個 Net 中有元件腳的導通群組。例外：屬於該 Net 的電源軌群組，即使沒有腳也保留為終端群組。
- **可用端點**：終端群組中沒被元件腳佔用的孔。
- 每個 Net 需要「終端群組數 − 1」條導線，組成一棵樹；只有 1 個終端群組的 Net 不需要導線。

### 8.2 單條導線：多起點、多終點 A*

- 起點集合：該 Net 目前已連通部分的所有可用端點。終點集合：尚未連通群組的所有可用端點。
- 搜尋狀態：`(格點, 進入方向, 本段長度是否 ≥ 2, 本段是否為第一段)`。
- 每一步的成本：

| 項目 | 規則 | 預設權重 |
|---|---|---|
| Distance | 每走一格 | 1 |
| Bend | 方向改變一次 | 5 |
| Crossing | 進入一個「已有別條線直穿、方向與自己垂直、且不是任何端點」的格點，並且自己也直穿 | 1000 |
| Overlap | 其他任何共用格點或共用邊的情況 | 協商階段由 8.4 決定，最終結果禁止 |
| Congestion | 經過任何終端群組的可用端點孔（會佔掉別人可能要用的端點） | 20 |
| Aesthetic | 形成「非第一段、非最後一段、長度只有 1 格」的小折角 | 10 |

- 估計函式：`min over 終點 (曼哈頓距離) × Distance 權重`。不加轉彎估計，因為狀態裡的方向會讓「加轉彎」的估計失去一致性；純曼哈頓距離既不高估、也保持一致，A* 第一次取出終點時就是最佳解。
- 協商階段，每經過一個格點還會加上該格點的歷史成本 `history(r)`（見 8.4），讓線自動避開過去常塞車的位置。
- 同一個 Net 的兩條線也適用重疊與交叉規則。

### 8.3 Net 樹建構

1. 起始群組：該 Net 的電源軌群組；沒有的話選腳最多的群組；再相同則選群組 ID 最小者。
2. 每次用 8.2 的 A* 找出「已連通部分 → 任一未連通群組」中成本最低的一條線，加入樹中，佔用它的端點與路徑。
3. 重複到所有終端群組都連通。

### 8.4 協商迴圈

1. **排序**：`routingPriorityScore(net)` = `isPower × 1000 + 範圍半周長 × 10 + 100 ÷ (最少可用端點數 + 1)`。分數高的先排，同分依 Net ID 排序。
2. **第 1 輪**：依序排所有 Net，允許重疊。
3. **重疊成本**：`(overlapBase + history(r)) × (1 + presentFactor × 其他線在 r 上的使用數)`。資源 r 是格點：共用一段邊必然共用兩端的格點，端點孔本身也是格點，所以只追蹤格點就涵蓋了所有重疊情況。
4. **每輪結束後**：有衝突的資源 `history += historyIncrement`；`presentFactor *= presentFactorGrowth`；把所有涉及衝突的 Net 拆掉重排。
5. **重疊歸零後進入改善階段**：依序把每個 Net 拿掉，在其他線完全不可碰的條件下重排，若總成本下降就採用。重複到一整輪都沒有改善，或達到 `maxImprovementPasses`。
6. **停止條件**：達到 `maxIterations` 或 `timeBudgetMs`。

### 8.5 失敗處理

- **提早判定**：某個終端群組沒有任何可用端點時，該 Net 立即判定失敗（`NO_FREE_HOLE`）。
- **協商未收斂**：停止時仍有衝突的 Net 判定失敗（`ITERATION_LIMIT` 或 `TIME_LIMIT`）。A* 完全找不到路徑的判定為 `UNROUTABLE`。
- **合法性檢查（最後一道防線）**：`checkRoutingLegality(circuit, wires)` 獨立於佈線器實作，檢查：
  1. 路徑連續、只有水平和垂直、不超出板面
  2. 端點在正確終端群組的可用孔上，且端點不共用
  3. 不經過靜態障礙或其他線的端點
  4. 沒有重疊；只允許垂直直穿的交叉
  5. 用「元件 + 新導線」重新做 `extractNets`，每個 Net 的終端群組集合必須和原本完全相同
  任何一項不通過，相關 Net 降級為失敗（`LEGALITY_CHECK`），它的線不會出現在輸出中。
- `failedNets` 不為空時，`status` 為 `partial`（部分 Net 成功）或 `failed`（全部失敗），`message` 為 "No valid routing solution."。

### 8.6 導線顏色

- VCC Net：紅色；GND Net：黑色。
- 其他 Net 依排序輪流使用固定色盤：黃、綠、藍、橘、白、紫、棕、灰。
- 同一 Net 的所有線用同一種顏色。

### 8.7 設定（`RoutingConfig`，全部有預設值，可部分覆寫）

```ts
interface RoutingConfig {
  weights: {
    distance: 1; bend: 5; crossing: 1000; congestion: 20; aesthetic: 10;
  };
  negotiation: {
    overlapBase: 50; presentFactor: 0.5; presentFactorGrowth: 1.6;
    historyIncrement: 1; maxIterations: 60; maxImprovementPasses: 3;
  };
  timeBudgetMs: 5000;
  priority: { power: 1000; spread: 10; scarcity: 100 };
  scoring: {
    overlap: 30; crossing: 8; lengthMax: 20;
    extraBend: 1.5; extraBendMax: 15; shortJog: 2; shortJogMax: 10;
  };
}
```

上面的數值是起始值，實作時會用固定測試電路校準，校準結果寫回預設值。

---

## 9. 評分與輸出

### 9.1 輸出格式

```ts
interface RoutingResult {
  status: "success" | "partial" | "failed";
  message: string;                // "Standard Routing Complete" 或 "No valid routing solution."
  wires: Wire[];                  // source: "auto"
  failedNets: { netId: string; reason: FailureReason; detail: string }[];
  metrics: RoutingMetrics;
  score: number;
  stats: { iterations: number; elapsedMs: number };
}

type FailureReason = "NO_FREE_HOLE" | "UNROUTABLE" | "ITERATION_LIMIT" | "TIME_LIMIT" | "LEGALITY_CHECK";

interface RoutingMetrics {
  wireCount: number;
  totalLength: number;            // 所有線走過的格數總和
  bends: number;
  crossings: number;
  overlaps: number;
  shortJogs: number;
}
```

### 9.2 Routing Score（`scoreRouting(circuit, wires)`）

可以對**任何一組導線**評分，包括使用者手動接的線，讓 Compare 模式與最佳化前後的比較用同一套標準。

- **基準 Net**：一律是 `extractNets(circuit)`，也就是用 `circuit.wires`（使用者的線）分析出來的 Net。
- **被評分的線**：參數 `wires`；省略時就是 `circuit.wires` 本身（評手動接線）。
- 以下情況直接 **0 分**：
  - 用「元件 + 被評分的線」重新分析出的 Net，和基準 Net 的終端群組集合不同（有 Net 沒接通，或接到別的 Net）。
  - 被評分的線中有 `WIRE_PATH_INVALID` 或 `WIRE_ENDPOINT_INVALID` 的情況。
- 手動接線穿過障礙物（`WIRE_THROUGH_OBSTACLE`）的地方，評分時當作重疊計算。
- 否則從 100 分開始扣，最後限制在 0–100：

| 項目 | 扣分 | 上限 |
|---|---|---|
| 重疊 | 每處 30 | — |
| 交叉 | 每處 8 | — |
| 長度效率 | 20 × (1 − 理論下限 ÷ 實際總長) | 20 |
| 多餘轉彎 | (總轉彎數 − 導線數，最小為 0) × 1.5 | 15 |
| 小折角 | 每個 2 | 10 |

「理論下限」：對每個 Net，以「兩群組可用端點間的最小曼哈頓距離」為邊長，求終端群組的最小生成樹總長，再把所有 Net 加總。不考慮障礙物。實際總長為 0 時，長度效率視為 1。

扣分權重放在設定裡，用測試電路校準到：整齊的結果 ≥ 90 分、可用但不夠整齊約 70 分、混亂約 50 分。

### 9.3 套用結果

`applyRouting(circuit, result)`：只有 `status === "success"` 時允許，回傳一個新的 Circuit，裡面的導線全部換成 `result.wires`。其他狀態會丟出錯誤。原本的 Circuit 不會被修改。

---

## 10. 對外 API（`src/index.ts`）

```ts
// 麵包板
MB102_LAYOUT: BoardLayout
buildBoard(layout: BoardLayout, boardId: string): Breadboard
holeName(board: Breadboard, point: GridPoint): string | null
parseHoleName(board: Breadboard, name: string): GridPoint | null   // 接受 "A12"、"b1:A12"、"B−30"
getBoard(layoutId: string, boardId: string): Breadboard              // 有快取，回傳的物件不可修改

// 元件
getComponentDefinitions(): ComponentDefinition[]
getComponentDefinition(id: string): ComponentDefinition | undefined
resolveFootprint(instance: ComponentInstance, def: ComponentDefinition):
  { pins: { pinNumber: number; point: GridPoint }[]; blocked: GridPoint[] }

// 電路
getNodeState(circuit: Circuit, point: GridPoint): NodeState
extractNets(circuit: Circuit): Net[]
validateCircuit(circuit: Circuit): CircuitError[]

// 佈線
autoRoute(circuit: Circuit, config?: DeepPartial<RoutingConfig>): RoutingResult
checkRoutingLegality(circuit: Circuit, wires: Wire[]): LegalityViolation[]
scoreRouting(circuit: Circuit, wires?: Wire[]): { metrics: RoutingMetrics; score: number }
applyRouting(circuit: Circuit, result: RoutingResult): Circuit
```

需求文件第二十五章列出的 12 個介面對應如下：`Component` → `ComponentInstance` + `ComponentDefinition`；`Pin` → `PinDefinition`；`Wire`、`Net`、`Breadboard`、`BreadboardNode`、`BreadboardGroup`、`Circuit`、`CircuitError`、`RoutingResult` 同名；`RoutingNode` 為 A* 搜尋狀態；`RoutingPath` 為 `{ netId, start, end, path }`，與需求文件第四章的輸出格式一致。

---

## 11. 測試策略

- 所有模組以 TDD 開發（先寫測試，再寫實作）。
- `npm test` 執行 Vitest；`npm run typecheck` 執行 `tsc --noEmit`，兩者都必須通過。

| 範圍 | 至少要驗證 |
|---|---|
| 麵包板 | 830 孔、130 組；`A12` 與 `E12` 同組、`E12` 與 `F12` 不同組；電源軌全長導通；surface 不可當端點；孔位名稱來回轉換 |
| Footprint | 四種封裝在 4 個旋轉角度下的腳位與擋住範圍；0.6 吋 DIP24；指撥開關腳位配對；Push Button 內部導通 |
| Net 分析 | 導線只有端點導電；internalConnections；電阻兩端不合併；命名規則穩定 |
| 電路檢查 | 第 7 節每一個 code 至少一個正例 |
| 合法性檢查器 | 每一種違規都有手工構造的反例，且都能被抓到 |
| 佈線（需求文件 Test 1–6） | 1 只有水平/垂直；2 兩條線不重疊；3 可能交叉時選擇不交叉；4 不穿過 IC；5 多個 Net 全部完成；6 無解時回報 "No valid routing solution." 且不輸出違規線 |
| 固定測試電路 | 驗收電路（74LS00 + LED + 電阻 + VCC/GND）、74LS93 計數器 + Push Button + 4 LED、8 位元指撥開關 → 74LS283 → LED。每個都驗證：成功、通過合法性檢查、Net 不變、執行兩次結果完全相同 |
| 效能 | 合成電路（50 元件、50 Net）在 Node 上 5 秒內完成 |
| 74LS 資料 | 腳數與封裝相符、腳號 1…n 不重複不遺漏、VCC 與 GND 腳位符合第 5.4 節 |

---

## 12. 完成標準

1. `npm test` 與 `npm run typecheck` 全部通過。
2. 需求文件 Test 1–6 全部通過。
3. 驗收電路的自動佈線結果：`status: "success"`、0 交叉、0 重疊、Routing Score ≥ 90。
4. 另外兩個固定測試電路：`status: "success"`、0 重疊。
5. `npm run demo` 能在終端機用 ASCII 印出固定測試電路的佈線前後對照與統計。

---

## 13. 已知限制與後續

- 不使用「沒有元件腳的空群組」當中繼點（Steiner 點）。之後若要更短的線，可以加入。
- 不移動元件，只重排導線。
- 只支援單一麵包板；ID 已帶 boardId，子專案 3 在此基礎上加入群組座標系。
- `autoRoute` 是同步函式，靠 `timeBudgetMs` 控制時間；子專案 2 會用 Web Worker 包起來，避免卡住畫面。
- 開關狀態、邏輯行為不影響佈線，留給子專案 4。
