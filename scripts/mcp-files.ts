import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseCircuitData } from '../src/editor/fileFormat';
import { emptyDiagram } from '../src/logic/types';
import type { LabFile } from '../src/mcp/tools';

/** 讀電路檔；不是電路檔時回傳說明（shown：回覆裡顯示的路徑）。 */
export function loadLabFile(abs: string, shown: string): LabFile | string {
  if (!existsSync(abs)) return `找不到 ${shown}；用 new_circuit 建立`;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, 'utf8'));
  } catch {
    return `${shown} 不是 JSON 檔`;
  }
  const parsed = parseCircuitData(raw);
  if (!parsed.ok) return `${shown} 不是電路檔：${parsed.error}`;
  return { name: parsed.name ?? basename(abs, '.json'), circuit: parsed.circuit, logic: parsed.logic ?? emptyDiagram() };
}

/** 往下最多幾層資料夾、最多列幾個電路檔、最多看幾個 .json 檔、太大的檔案不讀（電路檔都很小）。 */
const MAX_DEPTH = 3;
const MAX_FILES = 100;
const MAX_SCANNED = 500;
const MAX_BYTES = 2_000_000;
const skipped = (name: string) => name === 'node_modules' || name.startsWith('.');

/**
 * 子專案 33（規格第 3 節）：工作資料夾裡的電路檔，照路徑排序。往下最多 3 層，略過 node_modules 與 . 開頭的資料夾，
 * 最多 100 個；讀不了、太大或不是電路檔的 .json 不列。資料夾很大時（例如沒給 --folder、從家目錄啟動）最多看 500 個 .json 檔，
 * 沒看完時 truncated 是 true。
 */
export function listCircuitFiles(folder: string): { files: Array<{ path: string; lab: LabFile }>; truncated: boolean } {
  const found: Array<{ path: string; lab: LabFile }> = [];
  let scanned = 0;
  let truncated = false;
  const walk = (dir: string, rel: string, depth: number) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (found.length >= MAX_FILES || scanned >= MAX_SCANNED) {
        truncated = true;
        return;
      }
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (depth < MAX_DEPTH && !skipped(e.name)) walk(join(dir, e.name), path, depth + 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.json')) {
        scanned++;
        let size = Infinity;
        try {
          size = statSync(join(dir, e.name)).size;
        } catch {
          // 讀不到大小就當成太大。
        }
        if (size > MAX_BYTES) continue;
        const lab = loadLabFile(join(dir, e.name), path);
        if (typeof lab !== 'string') found.push({ path, lab });
      }
    }
  };
  walk(folder, '', 0);
  return { files: found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)), truncated };
}
