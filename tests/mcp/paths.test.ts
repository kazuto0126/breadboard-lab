import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { folderFromArgs, insideProject } from '../../scripts/mcp-paths';

const root = resolve('/work/lab');

describe('only files inside the working folder', () => {
  it('accepts relative and absolute paths inside the folder', () => {
    expect(insideProject(root, 'circuits/xor.json')).toEqual({ ok: true, path: join(root, 'circuits', 'xor.json') });
    expect(insideProject(root, join(root, 'a.json'))).toEqual({ ok: true, path: join(root, 'a.json') });
  });

  it('refuses paths that leave the folder, the folder itself, and files that are not .json', () => {
    expect(insideProject(root, '../other/x.json')).toEqual({ ok: false, error: '只能讀寫工作資料夾裡的檔案（../other/x.json 在外面）' });
    expect(insideProject(root, resolve('/elsewhere/x.json')).ok).toBe(false);
    expect(insideProject(root, '.')).toMatchObject({ ok: false });
    expect(insideProject(root, '')).toEqual({ ok: false, error: 'file 不能是空的' });
    expect(insideProject(root, 'src/main.tsx')).toEqual({ ok: false, error: '電路檔要是 .json 檔（src/main.tsx）' });
  });
});

describe('the working folder from the command line (sub-project 33)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bl-folder-'));
  const spaced = join(tmp, 'My Circuits');
  mkdirSync(spaced);
  writeFileSync(join(tmp, 'file.txt'), '');
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('uses --folder, relative to the current folder, and accepts spaces', () => {
    expect(folderFromArgs(['--folder', 'My Circuits'], tmp)).toEqual({ ok: true, folder: spaced });
    expect(folderFromArgs([`--folder=${spaced}`], '/somewhere/else')).toEqual({ ok: true, folder: spaced });
  });

  it('defaults to the current folder', () => {
    expect(folderFromArgs([], tmp)).toEqual({ ok: true, folder: tmp });
  });

  it('refuses a folder that does not exist or is a file', () => {
    expect(folderFromArgs(['--folder', 'nope'], tmp)).toEqual({ ok: false, error: `找不到工作資料夾 ${join(tmp, 'nope')}` });
    expect(folderFromArgs(['--folder', 'file.txt'], tmp)).toEqual({ ok: false, error: `找不到工作資料夾 ${join(tmp, 'file.txt')}` });
    expect(folderFromArgs(['--folder'], tmp)).toMatchObject({ ok: false });
  });
});
