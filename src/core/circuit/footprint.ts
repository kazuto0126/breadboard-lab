import type { ComponentDefinition, ComponentInstance, Footprint, Rotation } from '../../types/component';

type Offset = [number, number];

/** 以螢幕座標（y 向下）順時針旋轉。用 0 - v 避免產生 -0。 */
export function rotateOffset([dx, dy]: Offset, rotation: Rotation): Offset {
  switch (rotation) {
    case 0:
      return [dx, dy];
    case 90:
      return [0 - dy, dx];
    case 180:
      return [0 - dx, 0 - dy];
    case 270:
      return [dy, 0 - dx];
  }
}

export function effectiveSpan(instance: ComponentInstance, def: ComponentDefinition): number {
  return def.package.type === 'two-lead' ? (instance.span ?? def.package.defaultSpan) : 0;
}

function localFootprint(def: ComponentDefinition, span: number): { pins: Array<[number, Offset]>; blocked: Offset[] } {
  const pkg = def.package;
  switch (pkg.type) {
    case 'dip': {
      const half = pkg.pinCount / 2;
      const pins: Array<[number, Offset]> = [];
      for (let i = 0; i < half; i++) pins.push([i + 1, [i, 0]]);
      for (let j = 0; j < half; j++) pins.push([half + 1 + j, [half - 1 - j, -pkg.rowSpacing]]);
      const blocked: Offset[] = [];
      for (let y = -pkg.rowSpacing; y <= 0; y++) for (let x = 0; x < half; x++) blocked.push([x, y]);
      return { pins, blocked };
    }
    case 'two-lead': {
      const blocked: Offset[] = [];
      if (pkg.blocksBetween) for (let x = 1; x < span; x++) blocked.push([x, 0]);
      return { pins: [[1, [0, 0]], [2, [span, 0]]], blocked };
    }
    case 'single':
      return { pins: [[1, [0, 0]]], blocked: [] };
    case 'tactile4': {
      const blocked: Offset[] = [];
      for (let y = -3; y <= 0; y++) for (let x = 0; x <= 2; x++) blocked.push([x, y]);
      return { pins: [[1, [0, 0]], [2, [0, -3]], [3, [2, 0]], [4, [2, -3]]], blocked };
    }
  }
}

export function resolveFootprint(instance: ComponentInstance, def: ComponentDefinition): Footprint {
  const local = localFootprint(def, effectiveSpan(instance, def));
  const place = (offset: Offset) => {
    const [dx, dy] = rotateOffset(offset, instance.rotation);
    return { boardId: instance.boardId, x: instance.anchor.x + dx, y: instance.anchor.y + dy };
  };
  return {
    pins: local.pins.map(([pinNumber, offset]) => ({ pinNumber, point: place(offset) })),
    blocked: local.blocked.map(place),
  };
}
