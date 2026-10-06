import { serializeCircuitFile } from '../editor/fileFormat';
import { boardFrames, worldBounds } from '../editor/geometry';
import { buildSvgExport, downloadBlob, downloadText, safeFilename, svgToPng } from '../render/exportImage';
import { useStore } from './store';

/** 需要 DOM 的檔案動作（下載、選檔）；store 本身保持不依賴 DOM 細節。 */

function baseName(): string {
  return safeFilename(useStore.getState().projectName ?? 'breadboard-circuit');
}

export function exportJson(): void {
  const s = useStore.getState();
  downloadText(serializeCircuitFile(s.circuit, s.projectName ?? baseName()), `${baseName()}.json`);
  s.toast('success', '已匯出 JSON');
}

function currentSvg(): string | null {
  const s = useStore.getState();
  const svg = document.getElementById('bbl-board-svg') as SVGSVGElement | null;
  const bounds = worldBounds(boardFrames(s.circuit));
  if (!svg || !bounds) {
    s.toast('error', '找不到麵包板畫面，請先回到編輯畫面');
    return null;
  }
  return buildSvgExport(svg, bounds);
}

export function exportSvg(): void {
  const text = currentSvg();
  if (!text) return;
  downloadText(text, `${baseName()}.svg`, 'image/svg+xml');
  useStore.getState().toast('success', '已匯出 SVG');
}

export async function exportPng(): Promise<void> {
  const text = currentSvg();
  if (!text) return;
  try {
    downloadBlob(await svgToPng(text), `${baseName()}.png`);
    useStore.getState().toast('success', '已匯出 PNG');
  } catch (err) {
    useStore.getState().toast('error', `PNG 匯出失敗：${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 開啟選檔視窗並匯入 JSON。 */
export function importJsonFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    useStore.getState().importJson(await file.text());
  };
  input.click();
}
