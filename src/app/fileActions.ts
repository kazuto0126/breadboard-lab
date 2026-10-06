import { getBoardElement } from './interaction/boardRegistry';
import { createProject } from './model/projectFile';
import { askConfirm, askName, askOpenProject } from './panels/dialogs';
import { getBrowserStore, openProject, saveProject } from './persistence/browserStorage';
import { downloadBlob, downloadText, pickTextFile } from './persistence/download';
import { boardSvgMarkup, svgMarkupToPng } from './persistence/exportImage';
import { parseProjectFile, projectFileName, serializeProject } from './persistence/projectIO';
import { useEditor } from './store/editorStore';

const UNSAVED = '目前的電路還沒有儲存，';

export async function newCircuit(): Promise<void> {
  const s = useEditor.getState();
  if (s.mode !== 'edit') return;
  if (s.dirty && !(await askConfirm(`${UNSAVED}確定要開新電路嗎？`))) return;
  useEditor.getState().replaceDocument(createProject(), { projectId: null, undoable: true, dirty: false });
}

export async function saveAs(): Promise<void> {
  const name = await askName('另存新檔', useEditor.getState().doc.name);
  if (!name) return;
  const result = saveProject(getBrowserStore(), { ...useEditor.getState().doc, name }, null);
  const s = useEditor.getState();
  if (!result.ok) {
    s.notify(result.reason, 'error');
    return;
  }
  s.markSaved(result.value.projectId, result.value.doc);
  s.notify(`已儲存「${name}」`, 'success');
}

export async function saveCurrent(): Promise<void> {
  const s = useEditor.getState();
  if (!s.projectId) return saveAs();
  const result = saveProject(getBrowserStore(), s.doc, s.projectId);
  if (!result.ok) {
    s.notify(result.reason, 'error');
    return;
  }
  s.markSaved(result.value.projectId, result.value.doc);
  s.notify(`已儲存「${result.value.doc.name}」`, 'success');
}

export async function openFromBrowser(): Promise<void> {
  const s = useEditor.getState();
  if (s.mode !== 'edit') return;
  if (s.dirty && !(await askConfirm(`${UNSAVED}確定要開啟其他專案嗎？`))) return;
  const id = await askOpenProject();
  if (!id) return;
  const result = openProject(getBrowserStore(), id);
  if (!result.ok) {
    useEditor.getState().notify(result.reason, 'error');
    return;
  }
  useEditor.getState().replaceDocument(result.value, { projectId: id, undoable: false, dirty: false });
}

export async function importJson(): Promise<void> {
  if (useEditor.getState().mode !== 'edit') return;
  const file = await pickTextFile();
  if (!file) return;
  const parsed = parseProjectFile(file.text, file.name.replace(/(\.breadboard)?\.json$/i, ''));
  const s = useEditor.getState();
  if (!parsed.ok) {
    s.notify(`無法匯入：${parsed.reason}`, 'error');
    return;
  }
  s.replaceDocument(parsed.doc, { projectId: null, undoable: true, dirty: true });
  s.notify(`已匯入「${parsed.doc.name}」`, 'success');
}

export function exportJson(): void {
  const doc = useEditor.getState().doc;
  downloadText(projectFileName(doc, 'breadboard.json'), serializeProject(doc));
}

export function exportSvg(): void {
  const el = getBoardElement();
  const s = useEditor.getState();
  if (!el) {
    s.notify('找不到麵包板畫面', 'error');
    return;
  }
  downloadText(projectFileName(s.doc, 'svg'), boardSvgMarkup(el), 'image/svg+xml');
}

export async function exportPng(): Promise<void> {
  const el = getBoardElement();
  const s = useEditor.getState();
  if (!el) {
    s.notify('找不到麵包板畫面', 'error');
    return;
  }
  try {
    downloadBlob(projectFileName(s.doc, 'png'), await svgMarkupToPng(boardSvgMarkup(el)));
  } catch (error) {
    s.notify(error instanceof Error ? error.message : String(error), 'error');
  }
}
