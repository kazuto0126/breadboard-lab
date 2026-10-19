import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { listCircuitFiles } from '../../scripts/mcp-files';
import { toCircuitFile } from '../../src/editor/fileFormat';
import { createTask } from '../../src/logic/task';
import { describeLabFile, newLabFile } from '../../src/mcp/tools';

const tmp = mkdtempSync(join(tmpdir(), 'bl-files-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const put = (rel: string, data: unknown) => {
  mkdirSync(dirname(join(tmp, rel)), { recursive: true });
  writeFileSync(join(tmp, rel), JSON.stringify(data));
};
const circuit = (name: string) => toCircuitFile(newLabFile(name, 'MB102').circuit, name);

describe('circuit files in the working folder (sub-project 33)', () => {
  it('lists circuit files up to three folders deep, skipping other JSON and hidden or package folders', () => {
    put('a.json', circuit('a'));
    put('notes.json', {});
    put('node_modules/x.json', circuit('x'));
    put('.hidden/y.json', circuit('y'));
    put('a/b/c/ok.json', circuit('ok'));
    put('a/b/c/d/deep.json', circuit('deep'));
    expect(listCircuitFiles(tmp).map((f) => f.path)).toEqual(['a.json', 'a/b/c/ok.json']);
  });

  it('describes a file: board, parts, diagram and task', () => {
    const lab = newLabFile('t', 'MB102');
    expect(describeLabFile(lab)).toBe('MB-102，元件 0 個，沒有邏輯圖，沒有題目');
    const made = createTask(['A', 'B', 'C'], ['X']);
    if (!made.ok) throw new Error(made.reason);
    const withTask = { ...lab, logic: { ...lab.logic, task: made.task } };
    expect(describeLabFile(withTask)).toBe('MB-102，元件 0 個，沒有邏輯圖，有題目（A B C → X）');
  });
});
