import { useMemo, useState } from 'react';
import { getComponentDefinition } from '../../core/circuit/library';
import type { ComponentInstance } from '../../types/component';
import { ComponentGlyph } from '../board/ComponentGlyph';
import { boundsOf, componentCells } from '../geometry/componentShape';
import { usePartDrag } from '../interaction/usePartDrag';
import type { PartTemplate } from '../model/editorTypes';
import { useEditor } from '../store/editorStore';
import { filterCatalog, partCatalog } from './partTemplates';

function PartIcon({ part }: { part: PartTemplate }) {
  const def = getComponentDefinition(part.defId);
  if (!def) return null;
  const instance: ComponentInstance = { id: 'icon', defId: part.defId, boardId: 'b1', anchor: { x: 0, y: 0 }, rotation: 0, props: part.props };
  const b = boundsOf(componentCells(instance, def));
  const m = 1.5;
  return (
    <svg aria-hidden="true" width={36} height={24} viewBox={`${(b.minX - m) * 10} ${(b.minY - m) * 10} ${(b.maxX - b.minX + 2 * m) * 10} ${(b.maxY - b.minY + 2 * m) * 10}`}>
      <ComponentGlyph instance={instance} />
    </svg>
  );
}

function PartTile({ part }: { part: PartTemplate }) {
  const onPointerDown = usePartDrag(part);
  const armed = useEditor((s) => s.armedPart?.key === part.key);
  return (
    <button
      type="button"
      data-part={part.key}
      onPointerDown={onPointerDown}
      style={{ touchAction: 'none' }}
      className={`flex min-h-11 items-center gap-1 rounded-md border px-1.5 py-1 text-left text-xs hover:bg-gray-50 ${armed ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
    >
      <PartIcon part={part} />
      <span className="min-w-0 flex-1 truncate">{part.label}</span>
    </button>
  );
}

export function PartsPanel() {
  const [query, setQuery] = useState('');
  const catalog = useMemo(() => partCatalog(), []);
  const visible = filterCatalog(catalog, query);
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-gray-200 p-2">
        <input
          type="search"
          aria-label="搜尋元件"
          placeholder="搜尋元件（例如 74LS00、220Ω）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-2 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {visible.map((c) => (
          <section key={c.id} className="mb-3">
            <h3 className="mb-1 text-xs font-semibold text-gray-500">{c.title}</h3>
            <div className="grid grid-cols-2 gap-1">
              {c.parts.map((p) => (
                <PartTile key={p.key} part={p} />
              ))}
            </div>
          </section>
        ))}
        {visible.length === 0 && <p className="text-sm text-gray-500">找不到符合的元件</p>}
      </div>
    </div>
  );
}
