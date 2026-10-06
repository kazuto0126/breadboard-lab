import { resolveFootprint } from '../../core/circuit/footprint';
import { getComponentDefinition } from '../../core/circuit/library';
import type { ComponentInstance, Footprint, LedColor } from '../../types/component';
import { boundsOf } from '../geometry/componentShape';
import { UNIT } from '../interaction/viewport';
import { resistorBands } from './resistorBands';

const LED_FILL: Record<LedColor, string> = { red: '#ef4444', green: '#22c55e', yellow: '#facc15', blue: '#3b82f6' };
const LEAD = '#9aa0a6';
const u = (v: number) => v * UNIT;

function Pins({ footprint }: { footprint: Footprint }) {
  return (
    <>
      {footprint.pins.map((p) => (
        <rect
          key={p.pinNumber}
          data-pin={p.pinNumber}
          x={u(p.point.x) - 2}
          y={u(p.point.y) - 2}
          width={4}
          height={4}
          rx={0.6}
          fill="#cfd4d8"
          stroke="#8a9096"
          strokeWidth={0.6}
        />
      ))}
    </>
  );
}

interface DipProps {
  footprint: Footprint;
  horizontal: boolean;
  fill: string;
  label: string;
  switchStates?: boolean[];
}

function DipGlyph({ footprint, horizontal, fill, label, switchStates }: DipProps) {
  const pins = footprint.pins;
  const b = boundsOf(pins.map((p) => p.point));
  const rect = horizontal
    ? { x: u(b.minX - 0.45), y: u(b.minY + 0.3), w: u(b.maxX - b.minX + 0.9), h: u(b.maxY - b.minY - 0.6) }
    : { x: u(b.minX + 0.3), y: u(b.minY - 0.45), w: u(b.maxX - b.minX - 0.6), h: u(b.maxY - b.minY + 0.9) };
  const pin1 = pins.find((p) => p.pinNumber === 1)!.point;
  const notch = horizontal
    ? { cx: pin1.x === b.minX ? rect.x : rect.x + rect.w, cy: rect.y + rect.h / 2 }
    : { cx: rect.x + rect.w / 2, cy: pin1.y === b.minY ? rect.y : rect.y + rect.h };
  const dot = horizontal
    ? { cx: u(pin1.x), cy: pin1.y === b.maxY ? rect.y + rect.h - 3 : rect.y + 3 }
    : { cx: pin1.x === b.minX ? rect.x + 3 : rect.x + rect.w - 3, cy: u(pin1.y) };
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const half = pins.length / 2;
  return (
    <g>
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={1.5} fill={fill} stroke="#111827" strokeWidth={0.5} />
      <circle cx={notch.cx} cy={notch.cy} r={2.5} fill="#f7f3e8" />
      <circle cx={dot.cx} cy={dot.cy} r={1} fill="#e5e7eb" />
      {label && (
        <text
          x={cx}
          y={cy}
          fontSize={5}
          fill="#ffffff"
          textAnchor="middle"
          dominantBaseline="central"
          transform={horizontal ? undefined : `rotate(-90 ${cx} ${cy})`}
        >
          {label}
        </text>
      )}
      {switchStates &&
        Array.from({ length: half }, (_, i) => {
          const k = i + 1;
          const p = pins.find((pin) => pin.pinNumber === k)!.point;
          const q = pins.find((pin) => pin.pinNumber === pins.length + 1 - k)!.point;
          const mx = (u(p.x) + u(q.x)) / 2;
          const my = (u(p.y) + u(q.y)) / 2;
          const on = switchStates[i] === true;
          const shift = on ? -2.5 : 2.5;
          return (
            <g key={k} data-switch={k}>
              <rect
                x={horizontal ? mx - 2 : mx - 4.5}
                y={horizontal ? my - 4.5 : my - 2}
                width={horizontal ? 4 : 9}
                height={horizontal ? 9 : 4}
                fill="#ffffff"
              />
              <rect
                x={horizontal ? mx - 2 : mx + shift - 2}
                y={horizontal ? my + shift - 2 : my - 2}
                width={4}
                height={4}
                fill="#374151"
              />
              <text
                x={horizontal ? u(p.x) : rect.x + 2.2}
                y={horizontal ? rect.y + 2.2 : u(p.y)}
                fontSize={3}
                fill="#ffffff"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {k}
              </text>
            </g>
          );
        })}
      <Pins footprint={footprint} />
    </g>
  );
}

function ResistorGlyph({ footprint, ohms }: { footprint: Footprint; ohms: number }) {
  const [a, b] = footprint.pins.map((p) => p.point);
  const ax = u(a.x);
  const ay = u(a.y);
  const bx = u(b.x);
  const by = u(b.y);
  const length = Math.hypot(bx - ax, by - ay);
  const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  const body = Math.max(4, Math.min(length - 6, 26));
  const fractions = [0.2, 0.35, 0.5, 0.8];
  return (
    <g>
      <line x1={ax} y1={ay} x2={bx} y2={by} stroke={LEAD} strokeWidth={1.2} />
      <g transform={`translate(${(ax + bx) / 2} ${(ay + by) / 2}) rotate(${angle})`}>
        <rect x={-body / 2} y={-3} width={body} height={6} rx={2.5} fill="#e9d5a7" stroke="#b08d57" strokeWidth={0.5} />
        {resistorBands(ohms).map((color, i) => (
          <rect key={i} data-band={i} x={-body / 2 + fractions[i] * body - 0.8} y={-3} width={1.6} height={6} fill={color} />
        ))}
      </g>
      <Pins footprint={footprint} />
    </g>
  );
}

function LedGlyph({ footprint, color }: { footprint: Footprint; color: LedColor }) {
  const [a, k] = footprint.pins.map((p) => p.point);
  const ax = u(a.x);
  const ay = u(a.y);
  const kx = u(k.x);
  const ky = u(k.y);
  const length = Math.hypot(kx - ax, ky - ay) || 1;
  const ux = (kx - ax) / length;
  const uy = (ky - ay) / length;
  const mx = (ax + kx) / 2;
  const my = (ay + ky) / 2;
  const r = 4.5;
  const flat = 3.2;
  const chord = Math.sqrt(r * r - flat * flat);
  const fx = mx + ux * flat;
  const fy = my + uy * flat;
  const px = uy;
  const py = -ux;
  return (
    <g>
      <line x1={ax} y1={ay} x2={kx} y2={ky} stroke={LEAD} strokeWidth={1.2} />
      <Pins footprint={footprint} />
      <circle cx={mx} cy={my} r={r} fill={LED_FILL[color]} stroke="#374151" strokeWidth={0.6} opacity={0.92} />
      <line x1={fx - uy * chord} y1={fy + ux * chord} x2={fx + uy * chord} y2={fy - ux * chord} stroke="#374151" strokeWidth={1} />
      <text x={ax + px * 6.5} y={ay + py * 6.5} fontSize={4} fill="#374151" textAnchor="middle" dominantBaseline="central">
        A
      </text>
      <text x={kx + px * 6.5} y={ky + py * 6.5} fontSize={4} fill="#374151" textAnchor="middle" dominantBaseline="central">
        K
      </text>
    </g>
  );
}

function TerminalGlyph({ footprint, label, fill }: { footprint: Footprint; label: string; fill: string }) {
  const p = footprint.pins[0].point;
  const x = u(p.x);
  const y = u(p.y);
  const width = Math.max(14, label.length * 3.2 + 4);
  const below = p.y <= 3;
  const tagY = below ? y + 5 : y - 11;
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={below ? y + 5 : y - 5} stroke={fill} strokeWidth={1} />
      <rect x={x - width / 2} y={tagY} width={width} height={6} rx={1.5} fill={fill} />
      <text x={x} y={tagY + 3} fontSize={4} fill="#ffffff" textAnchor="middle" dominantBaseline="central">
        {label}
      </text>
      <Pins footprint={footprint} />
    </g>
  );
}

function DcPowerGlyph({ footprint, voltage }: { footprint: Footprint; voltage: number }) {
  const b = boundsOf(footprint.pins.map((p) => p.point));
  const x = u(b.minX) - 4;
  const y = u(b.minY) - 4;
  return (
    <g>
      <rect x={x} y={y} width={u(b.maxX - b.minX) + 8} height={u(b.maxY - b.minY) + 8} rx={2} fill="#374151" />
      {footprint.pins.map((p) => (
        <g key={p.pinNumber}>
          <rect
            data-pin={p.pinNumber}
            x={u(p.point.x) - 2.5}
            y={u(p.point.y) - 2.5}
            width={5}
            height={5}
            rx={0.8}
            fill={p.pinNumber === 1 ? '#d32f2f' : '#212121'}
          />
          <text x={u(p.point.x)} y={u(p.point.y)} fontSize={4} fill="#ffffff" textAnchor="middle" dominantBaseline="central">
            {p.pinNumber === 1 ? '+' : '−'}
          </text>
        </g>
      ))}
      <text x={x - 1} y={u(b.minY)} fontSize={4} fill="#374151" textAnchor="end" dominantBaseline="central">
        {`${voltage}V`}
      </text>
    </g>
  );
}

function ButtonGlyph({ footprint }: { footprint: Footprint }) {
  const b = boundsOf(footprint.blocked);
  const x = u(b.minX) - 3;
  const y = u(b.minY) - 3;
  const w = u(b.maxX - b.minX) + 6;
  const h = u(b.maxY - b.minY) + 6;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill="#1f2937" />
      <circle cx={x + w / 2} cy={y + h / 2} r={7} fill="#4b5563" stroke="#111827" strokeWidth={0.6} />
      <Pins footprint={footprint} />
    </g>
  );
}

export function ComponentGlyph({ instance }: { instance: ComponentInstance }) {
  const def = getComponentDefinition(instance.defId);
  if (!def) return null;
  const footprint = resolveFootprint(instance, def);
  const props = { ...def.defaultProps, ...instance.props };
  const horizontal = instance.rotation === 0 || instance.rotation === 180;
  switch (def.category) {
    case 'ic':
      return <DipGlyph footprint={footprint} horizontal={horizontal} fill="#2b2b2b" label={def.name} />;
    case 'dip-switch':
      return <DipGlyph footprint={footprint} horizontal={horizontal} fill="#c62828" label="" switchStates={props.switchStates ?? []} />;
    case 'resistor':
      return <ResistorGlyph footprint={footprint} ohms={props.resistance ?? 1000} />;
    case 'led':
      return <LedGlyph footprint={footprint} color={props.color ?? 'red'} />;
    case 'vcc':
      return <TerminalGlyph footprint={footprint} label={`VCC ${props.voltage ?? 5}V`} fill="#d32f2f" />;
    case 'gnd':
      return <TerminalGlyph footprint={footprint} label="GND" fill="#212121" />;
    case 'dc-power':
      return <DcPowerGlyph footprint={footprint} voltage={props.voltage ?? 5} />;
    case 'pushbutton':
      return <ButtonGlyph footprint={footprint} />;
  }
}
