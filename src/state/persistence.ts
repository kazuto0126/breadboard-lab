import type { ChecklistState } from '../editor/checklist';
import { parseCircuitData, toCircuitFile, type CircuitFile, type ParseResult } from '../editor/fileFormat';
import type { Circuit } from '../types/circuit';

const AUTOSAVE_KEY = 'breadboard-lab:autosave';
const PROJECTS_KEY = 'breadboard-lab:projects';

export interface ProjectSummary {
  name: string;
  savedAt: string;
  components: number;
  wires: number;
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__bbl_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function storageAvailable(): boolean {
  return storage() !== null;
}

/** 自動儲存的電路（重新整理後還原）。沒有或格式錯誤時回傳 null。 */
export function loadAutosave(): { circuit: Circuit; name: string | null; checklist: ChecklistState } | null {
  const text = storage()?.getItem(AUTOSAVE_KEY);
  if (!text) return null;
  try {
    const result = parseCircuitData(JSON.parse(text));
    return result.ok ? { circuit: result.circuit, name: result.name, checklist: result.checklist ?? {} } : null;
  } catch {
    return null;
  }
}

export function writeAutosave(circuit: Circuit, name: string | null, checklist?: ChecklistState): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(AUTOSAVE_KEY, JSON.stringify(toCircuitFile(circuit, name ?? '', undefined, checklist)));
    return true;
  } catch {
    return false;
  }
}

function readProjects(): Record<string, CircuitFile> {
  const text = storage()?.getItem(PROJECTS_KEY);
  if (!text) return {};
  try {
    const raw = JSON.parse(text) as unknown;
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, CircuitFile>) : {};
  } catch {
    return {};
  }
}

function writeProjects(projects: Record<string, CircuitFile>): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return true;
  } catch {
    return false;
  }
}

export function listProjects(): ProjectSummary[] {
  return Object.entries(readProjects())
    .map(([name, file]) => ({
      name,
      savedAt: typeof file?.savedAt === 'string' ? file.savedAt : '',
      components: Array.isArray(file?.circuit?.components) ? file.circuit.components.length : 0,
      wires: Array.isArray(file?.circuit?.wires) ? file.circuit.wires.length : 0,
    }))
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
}

export function saveProject(name: string, circuit: Circuit, checklist?: ChecklistState): boolean {
  const projects = readProjects();
  projects[name] = toCircuitFile(circuit, name, undefined, checklist);
  return writeProjects(projects);
}

export function loadProject(name: string): ParseResult {
  const file = readProjects()[name];
  if (!file) return { ok: false, error: `找不到專案「${name}」` };
  const result = parseCircuitData(file);
  return result.ok ? { ...result, name } : result;
}

export function deleteProject(name: string): boolean {
  const projects = readProjects();
  if (!(name in projects)) return false;
  delete projects[name];
  return writeProjects(projects);
}
