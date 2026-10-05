import { autoRoute, renderAscii, scoreRouting, type Circuit } from '../src/index';
import { acceptanceCircuit, adderCircuit, counterCircuit } from '../tests/fixtures/circuits';

const fixtures: Array<[string, Circuit]> = [
  ['驗收電路：74LS00 + 電阻 + LED', acceptanceCircuit()],
  ['74LS93 計數器 + Push Button + 4 顆 LED', counterCircuit()],
  ['8 位元指撥開關 → 74LS283 → 5 顆 LED', adderCircuit()],
];

for (const [title, circuit] of fixtures) {
  const before = scoreRouting(circuit);
  const result = autoRoute(circuit);
  console.log(`\n=== ${title} ===\n`);
  console.log('使用者接線：');
  console.log(renderAscii(circuit));
  console.log('\nAI 標準佈線：');
  console.log(renderAscii(circuit, result.wires));
  console.log(`\n${result.message}`);
  console.table({
    使用者接線: { ...before.metrics, score: before.score },
    標準佈線: { ...result.metrics, score: result.score },
  });
  for (const f of result.failedNets) console.log(`  ✗ ${f.netId}：${f.reason}（${f.detail}）`);
  console.log(`  協商 ${result.stats.iterations} 輪，耗時 ${result.stats.elapsedMs} ms`);
}
