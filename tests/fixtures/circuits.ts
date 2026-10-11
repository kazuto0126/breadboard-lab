import type { Circuit } from '../../src/types/circuit';
import type { ComponentInstance } from '../../src/types/component';
import { circuit, comp, wire } from './build';

// 範例電路由 src/editor/examples.ts 提供；這裡的測試保證範例一定佈得出來。
export { acceptanceCircuit, adderCircuit, counterCircuit, eicCircuit, sevenSegmentCircuit, timerCounterCircuit, twoBoardCircuit } from '../../src/editor/examples';

/** 效能測試用：50 個兩腳元件、50 條使用者導線，每條把元件 k 的腳 1 接到元件 (k+17) mod 50 的腳 2。 */
export function syntheticCircuit(): Circuit {
  const parts: Array<{ instance: ComponentInstance; pins: [[number, number], [number, number]] }> = [];
  for (let k = 0; k < 12; k++) {
    const x = 1 + 5 * k;
    parts.push({ instance: comp(`RA${k}`, 'resistor', [x, 4]), pins: [[x, 4], [x + 4, 4]] });
    parts.push({ instance: comp(`RJ${k}`, 'resistor', [x, 15]), pins: [[x, 15], [x + 4, 15]] });
  }
  for (let k = 0; k < 13; k++) {
    const x = 2 + 5 * k;
    parts.push({ instance: comp(`DC${k}`, 'led', [x, 6]), pins: [[x, 6], [x + 1, 6]] });
    parts.push({ instance: comp(`DH${k}`, 'led', [x, 13]), pins: [[x, 13], [x + 1, 13]] });
  }
  const wires = parts.map((part, k) => wire(`u${k}`, part.pins[0], parts[(k + 17) % parts.length].pins[1]));
  return circuit(parts.map((p) => p.instance), wires);
}

/** 子專案 8：74LS00 放在最右邊，電阻與 LED 在最左邊，1Y 的線要橫跨整塊板。 */
export function farIcCircuit(): Circuit {
  return circuit(
    [comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3'), comp('U1', '74LS00', 'F45'), comp('R1', 'resistor', 'G5'), comp('D1', 'led', 'G15')],
    [
      wire('w1', 'T+45', 'A45'), // VCC → U1 第 14 腳
      wire('w2', 'B-51', 'J51'), // GND → U1 第 7 腳
      wire('w3', 'J45', 'B-45'), // 第 1 腳 → GND
      wire('w4', 'J46', 'B-46'), // 第 2 腳 → GND
      wire('w5', 'J47', 'J5'), // 1Y → R1
      wire('w6', 'J9', 'J15'), // R1 → LED 陽極
      wire('w7', 'J16', 'B-16'), // LED 陰極 → GND
    ],
  );
}
