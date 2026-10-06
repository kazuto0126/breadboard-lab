import { getBoardElement } from '../interaction/boardRegistry';
import { latticeToScreen, panBy } from '../interaction/viewport';
import { useEditor } from '../store/editorStore';

/** 把格點移到主畫面中央；畫布還沒有尺寸時不動作。 */
export function centerViewportOn(point: { x: number; y: number }): void {
  const el = getBoardElement();
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const s = useEditor.getState();
  const at = latticeToScreen(s.viewport, point.x, point.y);
  s.setViewport(panBy(s.viewport, rect.width / 2 - at.x, rect.height / 2 - at.y));
}
