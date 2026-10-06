import type { Rect } from '../editor/geometry';

const MARGIN = 12;

/** 下載文字檔。 */
export function downloadText(text: string, filename: string, mime = 'application/json'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 檔名不能用的字元換成底線。 */
export function safeFilename(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'circuit';
}

/**
 * 把畫面上的麵包板 SVG 變成獨立的 SVG 檔：
 * 移除互動用的圖層（hover、選取、ghost、檢查標記）、拿掉縮放平移，viewBox 剛好包住板子。
 */
export function buildSvgExport(svg: SVGSVGElement, bounds: Rect): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-ui]').forEach((node) => node.remove());
  clone.querySelector('[data-viewport]')?.removeAttribute('transform');
  clone.querySelectorAll('[style]').forEach((node) => node.removeAttribute('style'));
  clone.querySelectorAll('[class]').forEach((node) => node.removeAttribute('class'));
  clone.querySelectorAll('[pathLength]').forEach((node) => node.removeAttribute('pathLength'));
  clone.removeAttribute('id');
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  const x = bounds.x - MARGIN;
  const y = bounds.y - MARGIN;
  const width = bounds.width + 2 * MARGIN;
  const height = bounds.height + 2 * MARGIN;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** 把 SVG 文字畫到 Canvas（預設 2 倍解析度）再轉成 PNG。 */
export async function svgToPng(svgText: string, scale = 2): Promise<Blob> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(image.width * scale);
  canvas.height = Math.ceil(image.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援 Canvas');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 轉換失敗'))), 'image/png'));
}
