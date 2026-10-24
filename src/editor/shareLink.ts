/**
 * 子專案 43（規格 2026-10-24 share-link）：用連結開啟電路。電路檔（和「匯出 JSON」一樣）用 deflate 壓縮、base64url 編碼後
 * 放在網址 `#c=` 後面；`#` 後面不會送到伺服器。網頁與 MCP 共用（CompressionStream 在瀏覽器與 Node 都有）。
 */

/** 線上版的網址：離線版（file://）與 MCP 做的連結從這裡開始。 */
export const SITE_URL = 'https://kazuto0126.github.io/breadboard-lab-site/';
/** 超過這麼多個字時提醒：有些通訊軟體會截斷很長的網址。 */
export const LONG_LINK = 8000;

const PREFIX = '#c=';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 連結的開頭：網頁從 http(s) 開啟時用目前網址（不含 #），離線版用線上版的網址。 */
export function linkBase(href: string): string {
  const url = new URL(href);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return SITE_URL;
  url.hash = '';
  return url.toString();
}

/** 電路檔的文字做成連結。 */
export async function makeShareLink(base: string, fileText: string): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(fileText), new CompressionStream('deflate-raw'));
  return `${base}${PREFIX}${toBase64Url(packed)}`;
}

export type ShareHash = { kind: 'none' } | { kind: 'circuit'; text: string } | { kind: 'error'; reason: string };

/** 讀網址的 #：不是 #c= 時是 none；解不開時說明原因（電路檔本身對不對由匯入時檢查）。 */
export async function readShareHash(hash: string): Promise<ShareHash> {
  if (!hash.startsWith(PREFIX)) return { kind: 'none' };
  const data = hash.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(data)) return { kind: 'error', reason: '連結裡的電路讀不出來（連結不完整，可能被截斷了）' };
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw')));
    return { kind: 'circuit', text };
  } catch {
    return { kind: 'error', reason: '連結裡的電路讀不出來（連結不完整，可能被截斷了）' };
  }
}

/** 字數說明（太長時加上提醒）。 */
export function linkLengthNote(link: string): string {
  return link.length > LONG_LINK
    ? `連結有 ${link.length} 個字，有些通訊軟體會截斷很長的網址；大電路建議改用「匯出 JSON」。`
    : `連結有 ${link.length} 個字。`;
}
