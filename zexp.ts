import { readFileSync } from 'node:fs';
import { convertAndRoute } from './src/logic/convertRoute';
const f = JSON.parse(readFileSync('bcd-adder-8-8.json', 'utf8'));
const d = f.logic;
for (const totalMs of (process.argv[2] ?? '40000').split(',').map(Number)) {
  const t = performance.now();
  const r = convertAndRoute(d, { switchTo: 'vcc', board: 'auto', pulls: true, displayResistors: 'shared' } as never, { totalMs });
  const s = ((performance.now() - t) / 1000).toFixed(0);
  if (!r.ok) console.log(totalMs, 'fail', r.reason);
  else console.log(totalMs, s + 's', r.routed.status, 'failed', r.routed.failedNets.length, 'wires', r.routed.wires.length);
}
