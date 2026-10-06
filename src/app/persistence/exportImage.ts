import { BOARD_HEIGHT, BOARD_WIDTH } from '../interaction/viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const EXPORT_LAYERS = ['board', 'components', 'wires'] as const;

/** 規格第 11.3 節：複製板子、元件、導線三層，去掉動畫、淡出中的舊導線與變淡，變成獨立的 SVG。 */
export function boardSvgMarkup(svg: SVGSVGElement): string {
  const out = svg.ownerDocument.createElementNS(SVG_NS, 'svg');
  out.setAttribute('viewBox', `0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`);
  out.setAttribute('width', String(BOARD_WIDTH * 2));
  out.setAttribute('height', String(BOARD_HEIGHT * 2));
  for (const name of EXPORT_LAYERS) {
    const layer = svg.querySelector(`[data-layer="${name}"]`);
    if (layer) out.appendChild(layer.cloneNode(true));
  }
  out.querySelectorAll('[data-fading]').forEach((el) => el.remove());
  out.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
  out.querySelectorAll('[data-wire-id]').forEach((el) => el.removeAttribute('opacity'));
  return new XMLSerializer().serializeToString(out);
}

/** 把 SVG 文字畫到 scale 倍大的白底 canvas，輸出 PNG。 */
export async function svgMarkupToPng(markup: string, width: number = BOARD_WIDTH * 2, height: number = BOARD_HEIGHT * 2, scale = 2): Promise<Blob> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('無法把電路圖轉成圖片'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('瀏覽器不支援畫布');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('無法產生 PNG'))), 'image/png'),
  );
}
