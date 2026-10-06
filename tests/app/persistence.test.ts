import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/app/model/projectFile';
import {
  deleteProject,
  listProjects,
  newProjectId,
  openProject,
  readAutosave,
  restoreAutosave,
  saveProject,
  STORAGE_FULL,
  STORAGE_KEYS,
  STORAGE_UNAVAILABLE,
  writeAutosave,
  type KeyValueStore,
} from '../../src/app/persistence/browserStorage';
import { parseProjectFile, projectFileName, safeFileName, serializeProject } from '../../src/app/persistence/projectIO';
import { acceptanceCircuit } from '../fixtures/circuits';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

class ThrowingStore implements KeyValueStore {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('SecurityError');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

class FullStore extends MemoryStore {
  setItem(): void {
    throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  }
}

const doc = () => ({ ...createProject('我的電路', new Date('2026-10-06T00:00:00Z')), circuit: acceptanceCircuit() });

describe('parseProjectFile', () => {
  it('round-trips a project file', () => {
    const original = doc();
    expect(parseProjectFile(serializeProject(original))).toEqual({ ok: true, doc: original });
  });

  it('wraps a bare circuit and names it after the file', () => {
    const parsed = parseProjectFile(JSON.stringify(acceptanceCircuit()), '驗收');
    expect(parsed.ok && parsed.doc.name).toBe('驗收');
    expect(parsed.ok && parsed.doc.circuit).toEqual(acceptanceCircuit());
  });

  it('explains the first problem in Chinese', () => {
    const c = acceptanceCircuit();
    const first = c.components[0];
    expect(parseProjectFile('{oops')).toEqual({ ok: false, reason: '檔案不是有效的 JSON' });
    expect(parseProjectFile('[]')).toEqual({ ok: false, reason: '檔案內容不是 breadboard-lab 的電路' });
    expect(parseProjectFile(JSON.stringify({ ...doc(), version: 2 }))).toEqual({ ok: false, reason: '不支援的檔案版本' });
    expect(parseProjectFile(JSON.stringify({ ...c, boards: [...c.boards, { ...c.boards[0], id: 'b2' }] }))).toEqual({
      ok: false,
      reason: '目前只支援一塊 MB-102 麵包板',
    });
    expect(parseProjectFile(JSON.stringify({ ...c, components: [{ ...first, defId: '74LS999' }] }))).toEqual({
      ok: false,
      reason: '找不到元件「74LS999」',
    });
    expect(parseProjectFile(JSON.stringify({ ...c, components: [{ ...first, rotation: 45 }] }))).toEqual({
      ok: false,
      reason: `元件 ${first.id} 的旋轉角度不正確`,
    });
    expect(parseProjectFile(JSON.stringify({ ...c, components: [first, first] }))).toEqual({ ok: false, reason: `元件 ID 重複：${first.id}` });
    expect(parseProjectFile(JSON.stringify({ ...c, wires: [{ ...c.wires[0], path: [{ x: 1.5, y: 2 }] }] }))).toEqual({
      ok: false,
      reason: `導線 ${c.wires[0].id} 的座標不正確`,
    });
  });

  it('drops a malformed routing record instead of failing', () => {
    const parsed = parseProjectFile(JSON.stringify({ ...doc(), routing: { before: 'x' } }));
    expect(parsed.ok && parsed.doc.routing).toBeNull();
  });
});

describe('file names', () => {
  it('replaces characters that are not allowed in file names', () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(safeFileName('   ')).toBe('未命名電路');
    expect(projectFileName(createProject('實驗 1/2'), 'breadboard.json')).toBe('實驗 1_2.breadboard.json');
    expect(projectFileName(createProject('板子'), 'png')).toBe('板子.png');
  });
});

describe('browser storage', () => {
  it('writes and restores the autosave', () => {
    const store = new MemoryStore();
    expect(writeAutosave(store, doc(), 'p_1', false)).toEqual({ ok: true, value: undefined });
    expect(readAutosave(store)).toEqual({ doc: doc(), projectId: 'p_1', dirty: false });
  });

  it('remembers across reloads that the work was never saved', () => {
    const store = new MemoryStore();
    writeAutosave(store, doc(), null, true);
    expect(readAutosave(store)?.dirty).toBe(true);
    expect(restoreAutosave(new MemoryStore()).dirty).toBe(false);
  });

  it('falls back to a blank circuit when the autosave is corrupted', () => {
    const store = new MemoryStore();
    store.setItem(STORAGE_KEYS.autosave, '{"project":{"format":"breadboard-lab","version":7}}');
    expect(readAutosave(store)).toBeNull();
    expect(restoreAutosave(store).doc.circuit.components).toEqual([]);
    store.setItem(STORAGE_KEYS.autosave, 'not json');
    expect(readAutosave(store)).toBeNull();
  });

  it('keeps working when storage is unavailable or full', () => {
    expect(writeAutosave(new ThrowingStore(), doc(), null)).toEqual({ ok: false, reason: STORAGE_UNAVAILABLE });
    expect(writeAutosave(null, doc(), null)).toEqual({ ok: false, reason: STORAGE_UNAVAILABLE });
    expect(readAutosave(new ThrowingStore())).toBeNull();
    expect(listProjects(new ThrowingStore())).toEqual([]);
    expect(saveProject(new FullStore(), doc(), null)).toEqual({ ok: false, reason: STORAGE_FULL });
  });

  it('saves, lists, opens and deletes projects', () => {
    const store = new MemoryStore();
    const first = saveProject(store, doc(), null, new Date('2026-10-06T01:00:00Z'), () => 'p_a');
    expect(first.ok && first.value.projectId).toBe('p_a');
    saveProject(store, { ...doc(), name: '第二個' }, null, new Date('2026-10-06T02:00:00Z'), () => 'p_b');
    saveProject(store, { ...doc(), name: '改名了' }, 'p_a', new Date('2026-10-06T03:00:00Z'));
    expect(listProjects(store)).toEqual([
      { id: 'p_a', name: '改名了', savedAt: '2026-10-06T03:00:00.000Z' },
      { id: 'p_b', name: '第二個', savedAt: '2026-10-06T02:00:00.000Z' },
    ]);
    const opened = openProject(store, 'p_b');
    expect(opened.ok && opened.value.name).toBe('第二個');
    expect(deleteProject(store, 'p_b')).toEqual({ ok: true, value: undefined });
    expect(listProjects(store).map((e) => e.id)).toEqual(['p_a']);
    expect(openProject(store, 'p_b')).toEqual({ ok: false, reason: '找不到這個專案' });
  });

  it('makes readable project ids', () => {
    expect(newProjectId(new Date(0), () => 0)).toBe('p_0_0000');
  });
});
