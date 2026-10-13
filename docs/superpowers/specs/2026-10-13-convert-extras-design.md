# 轉成麵包板的加強：只用 NAND、板上標出名稱（子專案 14）設計規格

- 日期：2026-10-13
- 狀態：規格（等使用者確認）
- 前一份：`2026-10-13-logic-to-breadboard-design.md`（子專案 13）第 10 節「之後」的前一項與第三項（使用者 2026-10-13 選擇；7 段顯示器這次不做）

---

## 0. 目的

1. 實驗室只要備一種 IC：轉換時可以選「只用 NAND（74LS00）」，所有閘都用 NAND 組出來，真值表照樣比對一致。
2. 學生一看就知道哪個開關是哪個輸入、哪顆 LED 是哪個輸出：板上與接線清單標出 A、B、C…、X、Y…。

## 1. 決定

| 項目 | 決定 |
|---|---|
| 閘的種類 | 轉換對話框多一組選項「照種類對應」（預設）／「只用 NAND（74LS00）」 |
| NAND 換算 | 第 2 節的表；先拆成 2 輸入，再換成 NAND；重複的反相只做一次、反相兩次抵消 |
| 名稱存在哪 | 元件屬性 `labels?: string[]`：指撥開關第 k 個開關用 `labels[k]`；LED 用 `labels[0]` |
| 名稱規則 | 前後空白去掉；空字串代表沒有名稱；最多 8 個字 |
| 誰可以改 | 轉換時自動填；屬性面板可以手動改，任何指撥開關、LED 都可以加名稱 |
| 不做 | 7 段顯示器輸出、只用 NOR |

## 2. 換成 NAND（`src/logic/nandOnly.ts`）

先用子專案 13 的 `decompose` 拆成 2–4 輸入的單元，3、4 輸入的 AND 再拆成 2 輸入（`AND(AND(a, b), c)`…），然後每個單元照下表換成 NAND（記號 `N(a, b)` 是一個 2 輸入 NAND）：

| 單元 | NAND 組法 | 個數 |
|---|---|---|
| NOT x | `N(x, x)` | 1 |
| NAND a, b | `N(a, b)` | 1 |
| AND a, b | `NOT(N(a, b))` | 2 |
| OR a, b | `N(NOT a, NOT b)` | 3 |
| NOR a, b | `NOT(OR a, b)` | 4 |
| XOR a, b | `t = N(a, b)`；`N(N(a, t), N(b, t))` | 4 |

化簡（換完之後做，直到不再改變）：
- 反相兩次抵消：`NOT(NOT x)` 換成 x（`NOT y` 指 `N(y, y)`）。
- 相同的閘只做一次：兩個 NAND 的輸入（不分順序）相同時共用一個輸出。
- 沒有接到任何地方的 NAND 拿掉。

結果是一串 `NAND2` 單元，交給子專案 13 的 `assignIcs`（全部是 74LS00）與 `toBreadboard`。

## 3. 對話框

「轉成麵包板」對話框在「指撥開關的接法」上面加：

```
閘的種類
( ) 照種類對應（AND → 74LS08、OR → 74LS32…）
( ) 只用 NAND（74LS00）：所有閘都用 NAND 組出來，實驗室只要準備一種 IC
```

預覽照實際結果寫，例如「會用到：74LS00 × 3、4 位元指撥開關 × 1、電阻 × 4、LED × 1」。
`ConvertOptions` 多一個 `gates: 'direct' | 'nand'`（預設 `'direct'`）。

## 4. 板上的名稱

- 轉換時：開關第 k 個用第 k 個輸入端的名稱；每顆 LED 用它的輸出端名稱。
- 畫法：
  - 指撥開關：每個開關的上方（本體外，靠 E 列那一側）寫名稱，字小、粗體、深色；沒有名稱的不寫。
  - LED：LED 旁邊（右上）寫名稱。
  - 名稱跟著元件旋轉時仍保持正向（和元件上的文字一樣）。
- 屬性面板：選到指撥開關時列出每個開關的名稱輸入框（`開關 1 名稱`…）；選到 LED 時一個「名稱」輸入框。改名進 Undo。
- 接線清單：指撥開關的腳寫成「SW1 第 1 個開關（A）」，LED 寫成「D1（X）」；沒有名稱時照舊。
- 存檔：`props.labels` 寫進檔案；讀檔時檢查是字串陣列、每個最多 8 個字（超過就截斷）。舊檔沒有這個欄位照常開啟。

## 5. 程式結構

| 檔案 | 內容 |
|---|---|
| `src/logic/nandOnly.ts` | 第 2 節：`toNandUnits(units: Unit[]): Unit[]` |
| `src/logic/synth.ts`、`toBreadboard.ts` | `ConvertOptions.gates`；`'nand'` 時用 `toNandUnits(decompose(d))`；開關與 LED 填 `labels` |
| `src/types/component.ts`、`src/editor/fileFormat.ts` | `ComponentProps.labels?: string[]` 與讀檔檢查 |
| `src/editor/commands.ts`、`src/state/store.ts` | `setLabel(id, index, text)`（進 Undo） |
| `src/components/Breadboard/ComponentGraphic.tsx` | 畫名稱 |
| `src/components/PropertyPanel/PropertyPanel.tsx` | 名稱輸入框 |
| `src/editor/checklist.ts` | 清單文字帶名稱 |
| `src/components/common/Dialogs.tsx` | 「閘的種類」選項 |

## 6. 測試

- **單元測試**：
  - 每一種單元（NOT、NAND、AND、OR、NOR、XOR，含 3、4 輸入的 AND / OR / NAND / NOR）換成 NAND 後，對所有輸入組合的結果和原本相同。
  - 化簡：`NOT(NOT x)` 抵消；同一個訊號反相兩次只做一次；沒用到的閘拿掉。
  - 圖 2-5「只用 NAND」：只有 74LS00；兩種開關接法在佈線前後真值表全部一致。
  - `labels`：轉換後 SW1 是 `['A', 'B', 'C', '']`（4 位元開關用 3 個）、D1 是 `['X']`；存檔讀檔不變；超過 8 個字截斷；`setLabel` 可以復原。
  - 接線清單的文字帶名稱。
- **端對端**：圖 2-5 用「只用 NAND」轉換 → 板上只有 74LS00、比對「全部一致」、看得到 A、B、C、X 的標示；在屬性面板把 A 改成 IN1，板上跟著改。
