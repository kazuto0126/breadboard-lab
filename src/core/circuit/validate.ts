import { buildLattice, isRoutablePoint } from '../breadboard/lattice';
import { nodeIdOf, parseNodeId } from '../breadboard/naming';
import type { Circuit, CircuitError, Net, PinRef } from '../../types/circuit';
import type { PinRole } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import {
  componentLabel,
  groupInfo,
  groupOfPoint,
  indexCircuit,
  nodeAt,
  pinDefinition,
  pinPoint,
  propsOf,
  pushTo,
  type CircuitIndex,
  type PlacedComponent,
} from './circuitIndex';
import { effectiveSpan } from './footprint';
import { compareIds, extractNetsWith, netByPin, netHasSource, pinKey } from './nets';
import { analyzeWireInteractions, cellsUnder, pathIssues } from './wireGeometry';

type Report = (error: Pick<CircuitError, 'code' | 'severity' | 'message'> & Partial<CircuitError>) => void;

export function validateCircuit(circuit: Circuit): CircuitError[] {
  const index = indexCircuit(circuit);
  const errors: CircuitError[] = [];
  const report: Report = (e) => errors.push({ points: [], componentIds: [], wireIds: [], netIds: [], ...e });

  checkPlacement(index, report);
  checkWires(circuit, index, report);
  checkElectrical(index, extractNetsWith(index, circuit.wires), report);

  if (errors.length === 0) report({ code: 'CIRCUIT_VALID', severity: 'info', message: '✓ Circuit Valid：電路檢查通過' });
  return errors;
}

/** 孔位名稱；多塊板時加上板子 ID（例如 b2:A12）。 */
function holeLabel(index: CircuitIndex, p: GridPoint): string {
  const name = nodeAt(index, p)?.name ?? `(${p.x}, ${p.y})`;
  return index.boards.size > 1 ? `${p.boardId}:${name}` : name;
}

function sortedEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return [...map.entries()].sort(([a], [b]) => compareIds(a, b));
}

function checkPlacement(index: CircuitIndex, report: Report): void {
  for (const pc of index.placed) {
    const offHole = pc.footprint.pins.filter((p) => nodeAt(index, p.point)?.kind !== 'hole');
    const pkg = pc.def.package;
    const spanTooSmall = pkg.type === 'two-lead' && effectiveSpan(pc.instance, pc.def) < pkg.minSpan;
    if (offHole.length > 0 || spanTooSmall) {
      report({
        code: 'PLACEMENT_INVALID',
        severity: 'error',
        message: `${componentLabel(pc)} 的位置不合法：${spanTooSmall ? '兩腳距離太小' : '有腳沒有插在孔上'}`,
        points: offHole.map((p) => p.point),
        componentIds: [pc.instance.id],
      });
    }
  }

  for (const [nodeId, pins] of sortedEntries(index.pinsAt)) {
    if (pins.length < 2) continue;
    const point = parseNodeId(nodeId);
    report({
      code: 'PIN_COLLISION',
      severity: 'error',
      message: `${holeLabel(index, point)} 同時插了 ${pins.length} 隻腳`,
      points: [point],
      componentIds: [...new Set(pins.map((p) => p.componentId))].sort(compareIds),
    });
  }

  const reported = new Set<string>();
  for (const [nodeId, owners] of sortedEntries(index.bodiesAt)) {
    const involved = new Set(owners);
    for (const pin of index.pinsAt.get(nodeId) ?? []) involved.add(pin.componentId);
    if (involved.size < 2) continue;
    const ids = [...involved].sort(compareIds);
    const key = ids.join('|');
    if (reported.has(key)) continue;
    reported.add(key);
    report({
      code: 'BODY_OVERLAP',
      severity: 'error',
      message: `${ids.join('、')} 的元件本體重疊`,
      points: [parseNodeId(nodeId)],
      componentIds: ids,
    });
  }
}

function checkWires(circuit: Circuit, index: CircuitIndex, report: Report): void {
  // 導線可以經過板上的格點，或同一個 Board Group 兩塊板之間的接縫。
  const lattice = buildLattice(circuit.boards);
  const isOnBoard = (p: GridPoint) => isRoutablePoint(lattice, p);
  const endsAt = new Map<string, string[]>();
  for (const w of circuit.wires) for (const p of [w.start, w.end]) pushTo(endsAt, nodeIdOf(p), w.id);

  for (const w of circuit.wires) {
    const issues = pathIssues(w, isOnBoard, lattice);
    if (issues.length > 0) {
      report({
        code: 'WIRE_PATH_INVALID',
        severity: 'error',
        message: `導線 ${w.id} 的路徑不合法（${issues.join(', ')}）`,
        wireIds: [w.id],
        points: [w.start, w.end],
      });
    }

    for (const end of [w.start, w.end]) {
      const node = nodeAt(index, end);
      const id = nodeIdOf(end);
      if (!node || node.kind !== 'hole') {
        report({ code: 'WIRE_ENDPOINT_INVALID', severity: 'error', message: `導線 ${w.id} 的端點沒有接在有效的孔上`, wireIds: [w.id], points: [end] });
      } else if (index.pinsAt.has(id)) {
        report({
          code: 'PIN_COLLISION',
          severity: 'error',
          message: `${node.name} 同時插了元件腳和導線 ${w.id}`,
          wireIds: [w.id],
          points: [end],
          componentIds: index.pinsAt.get(id)!.map((p) => p.componentId),
        });
      } else if (index.bodiesAt.has(id)) {
        report({
          code: 'WIRE_ENDPOINT_INVALID',
          severity: 'error',
          message: `導線 ${w.id} 的端點 ${node.name} 被元件本體擋住`,
          wireIds: [w.id],
          points: [end],
          componentIds: index.bodiesAt.get(id)!,
        });
      }
    }

    // 手動接線可以一孔多線（規格 2026-10-10 straight-wires 第 1 節）；自動佈線的一孔一線由 checkRoutingLegality 把關。
    const blockedAt = cellsUnder(w, lattice).find((p) => {
      const id = nodeIdOf(p);
      return index.pinsAt.has(id) || index.bodiesAt.has(id) || (endsAt.get(id) ?? []).some((other) => other !== w.id);
    });
    if (blockedAt) {
      report({
        code: 'WIRE_THROUGH_OBSTACLE',
        severity: 'error',
        message: `導線 ${w.id} 穿過了元件或其他導線的端點（${holeLabel(index, blockedAt)}）`,
        wireIds: [w.id],
        points: [blockedAt],
      });
    }
  }

  const byPair = new Map<string, { wireIds: string[]; points: GridPoint[] }>();
  for (const o of analyzeWireInteractions(circuit.wires, lattice).overlaps) {
    const key = JSON.stringify(o.wireIds);
    const entry = byPair.get(key) ?? { wireIds: [...o.wireIds], points: [] };
    entry.points.push(parseNodeId(o.nodeId));
    byPair.set(key, entry);
  }
  for (const { wireIds, points } of byPair.values()) {
    report({ code: 'WIRE_OVERLAP', severity: 'error', message: `導線 ${wireIds[0]} 與 ${wireIds[1]} 重疊`, wireIds, points });
  }
}

function checkElectrical(index: CircuitIndex, nets: Net[], report: Report): void {
  const byPin = netByPin(nets);
  const role = (ref: PinRef): PinRole | undefined => pinDefinition(index, ref)?.role;
  const netHas = (net: Net | undefined, wanted: PinRole) =>
    net !== undefined &&
    (net.pins.some((r) => role(r) === wanted) ||
      (wanted === 'vcc-source' && netHasSource(net, index, 'vcc')) ||
      (wanted === 'gnd-source' && netHasSource(net, index, 'gnd')));
  const pointsOf = (refs: PinRef[]) => refs.map((r) => pinPoint(index, r)).filter((p): p is GridPoint => p !== undefined);
  const componentsOf = (refs: PinRef[]) => [...new Set(refs.map((r) => r.componentId))].sort(compareIds);
  const refOf = (pc: PlacedComponent, pinNumber: number): PinRef => ({ componentId: pc.instance.id, pinNumber });

  const hasSource =
    index.placed.some((pc) => pc.def.pins.some((p) => p.role === 'vcc-source' || p.role === 'gnd-source')) ||
    nets.some((n) => netHasSource(n, index, 'vcc') || netHasSource(n, index, 'gnd'));
  if (index.placed.length > 0 && !hasSource) {
    report({ code: 'NO_POWER_SOURCE', severity: 'error', message: '電路沒有電源：請放入 VCC 與 GND' });
  }

  for (const net of nets) {
    const vccPins = net.pins.filter((r) => role(r) === 'vcc-source');
    const voltages = new Set(vccPins.map((r) => propsOf(index.placedById.get(r.componentId)!).voltage ?? 5));
    // EIC-1106 的紅色接線柱：固定 5 V。
    if (net.groupIds.some((g) => groupInfo(index, g)?.source === 'vcc')) voltages.add(5);
    const hasGnd = netHas(net, 'gnd-source');
    if ((voltages.size > 0 && hasGnd) || voltages.size > 1) {
      report({
        code: 'SHORT_CIRCUIT',
        severity: 'error',
        message: `⚠ Short Circuit：${net.name} 把${voltages.size > 1 ? '不同電壓的電源' : '電源和 GND'}直接接在一起`,
        netIds: [net.id],
        points: pointsOf(net.pins),
        componentIds: componentsOf(net.pins),
      });
    }
    const outputs = net.pins.filter((r) => role(r) === 'output');
    if (outputs.length > 1 || (outputs.length === 1 && (voltages.size > 0 || hasGnd))) {
      report({
        code: 'OUTPUT_CONFLICT',
        severity: 'error',
        message: `${net.name} 上${outputs.length > 1 ? '有多個輸出腳互接' : '的輸出腳直接接到電源'}`,
        netIds: [net.id],
        points: pointsOf(outputs),
        componentIds: componentsOf(outputs),
      });
    }
  }

  for (const pc of index.placed) {
    const label = componentLabel(pc);
    const pinsByGroup = new Map<string, number[]>();
    for (const fp of pc.footprint.pins) {
      const g = groupOfPoint(index, fp.point);
      if (g) pushTo(pinsByGroup, g, fp.pinNumber);
    }

    // 子專案 19：指撥開關一端接電源、另一端接 IC 輸入卻沒有上 / 下拉電阻（模擬時當成理想開關）。
    if (pc.def.category === 'dip-switch') {
      const n = pc.def.pins.length;
      const isUnconnected = (net: Net | undefined) => !net || net.pins.length === 1;
      const hasResistor = (net: Net) => net.pins.some((r) => index.placedById.get(r.componentId)?.def.category === 'resistor');
      for (let k = 1; k <= n / 2; k++) {
        const sides = [byPin.get(pinKey(refOf(pc, k))), byPin.get(pinKey(refOf(pc, n + 1 - k)))];
        for (const [power, other] of [sides, [sides[1], sides[0]]]) {
          if (isUnconnected(other) || !other!.pins.some((r) => role(r) === 'input') || hasResistor(other!)) continue;
          const vcc = netHas(power, 'vcc-source');
          if (!vcc && !netHas(power, 'gnd-source')) continue;
          report({
            code: 'SWITCH_NO_PULL',
            severity: 'warning',
            message: vcc
              ? `⚠ ${label} 第 ${k} 個開關沒有下拉電阻：模擬時 OFF 當成 0；實際接線時 OFF 會懸空，TTL 會讀成 1`
              : `⚠ ${label} 第 ${k} 個開關沒有上拉電阻：模擬時 OFF 當成 1；實際接線時懸空容易受雜訊影響`,
            componentIds: [pc.instance.id],
            points: pointsOf([refOf(pc, k), refOf(pc, n + 1 - k)]),
            netIds: [other!.id],
          });
        }
      }
    }

    if (pc.def.category === 'ic') {
      // 子專案 19：一整組閘的輸入、輸出都沒有接任何東西 = 沒用到的閘，輸入懸空不警告。
      const unusedPins = new Set<number>();
      if (pc.def.logic?.model === 'gates') {
        const numberOf = (name: string) => pc.def.pins.find((p) => p.name === name)?.number;
        for (const g of pc.def.logic.gates) {
          const pins = [...g.in, g.out].map(numberOf).filter((x): x is number => x !== undefined);
          const net = (p: number) => byPin.get(pinKey(refOf(pc, p)));
          if (pins.every((p) => !net(p) || net(p)!.pins.length === 1)) pins.forEach((p) => unusedPins.add(p));
        }
      }
      for (const numbers of pinsByGroup.values()) {
        if (numbers.length < 2) continue;
        report({
          code: 'IC_PIN_SHORT',
          severity: 'error',
          message: `${label} 第 ${numbers.join('、')} 腳插在同一條導通排上`,
          componentIds: [pc.instance.id],
          points: pointsOf(numbers.map((n) => refOf(pc, n))),
        });
      }
      for (const pin of pc.def.pins) {
        const ref = refOf(pc, pin.number);
        const net = byPin.get(pinKey(ref));
        const where = pointsOf([ref]);
        if (pin.role === 'power' && !netHas(net, 'vcc-source')) {
          report({ code: 'IC_POWER_MISSING', severity: 'error', message: `${label} 第 ${pin.number} 腳 VCC 未連接`, componentIds: [pc.instance.id], points: where });
        }
        if (pin.role === 'ground' && !netHas(net, 'gnd-source')) {
          report({ code: 'IC_POWER_MISSING', severity: 'error', message: `${label} 第 ${pin.number} 腳 GND 未連接`, componentIds: [pc.instance.id], points: where });
        }
        if (pin.role === 'input' && !unusedPins.has(pin.number) && (!net || net.pins.every((r) => role(r) === 'input' || role(r) === 'nc'))) {
          report({
            code: 'INPUT_FLOATING',
            severity: 'warning',
            message: `⚠ ${label} 第 ${pin.number} 腳（${pin.name}）未連接，TTL 輸入懸空會被當成 HIGH`,
            componentIds: [pc.instance.id],
            points: where,
            netIds: net ? [net.id] : [],
          });
        }
      }
      continue;
    }

    for (const numbers of pinsByGroup.values()) {
      if (numbers.length < 2) continue;
      const intended = pc.def.internalConnections.some((set) => numbers.every((n) => set.includes(n)));
      if (!intended) {
        report({
          code: 'COMPONENT_SHORTED',
          severity: 'warning',
          message: `⚠ ${label} 的第 ${numbers.join('、')} 腳插在同一條導通排上，元件被短路`,
          componentIds: [pc.instance.id],
          points: pointsOf(numbers.map((n) => refOf(pc, n))),
        });
      }
    }
    for (const pin of pc.def.pins) {
      if (pin.role !== 'passive' && pin.role !== 'anode' && pin.role !== 'cathode') continue;
      // 7 段顯示器沒用到的段（例如 dp）是正常的。
      if (pc.def.category === 'seven-seg' && pin.role === 'cathode') continue;
      const ref = refOf(pc, pin.number);
      const net = byPin.get(pinKey(ref));
      if (!net || net.pins.length === 1) {
        report({ code: 'PIN_UNCONNECTED', severity: 'warning', message: `⚠ ${label} 第 ${pin.number} 腳未連接`, componentIds: [pc.instance.id], points: pointsOf([ref]) });
      }
    }
    if (pc.def.category === 'seven-seg') {
      const anode = pc.def.pins.find((p) => p.role === 'anode');
      if (anode) {
        const anodeRef = refOf(pc, anode.number);
        const anodeNet = byPin.get(pinKey(anodeRef));
        const where = pointsOf([anodeRef]);
        if (netHas(anodeNet, 'gnd-source')) {
          report({ code: 'LED_REVERSED', severity: 'warning', message: `⚠ ${label} 的共陽極（CA）接到 GND 了，要接 VCC`, componentIds: [pc.instance.id], points: where });
        }
        const withResistor = (net: Net | undefined) =>
          net !== undefined && net.pins.some((r) => index.placedById.get(r.componentId)?.def.category === 'resistor');
        const bare = pc.def.pins
          .filter((p) => p.role === 'cathode')
          .filter((p) => {
            const net = byPin.get(pinKey(refOf(pc, p.number)));
            return net !== undefined && net.pins.length > 1 && !withResistor(net) && !withResistor(anodeNet);
          })
          .map((p) => p.name)
          .sort((x, y) => 'abcdefg.'.indexOf(x[0]) - 'abcdefg.'.indexOf(y[0]) || x.length - y.length);
        if (bare.length > 0) {
          report({ code: 'LED_NO_RESISTOR', severity: 'warning', message: `⚠ ${label} 的 ${bare.join('、')} 段沒有串聯限流電阻`, componentIds: [pc.instance.id], points: where });
        }
      }
    }
    if (pc.def.category === 'led') {
      const anode = pc.def.pins.find((p) => p.role === 'anode');
      const cathode = pc.def.pins.find((p) => p.role === 'cathode');
      if (!anode || !cathode) continue;
      const anodeNet = byPin.get(pinKey(refOf(pc, anode.number)));
      const cathodeNet = byPin.get(pinKey(refOf(pc, cathode.number)));
      const where = pointsOf([refOf(pc, anode.number)]);
      if (netHas(anodeNet, 'gnd-source') || netHas(cathodeNet, 'vcc-source')) {
        report({ code: 'LED_REVERSED', severity: 'warning', message: `⚠ ${label} 極性接反（陽極要接高電位、陰極接 GND）`, componentIds: [pc.instance.id], points: where });
      }
      const hasResistor = (net: Net | undefined) =>
        net !== undefined && net.pins.some((r) => index.placedById.get(r.componentId)?.def.category === 'resistor');
      if (!hasResistor(anodeNet) && !hasResistor(cathodeNet)) {
        report({ code: 'LED_NO_RESISTOR', severity: 'warning', message: `⚠ ${label} 沒有串聯限流電阻`, componentIds: [pc.instance.id], points: where });
      }
    }
  }
}
