import { extname, isAbsolute, relative, resolve } from 'node:path';

/**
 * 規格（2026-10-17 mcp-server）第 1 節：MCP 工具只能讀寫專案資料夾裡的 .json 檔；
 * 資料夾外（..、其他磁碟）與不是 .json 的檔案一律拒絕。
 */
export function insideProject(root: string, raw: string): { ok: true; path: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'file 不能是空的' };
  const abs = resolve(root, text);
  const rel = relative(root, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return { ok: false, error: `只能讀寫專案資料夾裡的檔案（${text} 在外面）` };
  if (extname(abs).toLowerCase() !== '.json') return { ok: false, error: `電路檔要是 .json 檔（${text}）` };
  return { ok: true, path: abs };
}
