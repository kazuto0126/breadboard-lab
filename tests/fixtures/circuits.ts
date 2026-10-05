import type { Circuit } from '../../src/types/circuit';
import { circuit, comp, wire } from './build';

/** 需求文件第三十四章的驗收電路：74LS00 第 1 閘輸入接地 → 1Y → 電阻 → LED → GND。 */
export function acceptanceCircuit(): Circuit {
  return circuit(
    [
      comp('V1', 'vcc', 'T+5'),
      comp('G1', 'gnd', 'B-5'),
      comp('U1', '74LS00', 'F10'),
      comp('R1', 'resistor', 'G30'),
      comp('D1', 'led', 'G40'),
    ],
    [
      wire('w1', 'T+6', 'A10'), // VCC → U1 第 14 腳
      wire('w2', 'B-6', 'J16'), // GND → U1 第 7 腳
      wire('w3', 'J10', 'I16'), // U1 第 1 腳 → GND
      wire('w4', 'J11', 'H16'), // U1 第 2 腳 → GND
      wire('w5', 'J12', 'J30'), // U1 第 3 腳（1Y）→ R1
      wire('w6', 'J34', 'J40'), // R1 → LED 陽極
      wire('w7', 'J41', 'B-41'), // LED 陰極 → GND
    ],
  );
}
