# 麵包板上的便條（子專案 18）設計規格

- 日期：2026-10-13
- 狀態：已完成（2026-10-13）

---

## 0. 目的

學生與老師可以在麵包板畫面上任何地方貼一張便條，寫實驗步驟、提醒或說明；便條可以指向一個元件。便條只是註記，不影響電路。

## 1. 決定

| 項目 | 決定 |
|---|---|
| 資料 | `Circuit.notes?: Note[]`；沒有便條時不寫這個欄位（舊檔案、舊測試不變） |
| 位置 | 世界座標（mm），一律對齊 2.54 mm；和麵包板無關，可以在板子外面 |
| 內容 | 純文字、可以換行，最多 200 字；前後空白去掉；空白的便條在結束編輯時刪除 |
| 大小 | 寬固定 12 格（30.48 mm）；高度依行數（自動換行後）計算，畫面上算 |
| 顏色 | `yellow`（預設）、`blue`、`green`、`pink` |
| 指向 | `target?: string`（元件 ID）；畫一條細虛線到元件本體中心；元件刪除時拿掉 `target` |
| 新增 | 「電路」選單「新增便條」與快捷鍵 N：放在目前畫面中間，選取並進入編輯 |
| 編輯 | 雙擊便條直接改字（textarea）；屬性面板也能改字、顏色、指向、刪除；Del 刪除選取的便條 |
| 移動 | 拖曳；放開時對齊格子；一次拖曳是一個復原步驟 |
| 不影響 | 佈線、檢查、模擬、Net、接線清單都不看便條；便條畫在導線上層、半透明（0.9），不擋點擊以外的操作 |
| 不做 | 邏輯圖上的便條、文字格式、指向孔位、留言串；右鍵新增（右鍵目前用來取消放置元件，避免衝突） |

```ts
// src/types/circuit.ts
export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink';
export interface Note {
  id: string;        // n1、n2…
  x: number;         // 左上角，世界座標 mm（2.54 的倍數）
  y: number;
  text: string;
  color: NoteColor;
  target?: string;   // 元件 ID
}
```

## 2. 編輯動作（`src/editor/notes.ts`，純函式）

- `NOTE_MAX = 200`、`NOTE_WIDTH_MM = 30.48`。
- `nextNoteId(circuit)`、`addNote(circuit, x, y): { circuit, id }`（對齊格子、空字串、黃色）、
  `moveNote(circuit, id, x, y)`（對齊格子；沒變回傳原物件）、`setNoteText(circuit, id, text)`（去前後空白、截到 200 字）、
  `setNoteColor`、`setNoteTarget(circuit, id, target | null)`（目標不存在時不變）、`removeNote(circuit, id)`。
- 刪除元件（`deleteComponent` 等）時，指向它的便條拿掉 `target`。
- 所有動作沒有改變時回傳原本的 Circuit（參照不變）。

## 3. 存檔（`src/editor/fileFormat.ts`）

- 輸出：有便條時寫 `circuit.notes`。
- 讀檔：`notes` 必須是陣列；每個要有字串 `id`（不重複）、數字 `x`、`y`、字串 `text`、合法 `color`；`target` 是字串且是存在的元件，
  否則忽略 `target`。`text` 超過 200 字截斷。錯誤訊息照現有格式（路徑 + 原因）。
- 自動暫存、專案、匯出、單一 HTML 版都用同一個格式，不用另外處理。

## 4. Store（`src/state/store.ts`）

- `Selection` 加 `{ kind: 'note'; id: string }`。
- 動作：`addNoteAtCenter()`（N 鍵、選單；選取並設 `editingNote`）、`moveNote`、`setNoteText`、`setNoteColor`、`setNoteTarget`、
  `deleteSelection` 支援便條；全部經 `commit()` 進復原。
- `editingNote: string | null`：正在雙擊編輯的便條。結束編輯（失焦、Esc、Ctrl+Enter）時寫回文字；空白就刪掉這張便條
  （新增後直接結束、沒打字也會刪掉，不留下空便條）。
- 佈線計算中、模擬中：便條照樣可以編輯（不是結構編輯，不用 `guardEdit`）。

## 5. 畫面

- `src/components/Breadboard/NoteLayer.tsx`：在導線上層畫所有便條（`data-note={id}`）：圓角方塊、底色依顏色、文字自動換行；
  選取時外框加粗；有 `target` 時畫虛線到元件本體中心（`data-note-arrow`）。
- 拖曳：按住便條拖動，移動中顯示預覽位置，放開時 `moveNote`。點一下選取，雙擊進入編輯（`foreignObject` 裡的 textarea，`aria-label="便條內容"`）。
- 屬性面板（選取便條）：「便條」區段——文字框（`aria-label="便條文字"`）、四個顏色按鈕、「指向」下拉（無 + 所有元件 ID）、刪除。
- 「電路」選單多「新增便條（N）」；說明對話框的快捷鍵列表加上 N。

## 6. 測試

- 單元：`tests/editor/notes.test.ts`（新增對齊、改字截斷與去空白、顏色、指向不存在的元件、刪除元件時拿掉指向、沒有改變時回傳原物件）；
  檔案格式（來回、錯誤訊息、壞掉的 target 忽略、沒有便條時不寫欄位）；佈線結果與 Net 不受便條影響。
- store（`tests/web/`）：新增 → 選取與編輯狀態、空白結束編輯時刪除、移動與改字可以復原、Del 刪除。
- 端對端：N 新增、打字、拖曳移動、屬性面板換顏色與指向（虛線出現）、重新整理後還在、Ctrl+Z 復原。

## 7. 子專案 20：從元件庫拖曳、寬度跟著文字（2026-10-13，使用者同意）

- 元件庫在「麵包板」下面多一張「便條 Note」：拖到麵包板畫布上放開，就在放開的地方新增便條並開始編輯；沒拖就放開 = 放在畫面中間（和 N 一樣）。
  拖曳時有一個跟著游標的小預覽；放在畫布外面不新增。觸控時往旁邊拖才算拿起來（上下滑是捲動清單）。
- store 動作 `addNoteAt(x, y)`（世界座標 mm，左上角）；`addNoteAtCenter` 改用它。
- 寬度跟著文字：最窄 3 格、最寬 12 格（超過換行，高度跟著變）；編輯中固定最寬，方便打字。指向元件的虛線從便條左上角附近出發。
