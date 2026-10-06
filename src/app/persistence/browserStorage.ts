import { createProject, type ProjectFile } from '../model/projectFile';
import { parseProjectFile } from './projectIO';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEYS = {
  autosave: 'breadboard-lab:autosave',
  projects: 'breadboard-lab:projects',
  project: (id: string) => `breadboard-lab:project:${id}`,
};

export const STORAGE_FULL = '瀏覽器儲存空間不足，請匯出 JSON 保存';
export const STORAGE_UNAVAILABLE = '無法使用瀏覽器儲存（可能是隱私模式），請匯出 JSON 保存';

export type StorageResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface ProjectEntry {
  id: string;
  name: string;
  savedAt: string;
}

/** 取得瀏覽器的 localStorage；被封鎖或不存在時回傳 null。 */
export function getBrowserStore(): KeyValueStore | null {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    store.getItem(STORAGE_KEYS.autosave);
    return store;
  } catch {
    return null;
  }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

function write(store: KeyValueStore | null, key: string, value: string): StorageResult<void> {
  if (!store) return { ok: false, reason: STORAGE_UNAVAILABLE };
  try {
    store.setItem(key, value);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, reason: isQuotaError(error) ? STORAGE_FULL : STORAGE_UNAVAILABLE };
  }
}

function read(store: KeyValueStore | null, key: string): string | null {
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

export function writeAutosave(store: KeyValueStore | null, doc: ProjectFile, projectId: string | null): StorageResult<void> {
  return write(store, STORAGE_KEYS.autosave, JSON.stringify({ projectId, project: doc }));
}

export function readAutosave(store: KeyValueStore | null): { doc: ProjectFile; projectId: string | null } | null {
  const text = read(store, STORAGE_KEYS.autosave);
  if (text === null) return null;
  try {
    const data = JSON.parse(text) as { projectId?: unknown; project?: unknown };
    const parsed = parseProjectFile(JSON.stringify(data.project));
    if (!parsed.ok) return null;
    return { doc: parsed.doc, projectId: typeof data.projectId === 'string' ? data.projectId : null };
  } catch {
    return null;
  }
}

/** 啟動時使用：有可用的自動存檔就載入，否則給一個空白電路。 */
export function restoreAutosave(store: KeyValueStore | null): { doc: ProjectFile; projectId: string | null } {
  return readAutosave(store) ?? { doc: createProject(), projectId: null };
}

export function listProjects(store: KeyValueStore | null): ProjectEntry[] {
  const text = read(store, STORAGE_KEYS.projects);
  if (!text) return [];
  try {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e): e is ProjectEntry =>
        typeof e === 'object' && e !== null && typeof e.id === 'string' && typeof e.name === 'string' && typeof e.savedAt === 'string',
    );
  } catch {
    return [];
  }
}

export function newProjectId(now: Date = new Date(), random: () => number = Math.random): string {
  return `p_${now.getTime().toString(36)}_${Math.floor(random() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

export function saveProject(
  store: KeyValueStore | null,
  doc: ProjectFile,
  projectId: string | null,
  now: Date = new Date(),
  makeId: () => string = () => newProjectId(now),
): StorageResult<{ projectId: string; doc: ProjectFile }> {
  const id = projectId ?? makeId();
  const saved: ProjectFile = { ...doc, savedAt: now.toISOString() };
  const written = write(store, STORAGE_KEYS.project(id), JSON.stringify(saved));
  if (!written.ok) return written;
  const entries = listProjects(store).filter((e) => e.id !== id);
  entries.push({ id, name: saved.name, savedAt: saved.savedAt });
  entries.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  const indexed = write(store, STORAGE_KEYS.projects, JSON.stringify(entries));
  if (!indexed.ok) return indexed;
  return { ok: true, value: { projectId: id, doc: saved } };
}

export function openProject(store: KeyValueStore | null, id: string): StorageResult<ProjectFile> {
  const text = read(store, STORAGE_KEYS.project(id));
  if (text === null) return { ok: false, reason: store ? '找不到這個專案' : STORAGE_UNAVAILABLE };
  const parsed = parseProjectFile(text);
  return parsed.ok ? { ok: true, value: parsed.doc } : { ok: false, reason: `專案已損毀：${parsed.reason}` };
}

export function deleteProject(store: KeyValueStore | null, id: string): StorageResult<void> {
  if (!store) return { ok: false, reason: STORAGE_UNAVAILABLE };
  try {
    store.removeItem(STORAGE_KEYS.project(id));
  } catch {
    return { ok: false, reason: STORAGE_UNAVAILABLE };
  }
  return write(store, STORAGE_KEYS.projects, JSON.stringify(listProjects(store).filter((e) => e.id !== id)));
}
