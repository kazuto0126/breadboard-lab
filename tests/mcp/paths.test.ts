import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { insideProject } from '../../scripts/mcp-paths';

const root = resolve('/work/lab');

describe('only files inside the project', () => {
  it('accepts relative and absolute paths inside the project', () => {
    expect(insideProject(root, 'circuits/xor.json')).toEqual({ ok: true, path: join(root, 'circuits', 'xor.json') });
    expect(insideProject(root, join(root, 'a.json'))).toEqual({ ok: true, path: join(root, 'a.json') });
  });

  it('refuses paths that leave the project, the folder itself, and files that are not .json', () => {
    expect(insideProject(root, '../other/x.json')).toEqual({ ok: false, error: '只能讀寫專案資料夾裡的檔案（../other/x.json 在外面）' });
    expect(insideProject(root, resolve('/elsewhere/x.json')).ok).toBe(false);
    expect(insideProject(root, '.')).toMatchObject({ ok: false });
    expect(insideProject(root, '')).toEqual({ ok: false, error: 'file 不能是空的' });
    expect(insideProject(root, 'src/main.tsx')).toEqual({ ok: false, error: '電路檔要是 .json 檔（src/main.tsx）' });
  });
});
