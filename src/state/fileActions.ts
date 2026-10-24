import { serializeCircuitFile } from '../editor/fileFormat';
import { linkBase, linkLengthNote, LONG_LINK, makeShareLink, readShareHash } from '../editor/shareLink';
import { boardFrames, worldBounds } from '../editor/geometry';
import { buildSvgExport, downloadBlob, downloadText, safeFilename, svgToPng } from '../render/exportImage';
import { useLogic } from './logic';
import { useStore } from './store';

/** 需要 DOM 的檔案動作（下載、選檔）；store 本身保持不依賴 DOM 細節。 */

function baseName(): string {
  return safeFilename(useStore.getState().projectName ?? 'breadboard-circuit');
}

export function exportJson(): void {
  const s = useStore.getState();
  downloadText(serializeCircuitFile(s.circuit, s.projectName ?? baseName(), undefined, useLogic.getState().diagram), `${baseName()}.json`);
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

/** 子專案 43：目前的電路（麵包板＋邏輯圖）做成連結，複製到剪貼簿。 */
export async function copyShareLink(): Promise<void> {
  const s = useStore.getState();
  const link = await makeShareLink(linkBase(window.location.href), serializeCircuitFile(s.circuit, s.projectName ?? baseName(), undefined, useLogic.getState().diagram));
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    s.toast('error', '不能複製到剪貼簿（瀏覽器不允許）；請改用「匯出 JSON」');
    return;
  }
  s.toast(link.length > LONG_LINK ? 'warning' : 'success', `已複製連結。${linkLengthNote(link)}`);
}

/** 子專案 43：網址有 #c= 時開啟裡面的電路，處理完把 # 拿掉（重新整理時不會再開一次）。 */
export async function openFromLocationHash(): Promise<void> {
  const hash = window.location.hash;
  if (!hash.startsWith('#c=')) return;
  // 先拿掉再解開：同時被叫兩次（開發模式的 StrictMode）時只開一次。
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const r = await readShareHash(hash);
  if (r.kind === 'none') return;
  if (r.kind === 'error') useStore.getState().toast('error', r.reason);
  else useStore.getState().openShared(r.text);
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
