import { blockOf } from '../../logic/customBlocks';
import { useLogic } from '../../state/logic';

/**
 * 子專案 65（規格 2026-11-14 custom-blocks 第 4 節）：在方塊裡編輯時，畫布上方顯示「主圖 › B1」與「回到上一層」。
 */
export function BlockPath() {
  const outer = useLogic((s) => s.outer);
  if (outer.length === 0) return null;
  const names = outer.map((o) => blockOf(o.diagram, o.blockId)?.name ?? o.blockId);
  return (
    <div data-testid="block-path" className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-emerald-700 bg-emerald-950/90 px-3 py-1.5 text-sm text-emerald-100 shadow">
      <span>主圖</span>
      {names.map((n, i) => (
        <span key={i}>› {n}</span>
      ))}
      <button type="button" className="ml-2 rounded bg-emerald-700 px-2 py-0.5 text-xs text-white hover:bg-emerald-600" onClick={() => useLogic.getState().exitBlock()}>
        回到上一層
      </button>
      <span className="text-xs text-emerald-300/80">改完回去時，每個用到這個方塊的地方一起更新</span>
    </div>
  );
}
