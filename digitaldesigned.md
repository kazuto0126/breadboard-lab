# 麵包板標準佈線 AI 工具 — 完整開發規格

請你擔任一名資深的「前端工程師、電路模擬器開發者、EDA/PCB Routing 演算法工程師」。

我要開發一個類似 Tinkercad Circuits 的「虛擬麵包板電路設計工具」，但本工具的核心特色是：

> 使用者可以在虛擬 800 孔麵包板上自行放置 74LS 系列 IC、電阻、LED、電源等元件並自行接線；完成後，系統可以分析使用者目前的電路拓撲，並自動計算出「最標準、最整齊」的麵包板實體配線方式。

---

# 一、產品核心目標

建立一個 Web App，讓使用者可以：

1. 看見一個真實比例的 800 孔麵包板。
2. 放置電子元件。
3. 移動、旋轉、刪除元件。
4. 使用滑鼠拖曳導線連接麵包板孔與元件腳位。
5. 像 Tinkercad 一樣自由建立電路。
6. 系統即時判斷連線是否有效。
7. 使用者完成電路後，按下「AI 標準佈線」。
8. 系統分析目前電路拓撲。
9. 自動重新計算每一條實體導線的最佳走法。
10. 導線必須符合「麵包板標準佈線」規則：

* 只允許水平線與垂直線。
* 所有轉角必須是 90°。
* 不允許斜線。
* 導線不能互相重疊。
* 儘量避免交叉。
* 儘量減少導線總長度。
* 儘量減少轉彎次數。
* 儘量讓電路整齊、容易閱讀。
* 優先使用最短且規則的路徑。

11. 最後以動畫方式展示「最佳化後的配線」。

---

# 二、重要觀念：不要把它當普通畫圖軟體

這不是單純 Canvas/SVG 畫線工具。

請把系統設計成：

「Circuit Graph + Breadboard Grid + Routing Engine + Renderer」

四個主要層次。

## 1. Circuit Graph

負責描述「電路邏輯」。

例如：

Component A → Pin 1 → Net A

Component B → Pin 3 → Net A

代表兩個腳位屬於同一個 electrical net。

---

## 2. Breadboard Grid

負責描述實際麵包板孔位。

每個孔都必須具有：

* row
* column
* x
* y
* electrical group
* occupied / empty
* component pin / wire connection
* routing availability

例如：

H12
H13
H14
H15
H16

必須能知道它們是否在同一個麵包板導電群組。

---

## 3. Routing Engine

負責計算：

「從 A 孔到 B 孔，怎麼走才是最佳標準配線？」

不要直接用簡單的直線。

請建立真正的 Grid-based Pathfinding。

優先考慮：

* A*
* Dijkstra
* Lee algorithm
* Multi-objective routing

推薦：

第一階段使用 A*。

之後加入 multi-net routing 與成本函數。

---

## 4. Renderer

將 Routing Engine 算出的路徑顯示在畫面上。

Renderer 不負責決定路徑。

Routing Engine 只輸出：

[
{
start: {row, col},
end: {row, col},
path: [
{row, col},
{row, col},
...
]
}
]

Renderer 再將 path 轉成水平 / 垂直線段。

---

# 三、麵包板模型

第一版請支援：

## 800 孔麵包板

建立標準 800-tie-point breadboard 模型。

UI 上要清楚呈現：

* 上方電源軌
* 下方電源軌
* 中央 IC 區
* 左右兩側端子區
* 中央凹槽
* 孔位編號

每個孔都必須是獨立可選取的 Grid Node。

---

# 四、麵包板電氣連接規則

這是整個工具最重要的部分之一。

不能只根據「兩個孔看起來靠近」判斷是否連通。

必須建立 Breadboard Connectivity Model。

例如：

中央區：

A1-A5 為同一組 electrical node。

B1-B5 為另一組 electrical node。

中央凹槽左右兩側不得直接導通。

電源軌則依麵包板模型定義。

所有連接關係必須由資料模型控制。

建立：

BreadboardNode

BreadboardGroup

ElectricalNet

ComponentPin

Wire

等資料結構。

---

# 五、元件庫

第一版至少提供以下元件：

## 74LS 系列

至少包含：

* 74LS00
* 74LS02
* 74LS04
* 74LS08
* 74LS32
* 74LS74
* 74LS86
* 74LS90
* 74LS93
* 74LS138
* 74LS154
* 74LS161
* 74LS163
* 74LS173
* 74LS174
* 74LS175
* 74LS193
* 74LS245
* 74LS273
* 74LS283

架構必須允許之後繼續加入其他 74LS IC。

不要把 IC 寫死在 UI 裡。

使用：

Component Definition JSON

例如：

{
"id": "74LS00",
"name": "74LS00",
"package": "DIP14",
"pins": [...],
"logic": {...}
}

---

# 六、其他元件

至少提供：

### 電阻

* 220Ω
* 330Ω
* 470Ω
* 1kΩ
* 2.2kΩ
* 4.7kΩ
* 10kΩ
* 100kΩ

### LED

至少提供：

* 紅 LED
* 綠 LED
* 黃 LED
* 藍 LED

LED 必須具有：

* Anode
* Cathode

並在 UI 上清楚標示。

### 其他

至少支援：

* VCC
* GND
* DC Power
* Switch
* Push Button
* Jumper Wire

架構必須允許未來增加：

* Capacitor
* Diode
* Transistor
* 555
* 74HC 系列
* 74LS 系列其他 IC

---

# 七、使用者操作方式

操作體驗要接近 Tinkercad。

## 放置元件

使用者從左側 Component Library 選擇元件。

拖曳到 Breadboard。

放置時自動 Snap 到合法位置。

---

## 移動

滑鼠拖曳元件。

元件必須以 Grid Snap 移動。

不能出現半孔位置。

---

## 旋轉

支援：

R

或右鍵：

Rotate 90°

---

## 接線

使用者點擊：

起點孔

↓

拖曳

↓

終點孔

建立導線。

導線預設顯示：

水平 / 垂直。

禁止斜線。

---

# 八、導線顯示

每條導線應該是一個 Wire Object。

例如：

{
"id": "wire_001",
"netId": "net_01",
"color": "red",
"start": {...},
"end": {...},
"path": [...]
}

Wire 不應該只保存 start/end。

必須保存完整 path。

---

# 九、標準佈線演算法

這是本產品最核心功能。

當使用者按下：

「AI 標準佈線」

系統執行：

## STEP 1

分析所有元件。

## STEP 2

分析所有 Component Pin。

## STEP 3

建立 Electrical Net。

例如：

NET_1：

74LS00 Pin 3
→ LED Anode
→ resistor

NET_2：

GND
→ LED Cathode

---

# 十、Routing Algorithm

使用 Grid Graph。

每個可走線的位置都是 Node。

相鄰 Node：

上
下
左
右

不可使用：

左上
右上
左下
右下

因此天然禁止斜線。

---

# 十一、Routing Cost Function

不要只追求最短距離。

建立：

TotalCost =

DistanceCost
+
BendCost
+
CrossingCost
+
OverlapCost
+
CongestionCost
+
AestheticCost

例如：

DistanceCost = pathLength × 1.0

BendCost = bends × 5

CrossingCost = crossings × 1000

OverlapCost = overlap × 10000

CongestionCost = congestion × 20

AestheticCost = irregularity × 10

實際數值可以透過設定檔調整。

最重要的是：

「重疊」必須幾乎視為禁止。

---

# 十二、絕對禁止

Routing Engine 不可以產生：

1. 斜線
2. 導線重疊
3. 導線穿過元件
4. 導線穿過不可用孔位
5. 導線穿過 IC 本體
6. 導線穿過其他障礙物
7. 不合法的麵包板孔位
8. 電氣上不存在的連接

---

# 十三、優先順序

請將最佳化優先順序設計為：

第一優先：

Electrical correctness

第二優先：

No overlap

第三優先：

No crossing

第四優先：

Shortest total wire length

第五優先：

Minimum bends

第六優先：

Visual cleanliness

因此：

「短但交叉很多」

不能勝過：

「稍微長一點但非常整齊」。

---

# 十四、多條導線最佳化

不能一條一條獨立算。

例如：

Net A
Net B
Net C
Net D

必須考慮其他已經存在的線。

建議使用：

Sequential Rip-up and Reroute

流程：

1. 建立所有 Net。
2. 按照優先級排序。
3. Route Net A。
4. Route Net B。
5. Route Net C。
6. 發現衝突時重新 Route。
7. 找到更好的全域解。
8. 持續迭代。
9. 到達最佳化門檻後停止。

---

# 十五、路由排序

可以優先處理：

1. 距離最長的 Net
2. 選擇空間最少的 Net
3. 最容易造成瓶頸的 Net
4. IC 重要訊號
5. 電源
6. 一般訊號

建立：

routingPriorityScore()

---

# 十六、AI 的角色

這個工具不要讓 AI 直接「猜一條線」。

AI 的角色應該是：

### AI Layer

負責：

* 分析電路
* 理解使用者意圖
* 發現接線錯誤
* 解釋錯誤
* 建議最佳化
* 選擇 Routing Strategy
* 對 Routing Engine 提供參數

### Deterministic Routing Engine

負責：

* 真正計算路徑
* 保證不斜線
* 保證不重疊
* 保證不穿越障礙
* 保證符合 Grid

這樣可以避免 AI 產生不可靠的線路。

---

# 十七、電路錯誤檢查

使用者完成電路後，要提供：

「Check Circuit」

功能。

至少檢查：

* 未連接腳位
* VCC 未連接
* GND 未連接
* LED 極性錯誤
* 電阻缺失
* 短路
* 兩個不同 Net 意外連接
* IC 腳位衝突
* 元件位置不合法
* Wire 沒有連到有效 Node

錯誤要直接標示在麵包板上。

例如：

紅色：

⚠ Short Circuit

黃色：

⚠ Pin 5 未連接

綠色：

✓ Circuit Valid

---

# 十八、標準佈線結果

當使用者按下：

「AUTO ROUTE」

畫面應該：

1. 暫時隱藏原始導線。
2. 計算最佳路徑。
3. 顯示 Routing Animation。
4. 導線逐條出現。
5. 最後顯示：

「Standard Routing Complete」

並顯示統計：

Wire Count: 18

Total Length: 142 holes

Bends: 23

Crossings: 0

Overlaps: 0

Routing Score: 94.2

---

# 十九、Routing Score

建立 0~100 的評分。

例如：

100：

* 無重疊
* 無交叉
* 距離短
* 轉彎少
* 分布整齊

90：

非常好。

70：

可以使用，但仍可最佳化。

50：

配線混亂。

0：

電路無法完成。

---

# 二十、兩種模式

提供：

## MANUAL MODE

使用者自己接線。

## AUTO ROUTE MODE

系統自動重新計算所有導線。

另外提供：

## COMPARE MODE

左側：

User Routing

右側：

AI Standard Routing

讓使用者比較兩者。

---

# 二十一、UI

請設計成專業 EDA 工具風格。

畫面：

┌─────────────────────────────────────┐
│ Logo │ File │ Edit │ Circuit │ Auto Route │
├────────┬────────────────────┬───────┤
│        │                    │       │
│ Parts  │                    │ Info  │
│        │    Breadboard      │       │
│ 74LS   │                    │ Pin   │
│ Resistor│                   │ Net   │
│ LED    │                    │ Error │
│ Power  │                    │       │
│        │                    │       │
├────────┴────────────────────┴───────┤
│ Status │ Wires │ Nets │ Routing Score │
└─────────────────────────────────────┘

---

# 二十二、麵包板視覺

不要做成一般電路圖。

必須讓使用者感覺：

「我真的正在一塊麵包板上插元件。」

需要：

* 真實孔位
* DIP IC
* 元件腳
* Jumper wire
* 中央溝槽
* Power rail
* Row / Column labels

但整體仍然保持清楚、現代化。

---

# 二十三、Zoom / Pan

Canvas 必須支援：

Mouse Wheel Zoom

Middle Mouse Pan

Space + Drag Pan

Fit to Screen

Reset View

---

# 二十四、選取系統

點擊：

孔

元件

Pin

Wire

Net

都可以選取。

選取後：

* 高亮
* 顯示資訊
* 顯示相關 Net

例如選擇：

74LS00 Pin 3

則所有連接到該 Pin 的 Wire 與 Net 都高亮。

---

# 二十五、資料結構

至少建立以下 TypeScript interfaces：

Component

Pin

Wire

Net

Breadboard

BreadboardNode

BreadboardGroup

RoutingNode

RoutingPath

Circuit

CircuitError

RoutingResult

---

# 二十六、Undo / Redo

必須支援：

Ctrl + Z

Ctrl + Shift + Z

所有操作都必須可以 Undo：

* 放置元件
* 移動
* 旋轉
* 刪除
* 接線
* 刪線
* Auto Route

---

# 二十七、儲存

支援：

New Circuit

Save

Save As

Load

Export JSON

Import JSON

Auto Save

電路資料應該可以完整序列化。

---

# 二十八、匯出

至少支援：

PNG

SVG

JSON

未來可以支援：

PDF

---

# 二十九、效能

即使：

50 個元件

100 條 Wire

50 個 Net

也應保持流暢。

Routing Engine 不應阻塞 UI。

使用：

Web Worker

處理大型 Routing 計算。

---

# 三十、技術建議

如果沒有特別原因，請使用：

Frontend:

React + TypeScript

Rendering:

HTML Canvas 或 PixiJS

State:

Zustand

Styling:

Tailwind CSS

Routing:

獨立 TypeScript Routing Engine

不要把 Routing Algorithm 寫死在 React Component。

架構：

src/

components/

Breadboard/
ComponentLibrary/
Wire/
Toolbar/
PropertyPanel/

core/

circuit/
breadboard/
routing/
simulation/

data/

components/
74ls/

workers/

routing.worker.ts

utils/

types/

---

# 三十一、重要：Rendering 與 Logic 分離

不要把所有程式寫在單一 App.tsx。

必須做到：

UI Layer

↓

Circuit State

↓

Circuit Graph

↓

Routing Engine

↓

Routing Result

↓

Renderer

這樣未來才能加入真正的數位邏輯模擬。

---

# 三十二、第一階段 MVP

第一階段不要急著做完整 74LS 邏輯模擬。

先完成：

1. 800 孔麵包板
2. Grid
3. 元件拖曳
4. DIP IC
5. 電阻
6. LED
7. VCC/GND
8. Wire
9. Manual Wiring
10. 電氣連接模型
11. Circuit Validation
12. A* Routing
13. 90° Orthogonal Routing
14. No-overlap
15. No-crossing
16. Routing Score
17. Undo/Redo
18. Save/Load

完成以上功能後，再加入：

74LS Logic Simulation。

---

# 三十三、測試

請建立自動測試。

至少測試：

## Test 1

兩個孔之間：

結果必須只有水平 / 垂直。

## Test 2

兩條 Wire。

不能重疊。

## Test 3

兩條 Wire 有可能交叉。

Routing Engine 必須選擇不交叉路徑。

## Test 4

障礙物存在。

Wire 不可以穿過 IC。

## Test 5

多個 Net。

所有 Net 都必須完成。

## Test 6

沒有合法路徑。

系統必須回報：

"No valid routing solution."

而不是產生錯誤線路。

---

# 三十四、最重要的驗收標準

完成後，我要能做到：

1. 開啟網站。
2. 看見 800 孔麵包板。
3. 從元件庫拖入 74LS00。
4. 放入 LED。
5. 放入電阻。
6. 放入 VCC / GND。
7. 手動接線。
8. 按「Check Circuit」。
9. 系統檢查電路。
10. 按「AI Standard Route」。
11. 系統分析所有 Electrical Nets。
12. 自動重新計算 Wire Path。
13. 所有線只走水平 / 垂直。
14. 不允許導線重疊。
15. 儘可能避免導線交叉。
16. 儘量縮短總線長度。
17. 儘量減少轉角。
18. 顯示 Routing Score。
19. 顯示最佳化前後差異。
20. 可以 Undo。

---

# 三十五、開發方式

請不要一次建立一個只有 UI 的假 Demo。

必須先建立真正的資料模型與 Routing Engine。

開發順序：

Phase 1：
Breadboard Grid + Data Model

Phase 2：
Component Placement

Phase 3：
Electrical Connectivity

Phase 4：
Manual Wire

Phase 5：
Circuit Validation

Phase 6：
A* Orthogonal Routing

Phase 7：
Multi-Net Routing

Phase 8：
No-overlap / No-crossing Optimization

Phase 9：
Routing Score

Phase 10：
74LS Component Library

Phase 11：
Digital Logic Simulation

Phase 12：
UI Polish

每完成一個 Phase 都先測試，再進入下一階段。

---

# 三十六、關鍵限制

請不要使用：

* 斜線 Wire
* Bezier Curve
* 自由角度 Wire
* 只靠 CSS 假裝有麵包板
* 假的 Auto Route
* 隨機產生路徑
* AI 直接輸出 SVG 當 Routing Algorithm

Routing 必須是真正基於 Grid Graph 的演算法。

---

# 三十七、未來擴充

請確保架構未來可以加入：

* 74LS 數位邏輯模擬
* Clock
* Logic Analyzer
* Oscilloscope
* Truth Table
* Circuit Simulation
* 電壓 / 電流計算
* 自動偵錯
* AI Circuit Assistant
* 「為什麼這條線要這樣走？」
* 自動產生麵包板接線教學
* 電路轉麵包板 Layout
* 麵包板 Layout 轉 Circuit Diagram
* PCB Layout
* 多種麵包板尺寸
* 400 / 800 / 830 tie-point breadboard



---
# 三十八、多麵包板長邊並排與自動群組

本工具支援多塊麵包板。

但不需要複雜的任意角度、多方向、多層級 Board Routing。

採用簡單且符合實際使用方式的設計：

> 多塊麵包板可以左右自由移動；當兩塊麵包板的「長邊」靠近到指定距離時，自動吸附（Snap）並精確對齊。成功貼合後，這些麵包板視為同一個「麵包板群組（Board Group）」。

---

# 38.1 麵包板排列限制

麵包板只支援：

「長邊對長邊」

的並排方式。

例如：

```text
┌──────────────────────┐
│      Breadboard A    │
└──────────────────────┘
┌──────────────────────┐
│      Breadboard B    │
└──────────────────────┘
```

或者：

```text
┌──────────────────────┐┌──────────────────────┐
│    Breadboard A      ││    Breadboard B      │
└──────────────────────┘└──────────────────────┘
```

兩塊板必須保持：

* 相同方向
* 相同旋轉角度
* 長邊互相對齊
* 不允許斜角貼合

---

# 38.2 自動 Snap

使用者拖曳一塊麵包板靠近另一塊麵包板時：

如果兩塊板符合：

1. 長邊相對
2. 距離小於 Snap Distance
3. 方向相同
4. 長邊投影範圍符合貼合條件

則自動吸附。

例如：

```text
拖曳前：

┌──────────────────┐

┌──────────────────┐
```

靠近：

```text
┌──────────────────┐
          ↓
┌──────────────────┐
```

達到 Snap Distance：

```text
┌──────────────────┐
└──────────────────┘
```

系統自動調整成：

```text
┌──────────────────┐
│   Board A        │
└──────────────────┘
┌──────────────────┐
│   Board B        │
└──────────────────┘
```

---

# 38.3 Snap Distance

建立設定：

```typescript
SNAP_DISTANCE
```

例如：

```typescript
const SNAP_DISTANCE = 24;
```

實際數值應根據 Canvas Zoom 自動換算。

因此：

使用者放大或縮小畫面時，Snap 行為仍然一致。

---

# 38.4 精確對齊

Snap 不只是「吸到附近」。

吸附後必須做到：

X 或 Y 座標完全對齊。

例如兩塊板上下排列：

```text
Board A:
x = 100
y = 100

Board B:
x = 100
y = 420
```

其中：

```text
Board B.x === Board A.x
```

如果左右排列：

```text
Board B.y === Board A.y
```

不能出現：

```text
Board A
┌────────────────────┐
└────────────────────┘

     ┌────────────────────┐
     └────────────────────┘
     Board B
```

Snap 後必須變成：

```text
┌────────────────────┐
└────────────────────┘
┌────────────────────┐
└────────────────────┘
```

---

# 38.5 Board Group

兩塊麵包板成功 Snap 後：

自動建立：

```typescript
BoardGroup
```

例如：

```text
Group 1

├── Breadboard A
└── Breadboard B
```

如果第三塊麵包板再貼到 B：

```text
Group 1

├── Breadboard A
├── Breadboard B
└── Breadboard C
```

因此：

```text
A + B + C
```

視為一個連續的大型麵包板群組。

---

# 38.6 群組的核心概念

非常重要：

「Board Group 是視覺與空間上的群組，不代表不同麵包板的孔位自動導通。」

例如：

```text
┌───────────────┐
│ Board A       │
└───────────────┘
┌───────────────┐
│ Board B       │
└───────────────┘
```

雖然：

```text
A + B = Group 1
```

但是：

Board A 的孔

與

Board B 的孔

仍然是不同的 Electrical Nodes。

除非使用者實際用導線連接。

這一點一定要保留。

---

# 38.7 Routing Engine 對 Board Group 的處理

Routing Engine 不需要把每塊板當成完全獨立的世界。

當：

```text
Board A
Board B
```

形成：

```text
Group 1
```

之後：

Routing Engine 可以將：

```text
Board A + Board B
```

視為一個大型連續 Routing Canvas。

例如：

```text
┌────────────────┐
│                │
│    Board A     │
│                │
└────────────────┘
┌────────────────┐
│                │
│    Board B     │
│                │
└────────────────┘
```

建立：

```text
Group Coordinate System
```

讓 Routing Engine 能夠在同一個群組座標系中計算路徑。

---

# 38.8 Group Coordinate System

每個 Board Group 有：

```typescript
interface BoardGroup {
  id: string;

  boardIds: string[];

  x: number;
  y: number;

  width: number;
  height: number;

  rotation: 0 | 180;
}
```

每塊 Board 仍保留自己的：

```typescript
interface BreadboardInstance {
  id: string;

  groupId: string | null;

  localX: number;
  localY: number;

  width: number;
  height: number;
}
```

---

# 38.9 群組移動

當使用者拖曳群組中的任何一塊麵包板時：

如果該板已經屬於 Group：

整個 Group 一起移動。

例如：

```text
Group 1

┌───────────────┐
│ Board A       │
└───────────────┘
┌───────────────┐
│ Board B       │
└───────────────┘
```

拖曳 A：

↓

A + B 一起移動。

---

# 38.10 群組選取

點擊群組內任意一塊板：

整個 Group 顯示：

```text
Blue Group Outline
```

並顯示：

```text
Board Group 1
2 Boards
```

---

# 38.11 拆開群組

如果使用者將其中一塊麵包板拖離其他板：

當距離超過：

```text
SNAP_DISTANCE
```

系統自動解除 Group。

例如：

```text
原本：

┌───────────────┐
│ Board A       │
└───────────────┘
┌───────────────┐
│ Board B       │
└───────────────┘

Group 1
```

拖開 B：

```text
┌───────────────┐
│ Board A       │
└───────────────┘


                    ┌───────────────┐
                    │ Board B       │
                    └───────────────┘
```

變成：

```text
Board A → Group 2
Board B → Group 3
```

如果 B 再靠近另一個群組：

則自動加入新的 Group。

---

# 38.12 Group 合併

如果：

```text
Group 1

Board A
Board B
```

靠近：

```text
Group 2

Board C
Board D
```

而兩個群組的邊緣符合 Snap 條件：

自動：

```text
Group 1 + Group 2
```

合併成：

```text
Group 3

Board A
Board B
Board C
Board D
```

---

# 38.13 群組內的板必須保持對齊

Group 內的麵包板：

禁止：

```text
┌────────────────┐
│ Board A        │
└────────────────┘
    ┌────────────────┐
    │ Board B        │
    └────────────────┘
```

必須：

```text
┌────────────────┐
│ Board A        │
└────────────────┘
┌────────────────┐
│ Board B        │
└────────────────┘
```

或：

```text
┌──────────┐┌──────────┐
│ Board A  ││ Board B  │
└──────────┘└──────────┘
```

也就是：

「長邊完全對齊」。

---

# 38.14 Group 內 Routing

當 Board Group 建立後：

Routing Engine 可以直接把 Group 視為一個大的 Grid。

例如：

```text
Board A + Board B

┌──────────────────┐
│                  │
│                  │
├──────────────────┤
│                  │
│                  │
└──────────────────┘
```

Routing Engine 建立：

```text
Group Grid
```

但必須保留每個孔原本所屬的：

```text
boardId
nodeId
```

所以：

「空間上是同一個 Routing Group」

不代表：

「電氣上自動相連」。

---

# 38.15 群組與導線

如果導線從：

Board A

連到：

Board B

即使兩塊板已經貼合：

仍然必須透過真實 Wire 連接。

不能因為：

```text
A.groupId === B.groupId
```

就認定兩個孔導通。

---

# 38.16 UI 操作

麵包板靠近另一塊板時：

顯示：

```text
↔ Snap
```

即將吸附時：

顯示淡藍色預覽線：

```text
┌──────────────────┐
└──────────────────┘
        ↓
     SNAP HERE
        ↓
┌──────────────────┐
```

完成後：

兩塊板出現共同的 Group Outline。

---

# 38.17 不支援的排列方式

第一版本不需要支援：

* 斜角貼合
* 45° 貼合
* 任意角度貼合
* 上下左右以外的旋轉排列
* 立體排列
* Board 重疊
* Board 疊放

只需要：

「水平長邊貼合」

以及：

「垂直長邊貼合」。

---

# 38.18 最重要的資料模型

最終架構：

```text
Circuit
│
├── BoardGroups
│   │
│   ├── Group 1
│   │   ├── Board A
│   │   └── Board B
│   │
│   └── Group 2
│       ├── Board C
│       └── Board D
│
├── Components
│
├── Nets
│
└── Wires
```

---

# 38.19 最終驗收

必須做到：

### 測試 1

新增兩塊 800 孔麵包板。

可以自由拖曳。

### 測試 2

將 B 靠近 A。

達到 Snap Distance。

自動吸附。

### 測試 3

吸附後：

A + B 自動成為同一個 Board Group。

### 測試 4

拖曳 A。

A + B 一起移動。

### 測試 5

將 B 拉離 A。

Group 自動解除。

### 測試 6

新增 C。

將 C 靠近 B。

B + C 自動形成新的群組。

如果 B 已經與 A 同群：

A + B + C 必須合併成同一 Group。

### 測試 7

Group 內的不同麵包板：

電氣上不能因為貼合而自動導通。

### 測試 8

使用者用 Wire 連接兩塊板。

才建立真正的 Electrical Net。

### 測試 9

Auto Route 時：

同一 Group 可以使用共同的 Group Coordinate System。

### 測試 10

所有 Wire 仍然遵守：

* 水平
* 垂直
* 90° 轉彎
* 不重疊
* 不穿越元件
* 儘量不交叉
* 儘量最短
* 儘量少轉彎

---

# 核心設計原則

不要把「多塊麵包板」做成複雜的多世界系統。

本工具的模型應該是：

單一麵包板：

```text
Board
```

貼合後：

```text
Board + Board
        ↓
   Board Group
```

多塊貼合後：

```text
Board + Board + Board + Board
              ↓
         Board Group
```

Routing Engine 對 Group 使用統一座標系。

但是 Electrical Connectivity 仍然完全獨立。

因此：

「物理上貼在一起 ≠ 電氣上導通」。

這個原則必須嚴格遵守。

---

# 最重要的產品理念

這個工具不是「AI 畫線」。

而是：

「使用者設計電路 → 系統建立 Electrical Net → Routing Engine 在真實麵包板 Grid 上尋找最佳實體配線 → AI 負責分析、解釋與協助最佳化。」

請以這個架構實作。

如果某個功能與「正確的電氣連接」或「標準麵包板佈線」互相衝突，優先保證電氣正確性與 Routing Constraint，而不是視覺效果。

請先建立可執行的 MVP，再逐步增加功能。

不要只產生設計稿。

我要的是可以實際操作的 Web App。
