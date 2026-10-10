# 問 AI（子專案 5，第二部分：用 Gemini 追問錯誤）設計規格

- 日期：2026-10-10
- 狀態：設計已確認，實作中
- 需求文件：第十六章（AI 負責分析、解釋錯誤、建議最佳化，不直接畫線）、第三十七章（AI Circuit Assistant）
- 前一份：`2026-10-08-ai-explanation-design.md`（離線錯誤解說）。這份接在它後面：學生看完離線解說還有疑問時，可以用白話追問 AI。

---

## 0. 目的

離線解說告訴學生「為什麼錯、要插哪個孔」，但學生常常還有追問：「為什麼懸空會被當成 HIGH？」「不想接到 + 軌可以嗎？」
這個功能在錯誤解說卡下面加一塊「問 AI」，把**目前的電路摘要、這個錯誤、離線解說**和學生的問題一起送給 Google Gemini，
回答用繁體中文、一個字一個字串流顯示，可以接著追問。

## 1. 決定

| 項目 | 決定 |
|---|---|
| 範圍 | 只做錯誤解說卡上的追問；其他 AI 功能（佈線解說、整體電路摘要）之後另外規劃 |
| 模型 | Google Gemini `gemini-3.5-flash`（正式版），思考程度 `thinkingLevel: MEDIUM`；不設 temperature 等取樣參數（官方建議 Gemini 3 系列不要調） |
| 呼叫方式 | 瀏覽器直接呼叫 Gemini API，用官方套件 `@google/genai`（版本 `^2.28.0`，不升到 3.x），串流回答；網站仍是純靜態網頁 |
| 金鑰 | 學生自己到 Google AI Studio（https://aistudio.google.com/apikey）申請、自己貼上；程式裡不寫死任何金鑰 |
| 金鑰保存 | 預設存在這個分頁（`sessionStorage`，關掉分頁就忘記）；勾選「在這台電腦記住」才存進 `localStorage`；可以清除 |
| 對話範圍 | 一段對話屬於「某個電路 + 某個錯誤」；改了電路或對另一個錯誤發問，就重新開始。同一時間只有一段對話 |
| 自動重試 | 不做。出錯時顯示原因，由學生決定要不要再問（免費額度用完時自動重試只會一直失敗） |
| 快取 | 不做。電路摘要只有幾千 token，Gemini 的上下文快取用不到也不划算 |
| 套件大小 | `@google/genai` 用動態 `import()`，第一次按「問 AI」才載入（約 450 KB，gzip 後約 72 KB）；網站版開啟速度不受影響。單一 HTML 離線版會把它內嵌進去，檔案變大約 450 KB |
| 離線版 | 單一 HTML 離線版也能問 AI，但要有網路；沒有網路時顯示「連不上 Gemini」 |

### 1.1 費用與隱私（設定對話框上要寫清楚）

- **免費額度**：學生不用綁信用卡就能用。免費額度的內容**可能會被 Google 用來改進產品**，所以不要在問題裡寫個人資料。免費額度每分鐘有次數上限。
- **付費金鑰**：費用由金鑰的擁有人支付。價格（2026-10）：輸入每百萬 token US$1.50、輸出（含思考）每百萬 token US$9。
  一次追問約 3,000 個輸入 token、1,000 個輸出 token，約 US$0.014（新台幣 0.5 元以下）。介面上寫「一次追問通常不到新台幣 1 元」。
- **送出的內容**：目前的電路摘要（板子、元件、導線、Net）、這個錯誤與離線解說、學生的問題。不送檔名、不送使用者資料。
- **金鑰**：官方文件提醒不要把金鑰寫死在網頁程式碼裡。這裡的金鑰是學生在自己的瀏覽器裡貼上、只存在自己的瀏覽器，只會送到 Google 的 API 網址（`generativelanguage.googleapis.com`）。

## 2. 畫面

### 2.1 解說卡上的「問 AI」

接在離線解說卡（`data-testid="explanation"`）的最下面，`data-testid="ask-ai"`：

```
─── 問 AI（Gemini）────────────────
[為什麼會這樣？] [有沒有別的改法？] [實體麵包板上要注意什麼？]
┌──────────────────────────────┐ [送出]
│ 自己打字問…                   │
└──────────────────────────────┘
你：為什麼會這樣？
Gemini：74LS00 的 VCC（第 14 腳）……
AI 的回答可能有錯，請以實際電路和老師的說明為準。
```

- **還沒設定金鑰**：只顯示一句「問 AI 需要網路和你自己的 Gemini API 金鑰」和按鈕「設定 Gemini API 金鑰」，點了打開設定對話框（2.2）。
- **三個建議問題**：只在對話還沒開始時顯示；點了直接送出那個問題。
- **自己打字**：輸入框（最多 500 字）+「送出」；按 Enter 送出，Shift+Enter 換行；空白問題不能送。
- **回答中**：建議問題與「送出」停用，顯示「停止」按鈕與「Gemini 回答中…」。回答一段一段出現在最後一則訊息。
- **對話紀錄**：「你：」與「Gemini：」交替，保留換行（`whitespace-pre-wrap`）。訊息 `data-ai-message="user" | "model"`。
- **按「停止」**：已經收到的部分留著，後面標「（已停止）」。這一輪不算進對話紀錄（下一則追問時 Gemini 看不到它）。
- **出錯**：已經收到的部分留著；下面用紅字顯示錯誤原因（第 4 節），`data-testid="ai-error"`。金鑰錯誤時旁邊有「重新設定金鑰」按鈕。
- **免責聲明**：對話開始後在最下面顯示「AI 的回答可能有錯，請以實際電路和老師的說明為準。」

### 2.2 金鑰設定對話框

用現有的 `Modal`（`Dialogs.tsx`），`dialog: 'ai-key'`，標題「Gemini API 金鑰」。從兩個地方打開：解說卡上的「設定 Gemini API 金鑰」，以及「說明」選單的「Gemini API 金鑰設定…」。

- 說明文字：
  - 「問 AI」會把目前的電路內容、錯誤說明和你的問題送到 Google Gemini（模型 gemini-3.5-flash）。
  - 到 Google AI Studio 免費申請金鑰（連結，另開分頁）。
  - 免費額度：不用付費，但內容可能被 Google 用來改進產品，請不要在問題裡寫個人資料；每分鐘有次數上限。
  - 付費金鑰：費用由金鑰擁有人支付，一次追問通常不到新台幣 1 元。
- 金鑰輸入框：`type="password"`、`autoComplete="off"`，label「API 金鑰」。已經有金鑰時輸入框是空的，提示「已設定（輸入新的金鑰會取代）」。
- 勾選「在這台電腦記住（關掉分頁後仍保留）」：預設不勾；已經記住的金鑰打開時是勾著的。
- 目前狀態：「目前沒有金鑰」/「已設定，只保留到關掉這個分頁」/「已設定，記在這台電腦」。
- 按鈕：「清除金鑰」（有金鑰時才出現，清除後對話框保持開著）、「取消」、「儲存」（輸入框空白時：只更新「記住」的勾選；兩者都沒變就只是關閉）。
- 不檢查金鑰格式、不先打 API 測試；金鑰錯誤會在第一次發問時顯示。

## 3. 送給 Gemini 的內容

### 3.1 系統指示（`systemInstruction`，固定文字）

```
你是數位邏輯實驗課的助教，幫學生理解麵包板電路（MB-102 麵包板、74LS 系列 IC、電阻、LED、電源）的錯誤。
- 用繁體中文回答，白話、先講結論；一般不超過 200 字，學生要求詳細說明時才寫長。
- 孔位沿用這個網站的寫法：A–J 加上編號（例如 A10、F23）；電源軌 T+、T-、B+、B- 加上編號（例如 T+10）；多塊麵包板時孔位前面有板子 ID（例如 b2:A12）。
- 只根據提供的電路摘要回答，不要編造摘要裡沒有的元件、導線或孔位；摘要不足以判斷時，直接說不確定，並說要檢查什麼。
- 建議修改時寫出要從哪個孔接到哪個孔。
- 不要用 Markdown 語法（不要用 **、#、表格、程式碼區塊）；需要分點時用「1.」「2.」。
- 和這個電路或數位邏輯無關的問題，簡短說明你只能回答這個電路的問題。
```

### 3.2 第一則訊息

對話的第一則訊息 = 電路摘要 + 錯誤 + 學生的問題；之後的追問只送問題本身（前面的對話由套件的 `Chat` 一起送出）。

```
【電路摘要】
孔位規則：編號相同的 A–E 五個孔相通（例如 A10–E10）、F–J 五個孔相通（例如 F10–J10），中間凹槽隔開；T+、T-、B+、B- 四條電源軌各自整條相通。
麵包板：b1
元件：
- U1 74LS00：第 1 腳 1A @ F10、第 2 腳 1B @ F11、…、第 14 腳 VCC @ E10
- R1 電阻 220 Ω：第 1 腳 @ A20、第 2 腳 @ A24
- D1 LED（紅色）：第 1 腳 A（陽極）@ …、第 2 腳 K（陰極）@ …
導線：
- g1 黑色：E16 → B-16
連在一起的腳（Net）：
- GND（地）：U1 第 7 腳、G1 第 1 腳
- NET_3（訊號）：U1 第 3 腳、R1 第 1 腳
沒有和其他腳相連的腳：U1 第 1 腳、U1 第 2 腳、…

【學生正在看的錯誤】
U1（74LS00）第 14 腳 VCC 未連接
為什麼：74LS 晶片要從 VCC 腳拿 +5 V 才會動作；……
建議的改法：
1. 從 U1 第 14 腳那一排的空孔 A10，拉一條線到上方的 + 電源軌 T+10。

【學生的問題】
為什麼會這樣？
```

- 由純函式產生（`src/editor/explain/brief.ts`），不碰網頁，可以單獨測試；孔位一律用 `holeLabel`，和畫面上一樣。
- 元件：ID、元件名稱（`def.name`）、重要屬性（電阻值、LED 顏色、電源電壓、時脈頻率），以及每一隻腳的編號、名稱、孔位。
- 導線：ID、顏色中文名、起點 → 終點。
- Net：只列兩隻腳以上的 Net（名稱、種類、腳）；只有一隻腳的另外列成一行「沒有和其他腳相連的腳」。
- 錯誤：錯誤訊息、離線解說的「為什麼」與步驟（`plainText`，`{0}` 換成孔位名稱）。

### 3.3 技術設定

- `ai.chats.create({ model: 'gemini-3.5-flash', config: { systemInstruction, thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } } })`
- 每一則：`chat.sendMessageStream({ message, config: { ...同上, abortSignal } })`，逐段取 `chunk.text`。
- 套件的 `Chat` 只在一輪回答完整收到後才把這一輪記進對話紀錄；中途停止或出錯的那一輪不會送給下一則追問。
  Gemini 3 多輪對話需要的思考簽章（thought signature）由套件保存、原樣送回。
- 不設 `retryOptions`（套件預設不重試）。

## 4. 出錯時

錯誤分類由純函式 `classifyAiError(error)` 決定（依 `ApiError.status` 與錯誤種類），文字固定：

| 種類 | 條件 | 顯示 |
|---|---|---|
| `bad-key` | 401、403；或 400 且訊息提到 API key | 金鑰不正確或沒有權限，請重新設定。（附「重新設定金鑰」按鈕） |
| `rate-limit` | 429 | 已達使用上限（免費額度每分鐘有次數限制），請稍等一下再問。 |
| `busy` | 500–599 | Gemini 暫時忙碌，請稍後再試。 |
| `network` | `TypeError`（fetch 失敗） | 連不上 Gemini，請確認網路。 |
| `empty` | 回答完整結束但沒有任何文字（例如被安全機制擋下） | Gemini 沒有回答這個問題，請換個問法。 |
| `unknown` | 其他 | Gemini 回傳錯誤，請稍後再試。（附狀態碼，如果有） |

- 按「停止」造成的中斷（`AbortError`）不是錯誤：只標「（已停止）」。
- 回答中改了電路：停止這一輪、清掉這段對話（畫面上這個錯誤可能已經不存在）。
- 出錯後可以直接再問；對話紀錄不受影響。

## 5. 程式結構

| 檔案 | 內容 |
|---|---|
| `src/editor/explain/brief.ts` | `circuitBrief(circuit)`、`issueBrief(circuit, issue)`、`AI_SYSTEM_INSTRUCTION`、`firstMessage(circuit, issue, question)`；純函式，不碰網頁 |
| `src/ai/gemini.ts` | `GEMINI_MODEL`、`createGeminiSession(apiKey, systemInstruction, fetchImpl?)` → `AiSession { send(message, signal): AsyncGenerator<string> }`；動態載入 `@google/genai` |
| `src/ai/errors.ts` | `AiErrorKind`、`classifyAiError(error)`、`aiErrorText(kind, status?)` |
| `src/state/apiKey.ts` | `loadApiKey()`、`saveApiKey(key, remember)`、`clearApiKey()`；`sessionStorage` / `localStorage`，瀏覽器不允許時只留在記憶體 |
| `src/state/ai.ts` | 獨立的 Zustand store `useAi`：`key`、`chat`；`setKey`、`clearKey`、`ask(circuit, issue, question)`、`stop()` |
| `src/components/PropertyPanel/AskAi.tsx` | 2.1 的畫面 |
| `src/components/common/Dialogs.tsx` | 2.2 的 `AiKeyDialog`；`store.ts` 的 `Dialog` 加上 `'ai-key'` |
| `src/components/Toolbar/Toolbar.tsx` | 「說明」選單加「Gemini API 金鑰設定…」 |

- `useAi.chat` = `{ circuit, issue, messages, sending, error }`；`circuit` 與 `issue` 是參照，畫面只在兩者都和目前一樣時顯示這段對話。
- `ask` 對不同的電路或錯誤發問時，先停止舊的一輪、開新的一段對話（新的 `AiSession`）。
- 串流途中每收到一段就檢查 `useStore.getState().circuit` 是否還是同一個；不是就停止並清掉對話。
- 主 store（`store.ts`）只多一個對話框種類，其他不動。

## 6. 測試（不會花到真的錢）

- **單元測試**（`tests/editor/brief.test.ts`）：電路摘要列出元件與腳位孔位、導線、Net、單腳；錯誤段落含離線解說步驟的孔位；第一則訊息含三段。
- **單元測試**（`tests/web/ai.test.ts`）：
  - `classifyAiError` 的每一種分類。
  - `createGeminiSession` 用注入的假 `fetch` 回傳 SSE 串流：網址是 `gemini-3.5-flash:streamGenerateContent`、帶 `x-goog-api-key`、`systemInstruction` 與 `thinkingLevel: MEDIUM`；第二則請求含第一輪的問答；中途停止的那一輪不會出現在下一則請求。
  - 金鑰保存：不勾記住只在 `sessionStorage`、勾了只在 `localStorage`、清除兩邊都沒有。
  - `useAi.ask`（用 `vi.mock` 換掉 `createGeminiSession`）：第一則含摘要、追問不含；錯誤時保留已收到的文字並記錄錯誤種類；停止時標記已停止；換電路時清掉對話。
- **端對端測試**（`e2e/ask-ai.spec.ts`）：用 Playwright 攔截 `generativelanguage.googleapis.com`，回傳假的 SSE 串流。
  - 沒有金鑰 → 設定金鑰 → 點錯誤 → 按建議問題 → 看到回答 → 打字追問 → 第二個請求含第一輪問答。
  - 假的 400（API key not valid）→ 顯示金鑰錯誤與「重新設定金鑰」。
  - 不勾記住時金鑰不在 `localStorage`。

## 7. 之後可以做（這次不做）

- 回答裡的孔位（例如 A10）變成可以點的按鈕。
- 佈線解說、整體電路摘要、IC 腳位說明。
- 老師提供金鑰的後端代理（避免學生自己申請）。
