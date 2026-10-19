import { existsSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';

/**
 * 規格（2026-10-17 mcp-server）第 1 節：MCP 工具只能讀寫工作資料夾裡的 .json 檔；
 * 資料夾外（..、其他磁碟）與不是 .json 的檔案一律拒絕。子專案 33：「專案資料夾」改成可以指定的工作資料夾。
 */
export function insideProject(root: string, raw: string): { ok: true; path: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'file 不能是空的' };
  const abs = resolve(root, text);
  const rel = relative(root, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return { ok: false, error: `只能讀寫工作資料夾裡的檔案（${text} 在外面）` };
  if (extname(abs).toLowerCase() !== '.json') return { ok: false, error: `電路檔要是 .json 檔（${text}）` };
  return { ok: true, path: abs };
}

/**
 * 子專案 33（規格 2026-10-19 mcp-other-tools 第 3 節）：工作資料夾來自 `--folder <路徑>` 或 `--folder=<路徑>`
 * （相對路徑從目前資料夾算起）；沒給時就是目前資料夾。資料夾要存在。
 */
export function folderFromArgs(argv: string[], cwd: string): { ok: true; folder: string } | { ok: false; error: string } {
  let given: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--folder') {
      given = argv[i + 1];
      if (given === undefined || given.startsWith('--')) return { ok: false, error: '--folder 後面要寫工作資料夾的路徑' };
    } else if (argv[i].startsWith('--folder=')) given = argv[i].slice('--folder='.length);
  }
  const folder = resolve(cwd, given ?? '.');
  if (!existsSync(folder) || !statSync(folder).isDirectory()) return { ok: false, error: `找不到工作資料夾 ${folder}` };
  return { ok: true, folder };
}
