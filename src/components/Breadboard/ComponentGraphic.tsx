import { memo, type ReactNode } from 'react';
import { effectiveSpan } from '../../core/circuit/footprint';
import { formatResistance } from '../../editor/library';
import { PITCH, type Point } from '../../editor/geometry';
import { LED_FILL, levelColor, PART, resistorBands } from '../../render/theme';
import type { ComponentDefinition, ComponentInstance, LedColor, Rotation } from '../../types/component';
import type { Level } from '../../types/logic';

const P = PITCH;

/** 模擬模式下一個元件要顯示的狀態。 */
export interface ComponentSim {
  /** 腳號 → 電位。 */
  levels: Record<number, Level>;
  lit?: boolean;
  unpowered?: boolean;
  pressed?: boolean;
}

interface Props {
  instance: ComponentInstance;
  def: ComponentDefinition;
  /** anchor（腳 1）的世界座標。 */
  at: Point;
  /** 放置 / 移動中的預覽：不接收滑鼠事件。 */
  ghost?: boolean;
  /** 被拖曳中的原件：淡化。 */
  faded?: boolean;
  /** false：純顯示（Compare 畫面），不帶互動屬性。 */
  interactive?: boolean;
  /** 模擬中：腳位電位、LED 是否發光、IC 是否供電、按鈕是否按下。 */
  sim?: ComponentSim;
}

/** 文字永遠保持正向：抵銷元件本身的旋轉。 */
function Upright({ x, y, rotation, children, ...rest }: { x: number; y: number; rotation: Rotation; children: ReactNode } & Record<string, unknown>) {
  return (
    <text x={x} y={y} transform={rotation ? `rotate(${-rotation} ${x} ${y})` : undefined} textAnchor="middle" dominantBaseline="central" {...rest}>
      {children}
    </text>
  );
}

/** 一組保持正向的文字：以 (x, y) 為中心，子元素用相對座標。 */
function UprightGroup({ x, y, rotation, children }: { x: number; y: number; rotation: Rotation; children: ReactNode }) {
  return <g transform={`translate(${x} ${y})${rotation ? ` rotate(${-rotation})` : ''}`}>{children}</g>;
}

function Leg({ x, y, top, level }: { x: number; y: number; top: boolean; level?: Level }) {
  // 從本體邊緣伸到孔中心的腳片；模擬時依電位上色。
  const h = 0.6 * P;
  return (
    <rect
      x={x - 0.17 * P}
      y={top ? y - 0.18 * P : y - h + 0.18 * P}
      width={0.34 * P}
      height={h}
      rx={1}
      fill={levelColor(level) ?? PART.metal}
      stroke={PART.metalEdge}
      strokeWidth={0.6}
    />
  );
}

function PinStub({ x, y, level }: { x: number; y: number; level?: Level }) {
  return (
    <rect
      x={x - 0.16 * P}
      y={y - 0.16 * P}
      width={0.32 * P}
      height={0.32 * P}
      rx={1.5}
      fill={levelColor(level) ?? PART.metal}
      stroke={PART.metalEdge}
      strokeWidth={0.6}
    />
  );
}

function Dip({ instance, def, sim }: { instance: ComponentInstance; def: ComponentDefinition; sim?: ComponentSim }) {
  if (def.package.type !== 'dip') return null;
  const { pinCount, rowSpacing } = def.package;
  const half = pinCount / 2;
  const r = instance.rotation;
  const isSwitch = def.category === 'dip-switch';
  const w = (half - 1) * P;
  const top = -rowSpacing * P + 0.42 * P;
  const bottom = -0.42 * P;
  const mid = (top + bottom) / 2;
  const states = instance.props.switchStates ?? def.defaultProps.switchStates ?? [];
  const pins: Array<{ n: number; x: number; y: number; top: boolean }> = [];
  for (let i = 0; i < half; i++) pins.push({ n: i + 1, x: i * P, y: 0, top: false });
  for (let j = 0; j < half; j++) pins.push({ n: half + 1 + j, x: (half - 1 - j) * P, y: -rowSpacing * P, top: true });

  return (
    <>
      {pins.map((p) => (
        <Leg key={p.n} x={p.x} y={p.y} top={p.top} level={sim?.levels[p.n]} />
      ))}
      <rect
        x={-0.48 * P}
        y={top}
        width={w + 0.96 * P}
        height={bottom - top}
        rx={0.14 * P}
        fill={isSwitch ? PART.switchBody : PART.icBody}
        stroke={isSwitch ? PART.switchEdge : PART.icEdge}
        strokeWidth={1}
      />
      {isSwitch ? (
        <>
          <Upright x={-0.05 * P} y={top + 0.32 * P} rotation={r} fill="#ffffff" fontSize={0.3 * P} fontWeight={700}>
            ON
          </Upright>
          {states.map((on, k) => (
            <g key={k} data-switch={k} style={sim ? { cursor: 'pointer' } : undefined}>
              <rect x={k * P - 0.2 * P} y={mid - 0.55 * P} width={0.4 * P} height={1.1 * P} rx={1.5} fill="#f5f5f5" />
              <rect x={k * P - 0.15 * P} y={on ? mid - 0.5 * P : mid + 0.02 * P} width={0.3 * P} height={0.48 * P} rx={1} fill="#37474f" />
              <Upright x={k * P} y={mid + 0.82 * P} rotation={r} fill="#ffffff" fontSize={0.28 * P}>
                {k + 1}
              </Upright>
            </g>
          ))}
        </>
      ) : (
        <>
          {/* 第 1 腳方向：左側半圓缺口與圓點 */}
          <path d={`M ${-0.48 * P} ${mid - 0.3 * P} A ${0.3 * P} ${0.3 * P} 0 0 1 ${-0.48 * P} ${mid + 0.3 * P} Z`} fill={PART.icEdge} />
          <circle cx={0.02 * P} cy={bottom - 0.32 * P} r={0.1 * P} fill="#5f6368" />
          <UprightGroup x={w / 2} y={mid} rotation={r}>
            <text y={r % 180 === 0 ? -0.18 * P : -0.3 * P} textAnchor="middle" dominantBaseline="central" fill={PART.icText} fontSize={0.58 * P} fontWeight={700} letterSpacing={0.5}>
              {def.name}
            </text>
            <text y={r % 180 === 0 ? 0.48 * P : 0.36 * P} textAnchor="middle" dominantBaseline="central" fill={PART.icSubText} fontSize={0.4 * P}>
              {instance.id}
            </text>
          </UprightGroup>
          {pins.map((p) => (
            <Upright key={p.n} x={p.x} y={p.top ? top + 0.26 * P : bottom - 0.26 * P} rotation={r} fill="#80868b" fontSize={0.27 * P}>
              {p.n}
            </Upright>
          ))}
          {sim?.unpowered && (
            <UprightGroup x={w / 2} y={mid} rotation={r}>
              <rect x={-1.3 * P} y={-0.32 * P} width={2.6 * P} height={0.64 * P} rx={0.12 * P} fill="#f59e0b" fillOpacity={0.92} />
              <text textAnchor="middle" dominantBaseline="central" fill="#1c1917" fontSize={0.4 * P} fontWeight={800}>
                未供電
              </text>
            </UprightGroup>
          )}
        </>
      )}
    </>
  );
}

function Resistor({ instance, def, sim }: { instance: ComponentInstance; def: ComponentDefinition; sim?: ComponentSim }) {
  const span = effectiveSpan(instance, def);
  const ohms = instance.props.resistance ?? def.defaultProps.resistance ?? 1000;
  const length = span * P;
  const bodyW = Math.min(2.6 * P, Math.max(0.8 * P, length - 0.9 * P));
  const x0 = length / 2 - bodyW / 2;
  const bands = resistorBands(ohms);
  const bandAt = [0.18, 0.33, 0.48, 0.78];
  return (
    <>
      <line x1={0} y1={0} x2={length} y2={0} stroke={PART.lead} strokeWidth={0.12 * P} strokeLinecap="round" />
      <PinStub x={0} y={0} level={sim?.levels[1]} />
      <PinStub x={length} y={0} level={sim?.levels[2]} />
      <rect x={x0} y={-0.32 * P} width={bodyW} height={0.64 * P} rx={0.3 * P} fill={PART.resistorBody} stroke={PART.resistorEdge} strokeWidth={0.8} />
      {bodyW >= 1.6 * P &&
        bands.map((color, i) => (
          <rect key={i} x={x0 + bodyW * bandAt[i] - 0.06 * P} y={-0.32 * P} width={0.12 * P} height={0.64 * P} fill={color} />
        ))}
      <Upright x={length / 2} y={0.72 * P} rotation={instance.rotation} fill="#6b6455" fontSize={0.36 * P} fontWeight={600}>
        {`${instance.id} ${formatResistance(ohms)}`}
      </Upright>
    </>
  );
}

function Led({ instance, def, sim }: { instance: ComponentInstance; def: ComponentDefinition; sim?: ComponentSim }) {
  const span = effectiveSpan(instance, def);
  const colorKey = (instance.props.color ?? def.defaultProps.color ?? 'red') as LedColor;
  const color = LED_FILL[colorKey] ?? LED_FILL.red;
  const cx = (span * P) / 2;
  const r = span === 1 ? 0.62 * P : 0.72 * P;
  const d = 0.78 * r;
  const h = Math.sqrt(r * r - d * d);
  // 同色 LED 共用同一個漸層定義（內容相同，重複出現也沒關係）。
  const gradientId = `bbl-led-${colorKey}`;
  return (
    <>
      <defs>
        <radialGradient id={gradientId} cx="40%" cy="38%" r="65%">
          <stop offset="0%" stopColor={color.glow} />
          <stop offset="100%" stopColor={color.fill} />
        </radialGradient>
      </defs>
      <line x1={0} y1={0} x2={span * P} y2={0} stroke={PART.lead} strokeWidth={0.1 * P} />
      <PinStub x={0} y={0} level={sim?.levels[1]} />
      <PinStub x={span * P} y={0} level={sim?.levels[2]} />
      {sim?.lit && (
        <>
          <defs>
            <radialGradient id={`bbl-led-glow-${colorKey}`}>
              <stop offset="0%" stopColor={color.glow} stopOpacity={0.95} />
              <stop offset="55%" stopColor={color.fill} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color.fill} stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={0} r={r * 2.3} fill={`url(#bbl-led-glow-${colorKey})`} pointerEvents="none" />
        </>
      )}
      {/* 圓頂；陰極側切平。模擬中沒亮的 LED 畫暗一點。 */}
      <path
        d={`M ${cx + d} ${-h} A ${r} ${r} 0 1 0 ${cx + d} ${h} Z`}
        fill={sim?.lit ? color.glow : `url(#${gradientId})`}
        stroke={color.edge}
        strokeWidth={1}
        fillOpacity={sim && !sim.lit ? 0.55 : 0.94}
      />
      <Upright x={cx - 0.4 * r} y={0} rotation={instance.rotation} fill="#ffffff" fontSize={0.48 * P} fontWeight={800}>
        +
      </Upright>
      <Upright x={cx + 0.42 * r} y={0} rotation={instance.rotation} fill="#ffffff" fontSize={0.48 * P} fontWeight={800}>
        −
      </Upright>
      <Upright x={cx} y={-r - 0.3 * P} rotation={instance.rotation} fill="#6b6455" fontSize={0.36 * P} fontWeight={600}>
        {instance.id}
      </Upright>
    </>
  );
}

function Terminal({ instance, def }: { instance: ComponentInstance; def: ComponentDefinition }) {
  const isVcc = def.category === 'vcc';
  const volts = instance.props.voltage ?? def.defaultProps.voltage ?? 5;
  return (
    <>
      <circle r={0.42 * P} fill={isVcc ? PART.vcc : PART.gnd} stroke={isVcc ? PART.vccEdge : PART.gndEdge} strokeWidth={1} />
      <Upright x={0} y={0} rotation={instance.rotation} fill="#ffffff" fontSize={0.55 * P} fontWeight={800}>
        {isVcc ? '+' : '−'}
      </Upright>
      <Upright x={0} y={-0.82 * P} rotation={instance.rotation} fill={isVcc ? PART.vcc : PART.gnd} fontSize={0.4 * P} fontWeight={800}>
        {isVcc ? `VCC ${volts}V` : 'GND'}
      </Upright>
    </>
  );
}

/** 方波符號（以 (0, 0) 為中心，寬 w）。 */
export function squareWavePath(w: number, h: number): string {
  const s = w / 4;
  return `M ${-2 * s} ${h / 2} h ${s} v ${-h} h ${s} v ${h} h ${s} v ${-h} h ${s}`;
}

function ClockSource({ instance, def, sim }: { instance: ComponentInstance; def: ComponentDefinition; sim?: ComponentSim }) {
  const hz = instance.props.frequency ?? def.defaultProps.frequency ?? 1;
  const high = sim?.levels[1] === 1;
  return (
    <>
      {high && <circle r={0.7 * P} fill="#a78bfa" fillOpacity={0.45} pointerEvents="none" />}
      <circle r={0.44 * P} fill={high ? '#8b5cf6' : PART.clock} stroke={PART.clockEdge} strokeWidth={1} />
      <path d={squareWavePath(0.56 * P, 0.26 * P)} fill="none" stroke="#ffffff" strokeWidth={1.4} strokeLinejoin="round" />
      <Upright x={0} y={-0.84 * P} rotation={instance.rotation} fill={PART.clock} fontSize={0.38 * P} fontWeight={800}>
        {`${instance.id} ${hz}Hz`}
      </Upright>
    </>
  );
}

function DcPower({ instance, def }: { instance: ComponentInstance; def: ComponentDefinition }) {
  const span = effectiveSpan(instance, def);
  const volts = instance.props.voltage ?? def.defaultProps.voltage ?? 5;
  return (
    <>
      <rect x={-0.5 * P} y={-0.5 * P} width={span * P + P} height={P} rx={0.18 * P} fill={PART.dcBody} stroke="#1c262b" strokeWidth={1} />
      <circle cx={0} cy={0} r={0.3 * P} fill={PART.vcc} />
      <circle cx={span * P} cy={0} r={0.3 * P} fill="#111111" />
      <Upright x={0} y={0} rotation={instance.rotation} fill="#ffffff" fontSize={0.42 * P} fontWeight={800}>
        +
      </Upright>
      <Upright x={span * P} y={0} rotation={instance.rotation} fill="#ffffff" fontSize={0.42 * P} fontWeight={800}>
        −
      </Upright>
      <Upright x={(span * P) / 2} y={-0.85 * P} rotation={instance.rotation} fill={PART.dcBody} fontSize={0.38 * P} fontWeight={700}>
        {`${instance.id} DC ${volts}V`}
      </Upright>
    </>
  );
}

function PushButton({ instance, sim }: { instance: ComponentInstance; sim?: ComponentSim }) {
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: 0, y: -3 * P },
    { x: 2 * P, y: 0 },
    { x: 2 * P, y: -3 * P },
  ];
  return (
    <>
      <rect x={-0.38 * P} y={-3.38 * P} width={2.76 * P} height={3.76 * P} rx={0.22 * P} fill={PART.buttonBody} stroke={PART.buttonEdge} strokeWidth={1} />
      {corners.map((c, i) => (
        <PinStub key={i} x={c.x} y={c.y} level={sim?.levels[i + 1]} />
      ))}
      {/* 按鈕帽（含編號文字）整個是可以按的區域。 */}
      <g data-button="" style={sim ? { cursor: 'pointer' } : undefined}>
        <circle cx={P} cy={-1.5 * P} r={0.92 * P} fill="#1f1f1f" stroke={sim?.pressed ? '#22c55e' : '#000000'} strokeWidth={sim?.pressed ? 2 : 1} />
        <circle cx={P} cy={-1.5 * P} r={sim?.pressed ? 0.6 * P : 0.68 * P} fill={sim?.pressed ? '#14532d' : '#333333'} />
        <Upright x={P} y={-1.5 * P} rotation={instance.rotation} fill="#cfd8dc" fontSize={0.34 * P} fontWeight={700}>
          {instance.id}
        </Upright>
      </g>
    </>
  );
}

/** 一個元件的外觀（以腳 1 為原點畫，再整體旋轉），加上每隻腳的點擊區。 */
export const ComponentGraphic = memo(function ComponentGraphic({ instance, def, at, ghost, faded, interactive = true, sim }: Props) {
  let body: ReactNode = null;
  switch (def.package.type) {
    case 'dip':
      body = <Dip instance={instance} def={def} sim={sim} />;
      break;
    case 'two-lead':
      body =
        def.category === 'resistor' ? (
          <Resistor instance={instance} def={def} sim={sim} />
        ) : def.category === 'led' ? (
          <Led instance={instance} def={def} sim={sim} />
        ) : (
          <DcPower instance={instance} def={def} />
        );
      break;
    case 'single':
      body = def.category === 'clock' ? <ClockSource instance={instance} def={def} sim={sim} /> : <Terminal instance={instance} def={def} />;
      break;
    case 'tactile4':
      body = <PushButton instance={instance} sim={sim} />;
      break;
  }

  return (
    <g
      transform={`translate(${at.x} ${at.y})${instance.rotation ? ` rotate(${instance.rotation})` : ''}`}
      data-component-id={ghost || !interactive ? undefined : instance.id}
      opacity={ghost ? 0.72 : faded ? 0.3 : 1}
      style={ghost || !interactive ? { pointerEvents: 'none' } : { cursor: 'grab' }}
    >
      {body}
    </g>
  );
});
