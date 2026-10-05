# 子專案 2：編輯器畫面 設計規格

- 日期：2026-10-05
- 狀態：待使用者審閱
- 來源需求：`digitaldesigned.md`（以下稱「需求文件」）
- 依賴：子專案 1 核心引擎（`docs/superpowers/specs/2026-10-05-core-engine-design.md`，分支 `feat/core-engine`，PR #1）
- 分支：`feat/editor-ui`（從 `feat/core-engine` 開出；PR #1 合併後改接 `main`）

---

## 0. 目的與成功標準

**使用者**：數位邏輯實驗課的學生，用電腦或平板在網頁上規劃麵包板接線，再照著插實體板。

**本子專案交付**：一個可以實際操作的網頁編輯器，能放元件、手動接線、檢查電路、AI 標準佈線（動畫＋統計）、照著接線清單插實體板、比較佈線前後、Undo/Redo、存檔與匯出；同時提供網站版與單一 HTML 離線版。

**成功標準**：需求文件第三十四章驗收清單 20 項全部做得到（見第 13 節），所有自動測試與型別檢查通過，兩種建置都能產生並實際打開使用。

---

## 1. 範圍

**包含**：第 0 節所列全部功能；滑鼠、鍵盤與觸控操作；繁體中文介面；淺色主題；網站版與單一 HTML 版建置；自動測試（含 Playwright 端對端）。

**不包含**：

| 項目 | 歸屬 |
|---|---|
| 多塊麵包板、吸附、群組 | 子專案 3 |
| 74LS 邏輯模擬、指撥開關切換的電氣效果 | 子專案 4 |
| LLM 解說「為什麼這條線這樣走」 | 子專案 5 |
| 實際部署到某個網站空間 | 之後另行決定 |
| 手機上編輯（手機只保證能打開與檢視） | 不做 |
| 多語系切換、深色主題、PDF 匯出、列印版 | 不做 |

---

## 2. 已確認的決策

| 項目 | 決定 |
|---|---|
| 裝置 | 電腦與平板都要能編輯（滑鼠、鍵盤、觸控） |
| 發佈形式 | 網站版（靜態網站）＋單一 HTML 離線版，同一份程式碼 |
| 介面語言 | 繁體中文，專有名詞保留英文（Check Circuit、VCC、GND、Net、腳位名稱等） |
| 照著插的輔助 | 接線清單＋勾選進度（不做列印版） |
| 繪製技術 | SVG + React |
| 其他技術 | TypeScript、Zustand、Tailwind CSS、Vite；佈線在 Web Worker 執行 |
| AI 佈線結果 | 成功時直接套用，算一個 Undo 步驟；失敗時不改動使用者接線 |
| 主題 | 淺色，麵包板寫實但乾淨 |
| 存檔 | 瀏覽器自動存檔＋瀏覽器內專案清單＋匯入／匯出 JSON |

---

## 3. 技術與建置

- 執行期依賴：`react`、`react-dom`、`zustand`。
- 開發依賴：`vite`、`@vitejs/plugin-react`、`tailwindcss`、`@tailwindcss/vite`、`vite-plugin-singlefile`、`@testing-library/react`、`@testing-library/user-event`、`jsdom`、`@playwright/test`。版本於實作時安裝當時最新穩定版。
- 不得在執行期載入任何外部資源（CDN、網路字型、遠端資料），離線版才能運作。字型使用系統字型：`"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif`。
- Web Worker 一律以 Vite 的 `?worker&inline` 匯入，網站版與單一 HTML 版共用同一種寫法。
- 指令：

| 指令 | 用途 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 網站版，輸出 `dist/` |
| `npm run build:single` | 單一 HTML，輸出 `dist-single/breadboard-lab.html` |
| `npm test` | Vitest（核心＋畫面） |
| `npm run test:e2e` | Playwright 端對端測試 |
| `npm run typecheck` | `tsc --noEmit` |

---

## 4. 架構

### 4.1 目錄

```text
index.html
src/
  main.tsx                 進入點
  app/
    App.tsx                版面：選單列、元件庫、麵包板、資訊面板、狀態列
    model/                 ProjectFile、編輯器狀態型別、簽章、色名表
    commands/              所有會改動文件的指令（純函式）
    store/                 Zustand store：文件、歷史、介面狀態
    geometry/              視窗座標 ↔ 格子座標、命中判定、吸附、L 形路徑、旋轉
    board/                 SVG 繪製元件
    interaction/           指標事件狀態機、鍵盤快捷鍵
    panels/                元件庫、資訊面板（選取／檢查結果／接線清單）、狀態列、選單列、對話框
    routing/               Worker 用戶端、動畫控制、接線清單排序
    persistence/           瀏覽器存檔、匯入匯出 JSON、匯出 SVG/PNG
  workers/
    routing.worker.ts
tests/
  app/                     畫面層的單元測試（Vitest + jsdom）
e2e/                       Playwright 測試
```

### 4.2 依賴方向

`app` → `core` → `types`，單向。`core`（子專案 1）不得引用 `app`，子專案 1 的程式碼本子專案不修改。`app` 內：`board`、`panels`、`interaction` 可以引用 `store`、`commands`、`geometry`、`model`；`commands`、`geometry`、`model`、`routing/checklist`、`persistence` 不得引用 React。

### 4.3 文件格式（存檔與匯出共用）

```ts
interface ProjectFile {
  format: 'breadboard-lab';
  version: 1;
  name: string;                         // 專案名稱，預設「未命名電路」
  circuit: Circuit;                     // 子專案 1 的格式
  routing: RoutingRecord | null;        // 最近一次成功的 AI 佈線
  savedAt: string;                      // ISO 時間
}

interface RoutingRecord {
  before: Wire[];                       // 佈線前使用者的導線（比較模式用）
  beforeScore: number;                  // 使用者接線的 Routing Score
  metrics: RoutingMetrics;              // 佈線後統計
  score: number;                        // 佈線後 Routing Score
  signature: string;                    // 佈線當下 circuit 的簽章，用來判斷清單是否過期
  checklist: Record<string, boolean>;   // wireId → 已插好
}
```

- **簽章**：`circuitSignature(circuit)` = 把 `components` 與 `wires` 依 ID 排序後 `JSON.stringify` 的結果。佈線之後只要元件或導線有任何變動，簽章就不同，接線清單視為過期。

### 4.4 編輯器狀態（Zustand）

```ts
interface EditorState {
  doc: ProjectFile;
  history: { past: Snapshot[]; future: Snapshot[] };   // Snapshot = { circuit, routing }，上限 100 步
  dirty: boolean;                                       // 上次「儲存」之後是否有修改
  projectId: string | null;                             // 對應瀏覽器專案清單中的項目
  mode: 'edit' | 'routing' | 'compare';
  selection: Selection | null;
  wireColor: string;
  viewport: { scale: number; tx: number; ty: number };
  liveCheck: CircuitError[];                            // 即時檢查結果
  rightTab: 'selection' | 'check' | 'checklist';
  routingJob: RoutingJob;                               // idle | running | animating | failed（含預覽線）
  compareView: 'mine' | 'ai';                           // 平板上比較模式顯示哪一邊
}

type Selection =
  | { kind: 'component'; id: string }
  | { kind: 'pin'; componentId: string; pinNumber: number }
  | { kind: 'wire'; id: string }
  | { kind: 'hole'; point: GridPoint };
```

### 4.5 資料流

1. 使用者操作 → `interaction` 把指標事件轉成指令呼叫。
2. 指令是純函式 `(doc, args) => doc | CommandError`；store 套用新文件時，把舊的 `{circuit, routing}` 推進 `history.past`、清空 `future`、設定 `dirty`。
3. 文件改變後 150 ms（防抖），重新執行 `validateCircuit` 更新 `liveCheck`，並重算狀態列的導線數、Net 數、Routing Score。
4. 文件改變後 1 秒（防抖）自動存檔。
5. AI 佈線：store → Worker 用戶端 → Worker 執行 `autoRoute` → 回傳結果 → store 套用（第 8 節）。

---

## 5. 座標與繪製

### 5.1 座標

- SVG 使用者單位：**1 格（0.1 吋）= 10 單位**。格子座標 `(x, y)` 的中心在 SVG `(x × 10, y × 10)`。
- 板子外框從格子 `(0, 0)` 到 `(64, 19)`，也就是比格點多留半格到一格的邊。
- 視窗變換以 `viewport` 套在最外層 `<g transform>` 上：`scale` 範圍 0.5–8。「符合畫面」讓整塊板子剛好放進可見區域並置中；「重設」等於「符合畫面」。
- 螢幕座標轉格子座標：透過 SVG 的 `getScreenCTM().inverse()` 轉成 SVG 單位，再除以 10 並**四捨五入到最近格點**。所有命中判定都在格子座標上做（第 6.1 節），不依賴 SVG 元素本身的點擊範圍，所以手指點不準也沒關係。

### 5.2 圖層（由下到上）

1. **底板**（靜態，只畫一次）：米白板面、電源軌紅藍線、凹槽、所有孔（深灰方孔）、欄號（1–63，每 5 欄一個）、列號（A–J、T−/T+/B+/B−）。
2. **元件**
3. **導線**
4. **疊加層**：選取與 Net 高亮、錯誤／警告標記、拖曳預覽、接線預覽、佈線失敗時的半透明預覽。匯出圖片時不包含這一層。

板子、元件、導線**只用 SVG 屬性設定樣式**（不用 CSS class），匯出 SVG 時才能自給自足。

### 5.3 元件外觀

| 元件 | 外觀 |
|---|---|
| 74LS IC（DIP） | 深灰（#2b2b2b）圓角矩形蓋住兩排腳之間，左側半圓凹口，第 1 腳旁小圓點，本體中央白字型號 |
| 指撥開關 | 紅色本體，每個開關一個白色撥桿（依 `switchStates` 畫在 ON 或 OFF 位置），上方小字編號 |
| 電阻 | 米色本體畫在兩腳之間，依阻值畫 4 條色環（第一、二位數、倍率、金色誤差） |
| LED | 依 `color` 填色的圓形，陰極側切平，旁邊小字 `A`、`K` |
| VCC | 紅色小標籤「VCC 5V」（電壓依屬性） |
| GND | 黑色小標籤「GND」 |
| DC Power | 紅黑兩色雙腳排針，標 `+`、`−` |
| Push Button | 黑色方形按鍵，四角是腳 |

所有元件的腳畫成銀色小方塊，蓋在孔上。

### 5.4 導線外觀

- 線寬 6 單位（0.6 格），圓角接頭，顏色取自導線；外框比本色深 30%。
- 兩端畫成小的銀色方塊（插進孔裡的金屬頭）。
- 兩條線交叉時，在交叉點把後畫的線加 2 單位的淺色外框，看起來疊在上面。
- 即時檢查有 `WIRE_PATH_INVALID`、`WIRE_ENDPOINT_INVALID`、`WIRE_THROUGH_OBSTACLE`、`WIRE_OVERLAP` 的導線，改畫成紅色虛線。
- 接線清單中已打勾的線，透明度降為 35%。

### 5.5 色名表（接線清單與顏色選盤共用）

| 色碼 | 名稱 |
|---|---|
| `#d32f2f` | 紅 |
| `#212121` | 黑 |
| `#f9a825` | 黃 |
| `#2e7d32` | 綠 |
| `#1565c0` | 藍 |
| `#ef6c00` | 橘 |
| `#f5f5f5` | 白 |
| `#6a1b9a` | 紫 |
| `#6d4c41` | 棕 |
| `#9e9e9e` | 灰 |

手動接線的顏色選盤就是這 10 色，預設紅色。不在表中的顏色顯示為「其他」。

### 5.6 高亮與標記

- 選取：藍色光暈 `#2196f3`。同一個 Net 的導線與腳：青色光暈 `#00bcd4`。
- 錯誤：紅色圓圈加 ⚠；警告：黃色 ⚠。畫在 `CircuitError.points` 的位置；沒有點位時畫在相關元件上。
- 檢查通過：畫面上方綠色橫幅「✓ Circuit Valid：電路檢查通過」，3 秒後淡出。

---

## 6. 互動

### 6.1 命中判定（純函式 `hitTest(doc, point)`）

輸入格子座標，依序判斷，取第一個符合的：

1. 某個元件的腳在這個格點 → `pin`
2. 格點在某個元件的**範圍**內 → `component`。範圍 = footprint 的腳 ∪ `blocked` 格點；`two-lead` 元件再加上兩腳連線上的所有格點（LED、DC Power 雖然不擋線，點兩腳之間也能選到它）
3. 某條導線經過或終止於這個格點 → `wire`
4. 這個格點是孔 → `hole`
5. 其他 → `empty`

### 6.2 指標狀態機（滑鼠、觸控共用 Pointer Events）

| 按下的位置 | 按下後移動不到 5px 就放開 | 拖曳 |
|---|---|---|
| `pin` | 選取該腳（高亮整個 Net） | 移動該元件 |
| `component` | 選取元件 | 移動元件 |
| `wire` | 選取導線（高亮整個 Net） | 平移畫面 |
| `hole`（空孔） | 選取該孔 | 從這個孔開始接線 |
| `hole`（被佔用）或 `empty` | 取消選取 | 平移畫面 |

- 中鍵拖曳、或按住空白鍵再拖曳：一律平移。
- 滾輪：以游標位置為中心縮放，每格 ×1.15。
- 觸控第二根手指放下時，取消正在進行的單指動作（接線、移動），改成兩指縮放與平移。
- 長按（觸控 500 ms 內移動不到 5px）或滑鼠右鍵：在 `pin`／`component` 上開啟右鍵選單（旋轉 90°、刪除），在 `wire` 上開啟（刪除、翻轉轉角）。
- 比較模式與佈線中：只允許平移、縮放、選取（唯讀）。

### 6.3 放置與移動

- **從元件庫放置**：在元件庫按住某個元件並拖進板子區域，或點一下元件後再點板子。拖曳中顯示預覽，放開時若合法就放置，否則取消並顯示原因。
- **吸附**：預覽以「游標所在格點」減去「按下時游標與 anchor 的偏移」作為 anchor，再四捨五入到格點。
- **IC 自動跨凹槽**：`dip` 封裝在 0° 或 180° 時，anchor 的 y 固定為：

| 封裝 | 0° | 180° |
|---|---|---|
| 0.3 吋（rowSpacing 3） | 11（F 排） | 8（E 排） |
| 0.6 吋（rowSpacing 6） | 13（H 排） | 7（D 排） |

  只有 x 跟著游標；指撥開關也是 `dip`，同樣適用。90° 或 270° 時不套用。
- **放置是否合法**（純函式 `checkPlacement(doc, instance, ignoreId?)`）：所有腳都在孔上；腳不落在其他元件的腳、本體或導線端點上；本體不蓋到其他元件的腳或本體。移動時忽略元件自己。不合法時回傳中文原因，例如「第 3 腳沒有插在孔上」「會壓到 R1」。
- **移動**：拖曳時同樣預覽與判斷；放開時不合法就彈回原位。
- **旋轉**：以元件範圍（第 6.1 節）的外接矩形中心為軸轉 90°（順時針），新的 anchor 取讓新中心最接近原中心的格點（平手時取 x、y 較小者）；DIP 在 0°／180° 再套用自動跨凹槽。不合法就不轉，顯示原因。
- **刪除**：刪除選取的元件或導線。刪除元件**不會**自動刪掉接在它附近的導線（導線接的是孔，不是元件）。
- **屬性**：資訊面板可改電阻值（`RESISTOR_PRESETS`）、LED 顏色、`two-lead` 的兩腳距離（不得小於 `minSpan`，改完要通過放置判斷）、VCC 與 DC Power 的電壓（預設 5V）。

### 6.4 手動接線

- 起點必須是**空孔**：沒有元件腳、不在元件本體下、不是其他導線的端點。
- 拖曳時，以「游標第一次在某個軸向移動到半格以上」決定轉角方向：先水平就產生「水平再垂直」的 L 形，先垂直就產生「垂直再水平」。起點與終點同一列或同一欄時是直線。
- 放開在**空孔**且不是起點 → 建立導線（`source: 'manual'`，顏色為目前選色）；否則取消。
- 導線經過元件或其他導線，仍然建立，但即時檢查會把它畫成紅色虛線（第 5.4 節）。
- **翻轉轉角**：只對最多一個轉角的導線有效，把 L 形換成另一個方向；多個轉角的導線（例如 AI 佈線產生的）此選項停用。

### 6.5 快捷鍵

| 按鍵 | 動作 |
|---|---|
| `R` | 旋轉選取的元件 |
| `Delete`、`Backspace` | 刪除選取的元件或導線 |
| `Ctrl+Z` | 復原 |
| `Ctrl+Shift+Z`、`Ctrl+Y` | 重做 |
| `Ctrl+S` | 儲存 |
| `Esc` | 取消目前動作；沒有動作時取消選取；比較模式下離開比較 |

焦點在輸入框時不觸發快捷鍵（`Ctrl+S` 除外）。macOS 上 `Ctrl` 改用 `⌘`。

### 6.6 Undo / Redo

所有改動文件的指令都可以復原：放置、移動、旋轉、刪除、接線、刪線、翻轉轉角、改屬性、AI 佈線套用、新電路、匯入。縮放、平移、選取、切換面板、接線清單打勾不進歷史（打勾直接寫入目前文件的 `routing.checklist`）。

---

## 7. 電路檢查

- 即時檢查（第 4.5 節）的結果一直顯示在板上（標記與紅色虛線）。
- 按「電路檢查 Check Circuit」：切到資訊面板的「檢查結果」頁，依 🔴 錯誤、🟡 警告分組列出 `CircuitError.message`；點一項，畫面平移到該處並高亮相關元件、導線、Net。
- 沒有錯誤也沒有警告：顯示綠色橫幅（第 5.6 節），檢查結果頁顯示「✓ Circuit Valid」。

---

## 8. AI 標準佈線

### 8.1 Worker 協定

```ts
// 主執行緒 → Worker
{ type: 'route'; jobId: number; circuit: Circuit }
// Worker → 主執行緒
{ type: 'result'; jobId: number; result: RoutingResult }
{ type: 'error'; jobId: number; message: string }
```

- 取消：終止 Worker 並重新建立一個；忽略舊 `jobId` 的回覆。
- Worker 內只呼叫子專案 1 的 `autoRoute(circuit)`，使用預設設定。

### 8.2 流程

1. 按「AI 標準佈線」：`mode = 'routing'`，鎖住編輯，狀態列顯示「計算中…」與「取消」按鈕。
2. 成功但沒有產生任何導線（電路中沒有需要接線的 Net）：提示「目前沒有需要接線的 Net」，不改動文件，回到編輯模式。
3. **成功且有導線（`status === 'success'`）**：
   - 新文件：`circuit = applyRouting(circuit, result)`；`routing = { before: 原 wires, beforeScore: scoreRouting(原 circuit).score, metrics, score, signature: 新 circuit 的簽章, checklist: {} }`。這一步推進 Undo 歷史。
   - 動畫：原本的導線 0.3 秒淡出；新導線依接線清單順序逐條出現，每條以描邊動畫畫出，時間 = `min(250 ms, 4000 ms ÷ 導線數)`；提供「略過動畫」。動畫只影響顯示，文件已經套用完成。
   - 顯示統計卡「Standard Routing Complete」：Wire Count、Total Length（holes）、Bends、Crossings、Overlaps、Routing Score，旁邊並列「你的接線」的分數。
   - 資訊面板切到「接線清單」；`mode` 回到 `edit`。
4. **部分成功或失敗**：
   - 不改動文件。顯示「No valid routing solution.」與失敗清單：每個失敗的 Net 一列，原因用中文顯示（`NO_FREE_HOLE` 沒有空孔、`UNROUTABLE` 找不到路徑、`ITERATION_LIMIT`／`TIME_LIMIT` 板子太擠、`LEGALITY_CHECK` 結果沒通過檢查），加上引擎提供的 `detail`。點一列會高亮該 Net 的腳。
   - 排得出來的導線以 40% 透明度疊在板上當預覽，可以按「關閉預覽」移除。
   - 附提示：「試著把元件分散一點，或移開擋路的元件」。
5. **Worker 出錯**：顯示「佈線時發生錯誤：…」，不改動文件。

---

## 9. 接線清單

- **排序**（純函式 `checklistOrder(circuit)`）：先依 Net 種類（power → ground → signal），同種類依 Net 名稱的自然順序（`NET_2` 在 `NET_10` 前面），同一個 Net 內依導線 ID 的自然順序。只列出 `source: 'auto'` 的導線。
- **每列**：勾選框、色塊與中文色名、`起點孔名 → 終點孔名`（例如 `T+10 → A10`）、長度（`path.length − 1` 格）、Net 名稱（小字）。
- **互動**：點一列 → 選取那條導線、其他導線降為 30% 透明度、必要時平移到看得見；再點一次取消。勾選框切換 `routing.checklist[wireId]`。上方顯示「已完成 / 總數」與「全部清除」。
- **過期**：目前 circuit 的簽章 ≠ `routing.signature` 時，清單上方顯示「電路已修改，接線清單已失效，請重新執行 AI 標準佈線」，勾選框停用。
- 沒有 `routing` 時顯示「執行 AI 標準佈線後，這裡會列出照著插的接線順序」。

---

## 10. 比較模式

- 只有在 `routing` 存在且未過期時，「比較」按鈕才可按。
- 可見寬度 ≥ 1280px：左右兩塊唯讀的板子，左邊標「你的接線」（`circuit` 換上 `routing.before`）、右邊標「AI 標準佈線」（目前的 `circuit`），各自顯示 Routing Score；兩邊共用同一個 `viewport`。
- 寬度 < 1280px：同一塊板子，上方切換鈕「你的接線｜AI 標準佈線」。
- 按「離開比較」或 `Esc` 回到編輯模式。

---

## 11. 存檔與匯出

### 11.1 瀏覽器儲存（localStorage）

| 鍵 | 內容 |
|---|---|
| `breadboard-lab:autosave` | 目前的 `ProjectFile`，加上 `projectId` |
| `breadboard-lab:projects` | 專案索引：`[{ id, name, savedAt }]` |
| `breadboard-lab:project:<id>` | 該專案的 `ProjectFile` |

- **自動存檔**：文件改變後 1 秒寫入 `autosave`；啟動時若有就載入，沒有就建立空白電路（一塊 MB-102，ID `b1`）。
- **儲存**：有 `projectId` 就覆寫該專案；沒有就當作「另存新檔」。成功後 `dirty = false`。
- **另存新檔**：詢問名稱（預設目前名稱），建立新的 `id`（`p_` 加時間戳記與亂數）。
- **開啟**：列出專案索引（名稱、儲存時間），可開啟或刪除（刪除需確認）。`dirty` 時開啟其他專案前先確認。
- **新電路**：`dirty` 時先確認。
- 任何 localStorage 讀寫都包在 try/catch 中；寫入失敗（例如容量已滿）顯示「瀏覽器儲存空間不足，請匯出 JSON 保存」。
- 儲存與開啟的對話框都提示：「學校電腦可能會清除瀏覽器資料，重要的電路請匯出 JSON」。

### 11.2 匯入與匯出 JSON

- 匯出：下載 `<專案名稱>.breadboard.json`，內容是 `ProjectFile`（`JSON.stringify` 縮排 2）。
- 匯入：選擇檔案後驗證（純函式 `parseProjectFile(text)`）：
  - 接受 `ProjectFile`，也接受只有 `Circuit` 的 JSON（自動包成 `ProjectFile`，名稱取檔名）。
  - 檢查：`format`／`version`、`circuit.version === 1`、恰好一塊 `layoutId: 'MB102'` 的板子、每個元件的 `defId` 都在元件庫中、`rotation` 是 0/90/180/270、所有座標是整數、每條導線有 `start`、`end`、`path`。
  - 失敗時以中文說明第一個問題，目前文件不變；成功時套用新文件（可 Undo）。

### 11.3 匯出圖片

- **SVG**：複製目前板子的 SVG 節點（不含疊加層），`viewBox` 設成整塊板子，加上 `xmlns`，下載 `<專案名稱>.svg`。
- **PNG**：把上面的 SVG 轉成 data URL 畫到 2 倍大小的 canvas，下載 `<專案名稱>.png`。
- 比較模式下匯出目前顯示的那一邊。

---

## 12. 版面

- **寬度 ≥ 1024px**：上方選單列；左側元件庫（寬 240px）；中間麵包板；右側資訊面板（寬 300px）；下方狀態列。
- **寬度 < 1024px**：元件庫與資訊面板改成從左右滑出的抽屜，由選單列的按鈕開關；所有可點擊元素至少 44 × 44 px。
- **選單列**：Logo「breadboard-lab」｜「檔案」選單（新電路、儲存、另存新檔、開啟、匯入 JSON、匯出 JSON、匯出 SVG、匯出 PNG）｜「編輯」選單（復原、重做、旋轉、刪除）｜導線顏色選盤｜「電路檢查 Check Circuit」｜「AI 標準佈線」｜「比較」。
- **元件庫**：搜尋框；分類「74LS」「電阻」「LED」「電源」「開關與按鈕」；每個元件一個方塊，顯示名稱與小圖。電阻在元件庫裡依 `RESISTOR_PRESETS` 列出 8 種阻值，LED 列出 4 種顏色，放置時帶入對應屬性。
- **資訊面板**：三個頁籤「選取」「檢查結果」「接線清單」。
  - 選取元件：類型、型號、位置（第 1 腳孔名）、旋轉、屬性編輯。
  - 選取腳：元件、腳號、腳名、角色、孔名、所屬 Net 與 Net 內所有腳。
  - 選取導線：起點、終點、長度、顏色、所屬 Net、「翻轉轉角」、「刪除」。
  - 選取孔：孔名、導通群組、插在這裡的東西。
- **狀態列**：模式狀態（就緒／計算中…／佈線完成／比較中）｜導線數｜Net 數（需要接線的 Net）｜目前導線的 Routing Score｜自動存檔狀態。
- **畫面縮放按鈕**：麵包板右下角「＋」「－」「符合畫面」「重設」。

---

## 13. 測試與完成標準

### 13.1 測試

| 層級 | 工具 | 內容 |
|---|---|---|
| 純邏輯 | Vitest | 每個指令與 Undo/Redo；`hitTest`；`checkPlacement`；IC 自動跨凹槽；旋轉後 anchor；L 形路徑與翻轉；`checklistOrder`；簽章與過期判斷；`parseProjectFile` 每種錯誤；瀏覽器儲存（用記憶體假 localStorage，含容量已滿） |
| 元件 | Vitest + Testing Library + jsdom | 元件庫搜尋與分類；資訊面板依選取顯示正確內容；接線清單打勾與過期提示；檢查結果點擊 |
| Worker | Vitest | 直接測訊息處理函式（成功、錯誤、jobId 對應） |
| 端對端 | Playwright（Chromium） | 第 13.2 節的驗收流程；平板尺寸＋觸控模擬的放置與接線；開啟單一 HTML 檔完成一次 AI 佈線 |

### 13.2 完成標準（需求文件第三十四章）

端對端測試必須逐項做到：

1. 開啟網站（網站版）
2. 看見 MB-102 麵包板
3. 從元件庫拖入 74LS00
4. 放入 LED
5. 放入電阻
6. 放入 VCC 與 GND
7. 手動接線
8. 按「電路檢查 Check Circuit」
9. 看到檢查結果
10. 按「AI 標準佈線」
11–12. 系統依 Net 重新計算所有導線
13–17. 新導線只有水平垂直、沒有重疊，且狀態列與統計卡顯示 Crossings、Total Length、Bends
18. 顯示 Routing Score
19. 比較模式顯示佈線前後差異
20. `Ctrl+Z` 回到佈線前的接線

另外：`npm test`、`npm run typecheck`、`npm run test:e2e` 全部通過；`npm run build` 與 `npm run build:single` 都成功，且單一 HTML 檔用 `file://` 開啟可以完成一次 AI 佈線。

### 13.3 效能

50 個元件、100 條導線時，拖曳元件、平移、縮放不明顯卡頓；AI 佈線期間畫面仍可平移縮放（佈線在 Worker）。驗證方式：Playwright 載入合成電路後量測一次拖曳的處理時間（單次指標移動處理 < 16 ms 為目標，作為參考數據記錄，不作為硬性門檻）。

---

## 14. 已知限制與後續

- 只支援一塊麵包板；子專案 3 加入多板與群組。
- 指撥開關的 ON/OFF 只顯示、不能切換，切換與邏輯效果留到子專案 4。
- 不做部署；網站版產物可放到任何靜態網站空間。
- 子專案 1 遺留的小問題（極擁擠電路只能部分完成、失敗原因不夠直白等）不在本子專案處理，失敗時以第 8.2 節的中文說明與提示呈現。
