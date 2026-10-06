import { mkdirSync, writeFileSync } from 'node:fs';
import { createProject } from '../src/app/model/projectFile';
import { serializeProject } from '../src/app/persistence/projectIO';
import type { ComponentInstance } from '../src/types/component';
import { wire } from '../tests/fixtures/build';
import { acceptanceCircuit, syntheticCircuit } from '../tests/fixtures/circuits';

const savedAt = new Date('2026-10-06T00:00:00Z');

/** syntheticCircuit 的元件都是 0° 的兩腳元件：電阻兩腳相距 4 格，LED 相距 1 格。 */
function pinsOf(c: ComponentInstance): [[number, number], [number, number]] {
  const span = c.defId === 'resistor' ? 4 : 1;
  return [
    [c.anchor.x, c.anchor.y],
    [c.anchor.x + span, c.anchor.y],
  ];
}

/** 規格第 13.3 節：50 個元件、100 條導線。 */
const dense = syntheticCircuit();
const parts = dense.components;
dense.wires.push(...parts.map((c, k) => wire(`v${k}`, pinsOf(c)[1], pinsOf(parts[(k + 29) % parts.length])[0])));

mkdirSync('e2e/fixtures', { recursive: true });
writeFileSync('e2e/fixtures/acceptance.breadboard.json', serializeProject({ ...createProject('驗收電路', savedAt), circuit: acceptanceCircuit() }));
writeFileSync('e2e/fixtures/dense.breadboard.json', serializeProject({ ...createProject('效能測試', savedAt), circuit: dense }));
console.log(`dense: ${dense.components.length} components, ${dense.wires.length} wires`);
