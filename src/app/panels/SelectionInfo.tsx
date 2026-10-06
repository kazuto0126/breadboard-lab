import { useMemo, type ReactNode } from 'react';
import { holeName } from '../../core/breadboard/naming';
import { getBoard } from '../../core/breadboard/registry';
import { effectiveSpan, resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition, RESISTOR_PRESETS } from '../../core/circuit/library';
import { extractNets } from '../../core/circuit/nets';
import { getNodeState } from '../../core/circuit/nodeState';
import { describeGroup } from '../../core/routing/problem';
import type { LedColor } from '../../types/component';
import type { GridPoint } from '../../types/geometry';
import { netHighlightFor } from '../board/netHighlight';
import { deleteComponent, deleteWire, flipWire, rotateComponent, updateComponentProps, type CommandResult, type PropsPatch } from '../commands/commands';
import { flippedPath } from '../geometry/wirePath';
import { colorName } from '../model/colors';
import type { ProjectFile } from '../model/projectFile';
import { useEditor } from '../store/editorStore';
import { CATEGORY_NAMES, formatOhms, LED_COLOR_NAMES, ROLE_NAMES } from './format';

const board = getBoard('MB102', 'b1');
const nameOf = (p: GridPoint) => holeName(board, p) ?? `(${p.x}, ${p.y})`;
const run = (command: (doc: ProjectFile) => CommandResult) => useEditor.getState().run(command);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function ActionButton({ children, onClick, disabled, label }: { children: ReactNode; onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 min-w-11 rounded-md border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50 disabled:opacity-40 lg:min-h-8 lg:min-w-8"
    >
      {children}
    </button>
  );
}

function ComponentInfo({ id }: { id: string }) {
  const circuit = useEditor((s) => s.doc.circuit);
  const editable = useEditor((s) => s.mode === 'edit');
  const instance = circuit.components.find((c) => c.id === id);
  const def = instance ? getComponentDefinition(instance.defId) : undefined;
  if (!instance || !def) return null;
  const props = { ...def.defaultProps, ...instance.props };
  const pin1 = resolveFootprint(instance, def).pins[0].point;
  const update = (patch: PropsPatch) => run((doc) => updateComponentProps(doc, id, patch));
  const span = effectiveSpan(instance, def);
  const pkg = def.package;
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">{`${def.name}（${instance.id}）`}</h3>
      <dl>
        <Row label="類型">{CATEGORY_NAMES[def.category]}</Row>
        <Row label="第 1 腳位置">{nameOf(pin1)}</Row>
        <Row label="旋轉">{`${instance.rotation}°`}</Row>
      </dl>
      {def.category === 'resistor' && (
        <label className="block text-sm">
          電阻值
          <select
            aria-label="電阻值"
            disabled={!editable}
            value={props.resistance ?? 1000}
            onChange={(e) => update({ resistance: Number(e.target.value) })}
            className="mt-1 block w-full rounded border border-gray-300 p-2"
          >
            {RESISTOR_PRESETS.map((ohms) => (
              <option key={ohms} value={ohms}>
                {formatOhms(ohms)}
              </option>
            ))}
          </select>
        </label>
      )}
      {def.category === 'led' && (
        <label className="block text-sm">
          LED 顏色
          <select
            aria-label="LED 顏色"
            disabled={!editable}
            value={props.color ?? 'red'}
            onChange={(e) => update({ color: e.target.value as LedColor })}
            className="mt-1 block w-full rounded border border-gray-300 p-2"
          >
            {(Object.keys(LED_COLOR_NAMES) as LedColor[]).map((color) => (
              <option key={color} value={color}>
                {LED_COLOR_NAMES[color]}
              </option>
            ))}
          </select>
        </label>
      )}
      {pkg.type === 'two-lead' && (
        <div className="flex items-center justify-between text-sm">
          <span>兩腳距離</span>
          <span className="flex items-center gap-2">
            <ActionButton label="縮短兩腳距離" disabled={!editable || span <= pkg.minSpan} onClick={() => update({ span: span - 1 })}>
              －
            </ActionButton>
            <span>{`${span} 格`}</span>
            <ActionButton label="加長兩腳距離" disabled={!editable} onClick={() => update({ span: span + 1 })}>
              ＋
            </ActionButton>
          </span>
        </div>
      )}
      {(def.category === 'vcc' || def.category === 'dc-power') && (
        <label className="block text-sm">
          電壓（V）
          <input
            aria-label="電壓"
            type="number"
            min={0.5}
            step={0.5}
            disabled={!editable}
            value={props.voltage ?? 5}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0) update({ voltage: v });
            }}
            className="mt-1 block w-full rounded border border-gray-300 p-2"
          />
        </label>
      )}
      <div className="flex gap-2">
        <ActionButton disabled={!editable} onClick={() => run((doc) => rotateComponent(doc, id))}>
          旋轉 90°
        </ActionButton>
        <ActionButton disabled={!editable} onClick={() => run((doc) => deleteComponent(doc, id))}>
          刪除
        </ActionButton>
      </div>
    </div>
  );
}

function PinInfo({ componentId, pinNumber }: { componentId: string; pinNumber: number }) {
  const circuit = useEditor((s) => s.doc.circuit);
  const net = useMemo(
    () => extractNets(circuit).find((n) => n.pins.some((p) => p.componentId === componentId && p.pinNumber === pinNumber)),
    [circuit, componentId, pinNumber],
  );
  const instance = circuit.components.find((c) => c.id === componentId);
  const def = instance ? getComponentDefinition(instance.defId) : undefined;
  const pin = def?.pins.find((p) => p.number === pinNumber);
  const point = instance && def ? resolveFootprint(instance, def).pins.find((p) => p.pinNumber === pinNumber)?.point : undefined;
  if (!instance || !def || !pin || !point) return null;
  const pinLabel = (cid: string, n: number) => {
    const other = circuit.components.find((c) => c.id === cid);
    const otherDef = other ? getComponentDefinition(other.defId) : undefined;
    const otherPin = otherDef?.pins.find((p) => p.number === n);
    return `${cid} 第 ${n} 腳（${otherPin?.name ?? '?'}）`;
  };
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">{`${def.name}（${instance.id}）`}</h3>
      <dl>
        <Row label="腳號">{`第 ${pinNumber} 腳`}</Row>
        <Row label="腳名">{pin.name}</Row>
        <Row label="角色">{ROLE_NAMES[pin.role]}</Row>
        <Row label="孔">{nameOf(point)}</Row>
        <Row label="Net">{net?.name ?? '（未連接）'}</Row>
      </dl>
      {net && (
        <div>
          <h4 className="mb-1 text-sm font-semibold">這個 Net 的腳</h4>
          <ul className="space-y-0.5 text-sm">
            {net.pins
              .filter((p) => !(p.componentId === componentId && p.pinNumber === pinNumber))
              .map((p) => (
                <li key={`${p.componentId}#${p.pinNumber}`}>{pinLabel(p.componentId, p.pinNumber)}</li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function WireInfo({ id }: { id: string }) {
  const circuit = useEditor((s) => s.doc.circuit);
  const editable = useEditor((s) => s.mode === 'edit');
  const net = useMemo(() => netHighlightFor({ kind: 'wire', id }, circuit), [circuit, id]);
  const wire = circuit.wires.find((w) => w.id === id);
  if (!wire) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">{`導線 ${wire.id}`}</h3>
      <dl>
        <Row label="起點">{nameOf(wire.start)}</Row>
        <Row label="終點">{nameOf(wire.end)}</Row>
        <Row label="長度">{`${wire.path.length - 1} 格`}</Row>
        <Row label="顏色">{colorName(wire.color)}</Row>
        <Row label="Net">{net?.netId ?? '（沒有接到元件）'}</Row>
        <Row label="來源">{wire.source === 'auto' ? 'AI 標準佈線' : '手動'}</Row>
      </dl>
      <div className="flex gap-2">
        <ActionButton disabled={!editable || flippedPath(wire) === null} onClick={() => run((doc) => flipWire(doc, id))}>
          翻轉轉角
        </ActionButton>
        <ActionButton disabled={!editable} onClick={() => run((doc) => deleteWire(doc, id))}>
          刪除
        </ActionButton>
      </div>
    </div>
  );
}

function HoleInfo({ point }: { point: GridPoint }) {
  const circuit = useEditor((s) => s.doc.circuit);
  const state = getNodeState(circuit, point);
  if (!state) return null;
  let content = '（空孔）';
  if (state.pin) content = `${state.pin.componentId} 第 ${state.pin.pinNumber} 腳`;
  else if (state.wireEnds.length > 0) content = `導線 ${state.wireEnds.join('、')} 的端點`;
  else if (state.blockedBy.length > 0) content = `${state.blockedBy.join('、')} 的本體下方`;
  return (
    <dl>
      <Row label="孔">{state.name ?? '（板面，沒有孔）'}</Row>
      <Row label="導通群組">{state.groupId ? describeGroup(state.groupId) : '—'}</Row>
      <Row label="插在這裡">{content}</Row>
    </dl>
  );
}

export function SelectionInfo() {
  const selection = useEditor((s) => s.selection);
  if (!selection) return <p className="text-sm text-gray-500">點一下元件、腳位、導線或孔，就會在這裡顯示資訊。</p>;
  switch (selection.kind) {
    case 'component':
      return <ComponentInfo id={selection.id} />;
    case 'pin':
      return <PinInfo componentId={selection.componentId} pinNumber={selection.pinNumber} />;
    case 'wire':
      return <WireInfo id={selection.id} />;
    case 'hole':
      return <HoleInfo point={selection.point} />;
  }
}
