import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Circuit } from '../../types/circuit';
import { registerBoardElement } from '../interaction/boardRegistry';
import { ContextMenu } from '../interaction/ContextMenu';
import { useBoardInteractions } from '../interaction/useBoardInteractions';
import { fitViewport, zoomAt } from '../interaction/viewport';
import { isRoutingStale } from '../model/projectFile';
import { useEditor } from '../store/editorStore';
import { BoardSvg, type OverlayData } from './BoardSvg';
import { invalidWireIds, markersFromErrors } from './markers';
import { netHighlightFor } from './netHighlight';

function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function ZoomButton({ label, text, onClick }: { label: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-300 bg-white text-lg shadow-sm hover:bg-gray-50 lg:h-8 lg:w-8 lg:text-base"
    >
      {text}
    </button>
  );
}

export interface BoardCanvasProps {
  /** 要顯示的電路；省略時顯示目前文件，並在編輯模式下可以編輯。 */
  circuit?: Circuit;
  label?: string;
  selectable?: boolean;
  registerAsMain?: boolean;
}

export function BoardCanvas({ circuit, label, selectable = true, registerAsMain = false }: BoardCanvasProps) {
  const doc = useEditor((s) => s.doc);
  const mode = useEditor((s) => s.mode);
  const viewport = useEditor((s) => s.viewport);
  const selection = useEditor((s) => s.selection);
  const ghost = useEditor((s) => s.ghost);
  const wirePreview = useEditor((s) => s.wirePreview);
  const wireColor = useEditor((s) => s.wireColor);
  const previewWires = useEditor((s) => s.previewWires);
  const focusWireId = useEditor((s) => s.focusWireId);
  const liveCheck = useEditor((s) => s.analysis.liveCheck);
  const routingJob = useEditor((s) => s.routingJob);
  const armed = useEditor((s) => s.armedPart !== null);

  const showsDocument = circuit === undefined;
  const shown = circuit ?? doc.circuit;
  const editable = showsDocument && mode === 'edit';
  const { ref, handlers, contextMenu, closeContextMenu } = useBoardInteractions({ circuit: shown, editable, selectable });

  const setSvg = useCallback(
    (el: SVGSVGElement | null) => {
      ref(el);
      if (registerAsMain) registerBoardElement(el);
    },
    [ref, registerAsMain],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(containerRef);
  useEffect(() => {
    const v = useEditor.getState().viewport;
    const isDefault = v.scale === 1 && v.tx === 0 && v.ty === 0;
    if (size.width > 0 && size.height > 0 && isDefault) useEditor.getState().setViewport(fitViewport(size.width, size.height));
  }, [size.width, size.height]);

  const net = useMemo(() => (showsDocument ? netHighlightFor(selection, shown) : null), [showsDocument, selection, shown]);
  const markers = useMemo(() => (showsDocument ? markersFromErrors(liveCheck, shown) : []), [showsDocument, liveCheck, shown]);
  const invalid = useMemo(() => (showsDocument ? invalidWireIds(liveCheck) : undefined), [showsDocument, liveCheck]);
  const dimmed = useMemo(() => {
    if (!showsDocument) return undefined;
    if (focusWireId) return new Set(shown.wires.filter((w) => w.id !== focusWireId).map((w) => w.id));
    if (!doc.routing || isRoutingStale(doc)) return undefined;
    return new Set(
      Object.entries(doc.routing.checklist)
        .filter(([, done]) => done)
        .map(([id]) => id),
    );
  }, [showsDocument, focusWireId, shown, doc]);
  const animation = useMemo(
    () => (showsDocument && routingJob.status === 'animating' ? { order: routingJob.wireIds, stepMs: routingJob.stepMs } : null),
    [showsDocument, routingJob],
  );
  const fading = animation && doc.routing ? doc.routing.before : undefined;
  const overlay: OverlayData | null = showsDocument ? { selection, net, markers, ghost, wirePreview, wireColor, previewWires, focusWireId } : null;

  const zoomBy = (factor: number) => {
    const s = useEditor.getState();
    s.setViewport(zoomAt(s.viewport, factor, size.width / 2, size.height / 2));
  };
  const fit = () => useEditor.getState().setViewport(fitViewport(size.width, size.height));

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden ${armed ? 'cursor-copy' : ''}`}>
      <BoardSvg
        svgRef={setSvg}
        circuit={shown}
        viewport={viewport}
        invalidWireIds={invalid}
        dimmedWireIds={dimmed}
        animation={animation}
        fadingWires={fading}
        overlay={overlay}
        handlers={handlers}
        label={label}
      />
      {label && <div className="pointer-events-none absolute left-3 top-3 rounded bg-white/90 px-2 py-1 text-sm font-semibold shadow">{label}</div>}
      <div className="absolute bottom-3 right-3 flex gap-1">
        <ZoomButton label="放大" text="＋" onClick={() => zoomBy(1.25)} />
        <ZoomButton label="縮小" text="－" onClick={() => zoomBy(1 / 1.25)} />
        <ZoomButton label="符合畫面" text="⤢" onClick={fit} />
        <ZoomButton label="重設" text="⟲" onClick={fit} />
      </div>
      {contextMenu && <ContextMenu menu={contextMenu} onClose={closeContextMenu} />}
    </div>
  );
}
