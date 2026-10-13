# 整次佈線的說明與問 AI（子專案 17）設計規格

- 日期：2026-10-13
- 狀態：規格待確認（使用者 2026-10-13 在對話中同意設計）
- 前一份：`2026-10-12-ai-links-design.md`（子專案 11：AI 回答的孔位連結與導線解說）

---

## 0. 目的

AI 標準佈線完成後，學生看得到「這次佈線整體做了什麼」：前後比較、搬了哪些 IC、每個訊號用了幾條線、哪些接不通與怎麼改。
不用金鑰就有程式整理的說明；有金鑰時可以接著問 AI「為什麼這樣排」。

## 1. 決定

| 項目 | 決定 |
|---|---|
| 放在哪 | 右側「屬性」分頁、沒有選取任何東西時，在電路摘要上方多一段「這次佈線」 |
| 什麼時候有 | 有佈線結果、而且結果沒有過期（`isComparisonFresh`）；比較畫面（還沒套用）與套用後都有 |
| 入口 | 佈線結果卡多一個「看說明」按鈕：取消選取、切到屬性分頁、捲到這一段 |
| 問 AI | 新的對話主題 `{ kind: 'routing' }`；第一則訊息附電路摘要、這段說明、佈線規則 |
| 建議問題 | 「整體說明這次佈線」「為什麼要這樣繞？」「實際插線時先接哪些？」 |
| 不做 | 自動發問；比較兩次佈線之間的差異 |

## 2. 整理說明（`src/editor/explain/routing.ts`，純函式）

```ts
export interface RoutingSummary {
  status: 'success' | 'partial' | 'failed';
  before: RoutingMetrics;           // 佈線前（使用者的線）
  after: RoutingMetrics;            // 佈線結果
  moves: Array<{ componentId: string; from: string; to: string }>; // 第 1 腳的孔位名稱
  nets: Array<{ netId: string; name: string; wires: number; minimum: number; points: GridPoint[] }>;
  failed: Array<{ netId: string; reason: string; hint: string }>;
}
export function summarizeRouting(circuit: Circuit, comparison: { beforeScore: { metrics: RoutingMetrics }; result: RoutingResult }): RoutingSummary;
export function routingSummaryText(circuit: Circuit, s: RoutingSummary): string[];
```

- `circuit` 是佈線後的電路（套用後的目前電路；比較畫面時用 `comparisonSides(c).after`）。
- `nets`：AI 導線依 `netId` 分組。`name` 用 `analyzeCircuit` 的 Net 名稱（找不到時用 netId）。
  `minimum` = 這個 Net 的腳分布在幾個不同的導通群組 − 1（直接相連最少要幾條線）；`wires − minimum` 就是多出來的轉接。
  依「多出來的轉接」由多到少排序，相同時依 netId。`points` 是這個 Net 所有 AI 導線的兩端（給板上標示）。
- `moves`：`result.moves`，位置寫成第 1 腳所在孔的名稱（`holeLabel`）。
- `failed`：`FAILURE_NAMES[reason]`，`hint` 依原因：
  - `NO_FREE_HOLE`：「腳旁邊的孔都滿了：把元件往旁邊移幾格，或換 EIC-1106 大型麵包板」
  - `UNROUTABLE`、`ITERATION_LIMIT`、`TIME_LIMIT`：「附近的線太擠：把元件拉開一點，或選「可移動 IC」再佈線一次」
  - `LEGALITY_CHECK`：「結果沒通過檢查（程式的問題），請再佈線一次」
- `FAILURE_NAMES` 從 `src/components/common/describe.ts` 搬到這個檔（describe.ts 改成從這裡匯出），讓 editor 層也能用。
- `routingSummaryText` 產生給畫面與 AI 用的白話句子：
  1. 「佈線成功：N 條線，總長 L 格，交叉 C 處（佈線前：N0 條、L0 格、C0 處）」；部分成功、失敗時開頭改寫。
  2. 有搬 IC 時：「搬動了 U2（F20 → F30）、U3（…）」。
  3. 「最繞的訊號：g1 用了 3 條線（直接接最少 1 條）…」最多列 5 個，只列有多出來轉接的；都沒有時寫「每個訊號都用最少的線直接接上」。
  4. 接不通的訊號：每個一句「g2：原因。建議」。

## 3. 畫面（`src/components/PropertyPanel/RoutingSummaryCard.tsx`）

- 標題「這次佈線」，`data-testid="routing-summary"`，`id="routing-summary"`（給「看說明」捲動）。
- 第一段前後比較用小表格：線、總長、交叉三列，前 / 後兩欄。
- 搬動的 IC、接不通的訊號各一段（沒有就不顯示）。
- 「每個訊號的線」列出前 5 個（依第 2 節的排序），每列是按鈕：點了用 `flashPoints(points)` 在板上標出這個 Net 的線；
  超過 5 個時有「顯示全部」。
- 下面是 `AskAi`（主題 `routing`），建議問題見第 1 節。
- 佈線結果卡（`CanvasHud` 的 `ResultCard`）多一個「看說明」按鈕（`data-testid="routing-explain"`）。

## 4. 問 AI（`src/editor/explain/brief.ts`、`src/state/ai.ts`）

- `AiTopic` 加 `{ kind: 'routing'; result: RoutingResult }`；`sameTopic`：兩個都是 routing 且 `result` 是同一個參照。
- `routingBrief(circuit, comparison)`：「【這次 AI 標準佈線】」+ `routingSummaryText` 每句一行 + `ROUTING_RULES`。
- `firstMessage` 依主題選 `issueBrief`、`wireBrief` 或 `routingBrief`。`routingBrief` 需要 comparison：
  `firstMessage(circuit, topic, question, comparison?)`，routing 主題沒有 comparison 時只附 `ROUTING_RULES`。
- `useAi.ask` 照常；store 端把目前的 comparison 傳進去（`ask(circuit, topic, question)` 不變，ai.ts 從 `useStore.getState().comparison` 取）。
- 系統指示加一句：「學生問整次佈線時，先講整體（線數、交叉、搬動的 IC），再挑一兩個最繞的訊號說明為什麼」。

## 5. 測試

- 單元（`tests/editor/routingSummary.test.ts`）：用 `autoRoute` / `autoPlaceAndRoute` 跑一個小電路，檢查前後指標、
  `nets` 的 `wires` 與 `minimum`、排序、`moves` 的孔位名稱；手造一個 `partial` 結果檢查 `failed` 的 hint；`routingSummaryText` 的句子。
- 單元：`sameTopic`（routing）、`firstMessage` 的 routing 內容包含「【這次 AI 標準佈線】」與佈線規則。
- store（`tests/web/`）：佈線完成後按「看說明」的動作（取消選取、切到屬性分頁）。
- 端對端：載入範例、AI 標準佈線、按「看說明」看到「這次佈線」與前後比較；點一個訊號板上出現標示；沒有金鑰時看到設定金鑰的按鈕。

## 6. 之後

- 老師提供金鑰（清單上剩下的一項）。
