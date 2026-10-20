import type { Circuit, CircuitError, CircuitErrorCode } from '../../types/circuit';
import { explanation, step } from './helpers';
import type { Explanation } from './types';

/** 規格第 3 節：每種錯誤的「為什麼」與通用的「怎麼改」。 */
export const ISSUE_TEXT: Record<CircuitErrorCode, { why: string; fix: string }> = {
  IC_POWER_MISSING: {
    why: '74LS 晶片要從 VCC 腳拿 +5 V、從 GND 腳接地才會動作；這隻腳沒有接上，整顆 IC 都不會工作。',
    fix: '用導線把這隻腳所在的那一排接到電源軌：VCC 腳接 + 軌、GND 腳接 − 軌。',
  },
  NO_POWER_SOURCE: {
    why: '電路裡沒有 VCC 和 GND，任何元件都拿不到電。',
    fix: '從元件庫放一個 VCC 到 + 電源軌、一個 GND 到 − 電源軌，再把用到電的元件接到這兩條軌。',
  },
  INPUT_FLOATING: {
    why: 'TTL 輸入腳空著時會被當成 HIGH，但很容易受雜訊干擾，結果時好時壞。',
    fix: '要用的話接到開關或其他閘的輸出；用不到的話接到 + 電源軌，讓它固定是 HIGH。',
  },
  SWITCH_NO_PULL: {
    why: '開關斷開時，接 IC 輸入的那一側沒有接到任何電位（懸空）。模擬時當成理想開關，但實際的 TTL 輸入懸空會讀成 1，或受雜訊影響。',
    fix: '開關另一端接 +5 V 時，在輸入那一側加一顆電阻（例如 330 Ω）接到 GND；接 GND 時，加一顆電阻（例如 1 kΩ）接到 +5 V。',
  },
  PIN_UNCONNECTED: {
    why: '這隻腳所在的那一排只有它自己，沒有接到任何東西，電流沒有路可走。',
    fix: '從這一排的空孔拉線到要接的地方（電源軌，或另一個元件的腳所在的那一排）。',
  },
  LED_NO_RESISTOR: {
    why: 'LED 直接接在電源上電流太大，會燒掉 LED 或 IC 的輸出腳；要串一顆 220–330 Ω 的電阻限流。',
    fix: '在 LED 陰極那一側串一顆 220 Ω 電阻：電阻一腳和陰極插同一排，另一腳插到新的一排，原本接陰極的線改接到新的那一排。',
  },
  LED_REVERSED: {
    why: 'LED 只能單向導通：陽極（A，長腳）要接高電位、陰極（K，短腳）接 GND。現在接反了，LED 不會亮。',
    fix: '把 LED 轉半圈，讓陽極和陰極對調位置。',
  },
  SHORT_CIRCUIT: {
    why: '電源沒有經過任何元件就直接接到 GND（或接到不同電壓的電源），電流非常大，電源會過熱或啟動保護。',
    fix: '找出把電源和 GND 接在一起的那條導線，先拔掉它，再確認原本想接到哪裡。',
  },
  PLACEMENT_INVALID: {
    why: '元件有腳沒插在孔上，或兩腳距離太小，實體元件插不進去。',
    fix: '把元件拖到每隻腳都在孔上的位置；電阻、LED 可以在屬性面板加長兩腳距離。',
  },
  PIN_COLLISION: {
    why: '一個孔只能插一隻腳或一條線，兩個東西擠在同一孔實際上插不進去。',
    fix: '移開其中一個元件或導線，改插同一排的其他空孔（同一排是導通的，接法不變）。',
  },
  BODY_OVERLAP: {
    why: '兩個元件的本體疊在一起，實體上放不下。',
    fix: '把其中一個元件移到旁邊空的位置。',
  },
  WIRE_ENDPOINT_INVALID: {
    why: '導線的端點要插在空孔上：不能在板面、元件下面，也不能和別條線插同一孔。',
    fix: '刪掉這條線，從空孔重新拉一條；要接同一排時改用同一排的其他空孔。',
  },
  WIRE_PATH_INVALID: {
    why: '導線要沿著孔走、只能水平或垂直轉彎；這條線的路徑不合法（通常是舊檔案或手動編輯的檔案造成）。',
    fix: '刪掉這條線重新拉。',
  },
  WIRE_THROUGH_OBSTACLE: {
    why: '跳線平貼在板上，不能壓過元件的腳、本體或別條線的端點。',
    fix: '刪掉這條線重新拉（接線時會自動繞開），或按「AI 標準佈線」。',
  },
  WIRE_OVERLAP: {
    why: '兩條線在板上疊在同一段，實際上插不下，也很難看出誰接誰。',
    fix: '刪掉其中一條改走別的路，或按「AI 標準佈線」重新排。',
  },
  WIRE_DIAGONAL: {
    why: '導線只能水平或垂直（子專案 39 的接線規則）：斜的線在實體麵包板上不好插，也不好對照。',
    fix: '刪掉這條線，改成水平或垂直的線；要轉彎就分成兩條，轉角接在同一排相通的孔。或按「AI 標準佈線」。',
  },
  WIRE_BENT: {
    why: '一條線不能轉彎（子專案 39 的接線規則）：實體跳線是一段直的，要轉彎就要用兩條線。',
    fix: '刪掉這條線，改成兩條直線，轉角接在同一排相通的孔。或按「AI 標準佈線」。',
  },
  WIRE_CROSSING: {
    why: '兩條線不能十字交叉（子專案 39 的接線規則）：交叉的地方疊在一起，很難看出誰接誰，也容易插錯。',
    fix: '刪掉其中一條改走別的路（繞到旁邊空的一排再轉彎），或按「AI 標準佈線」重新排。',
  },
  IC_PIN_SHORT: {
    why: 'IC 的兩隻腳插在同一條導通排上，等於被接在一起（通常是 IC 沒有跨在中間凹槽上）。',
    fix: '把 IC 移到跨過中間凹槽的位置，讓上下兩排腳分開。',
  },
  OUTPUT_CONFLICT: {
    why: '兩個輸出腳接在一起（或輸出腳直接接電源），兩邊各自想送 HIGH / LOW 會互相打架，可能燒壞 IC。',
    fix: '一個 Net 只能有一個輸出；拔掉多出來的那條連線，必要時改用邏輯閘合併。',
  },
  COMPONENT_SHORTED: {
    why: '元件的兩隻腳插在同一條導通排上，電流直接從排上流過，元件等於沒接。',
    fix: '把元件轉 90° 或移位置，讓兩隻腳在不同的排。',
  },
  CIRCUIT_VALID: {
    why: '電路檢查通過，沒有錯誤也沒有警告。',
    fix: '可以按「AI 標準佈線」整理導線，再照接線清單插實體麵包板。',
  },
};

export function genericExplanation(_circuit: Circuit, issue: CircuitError): Explanation {
  const text = ISSUE_TEXT[issue.code];
  return explanation(text.why, [step(text.fix)]);
}
