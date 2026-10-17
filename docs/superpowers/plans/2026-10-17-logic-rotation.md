# 邏輯圖元件轉向 Implementation Plan

> 執行方式：在這個對話內依序實作（executing-plans），每個任務先寫測試、看它失敗、再實作。

**Goal:** 邏輯閘與 IC 方塊可以轉 90° / 180° / 270°，線從正確的方向接進每一隻腳。

**Spec:** `docs/superpowers/specs/2026-10-17-logic-rotation-design.md`

## Global Constraints

- 沒轉的邏輯圖：腳位、方框、線的畫法完全不變（現有測試要全過）。
- `src/logic/` 純函式；`nodeSize` 保持沒轉時的大小，佔用範圍一律改用 `boxOf`。

## Review Focus

1. 轉 90° / 270° 的元件寬高互換：重疊、框選、Fit、拖曳範圍都要用轉過的方框。
2. 轉向後腳的位置和本體範圍一致：線不能被當成「穿過」自己接的元件。
3. 朝上 / 朝下的輸出：匯流線是橫的，分岔黑點要畫在橫線上。
4. 轉向時保持中心而且是整數格；轉了會重疊就整批不轉。
5. 讀檔：輸入端、顯示器等不能有 rotation；角度只能是 90 / 180 / 270。

---

### Task 1：幾何（`rotation` 型別、腳位、`boxOf`、`bodyRect`、方向）＋ 用到方框的地方（重疊、框選、Fit）＋ 讀檔
### Task 2：轉向的編輯（`rotateNodes`、`setRotation`）與 store、快捷鍵 R
### Task 3：線（匯流線方向、候選路線、分岔黑點）
### Task 4：畫面（閘轉向、IC 方塊依方向畫、屬性面板的方向按鈕）＋ 端對端測試
### Task 5：文件
