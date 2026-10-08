import type { GridPoint } from '../../types/geometry';

/** 一個修改步驟。text 裡的 {0}、{1} 代表 holes[0]、holes[1]（畫面上變成可以點的孔位按鈕）。 */
export interface ExplainStep {
  text: string;
  holes: GridPoint[];
}

export interface Explanation {
  why: string;
  steps: ExplainStep[];
  /** 板上用綠色虛線圈標示並編號的孔：依步驟裡第一次出現的順序，不重複。 */
  holes: GridPoint[];
  /** 建議的導線路徑（綠色虛線預覽）。 */
  wires: GridPoint[][];
  /** 建議拔掉的既有導線。 */
  removeWireIds: string[];
}
