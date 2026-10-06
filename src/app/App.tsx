import { useEffect, useState } from 'react';
import { BoardCanvas } from './board/BoardCanvas';
import { CompareView } from './board/CompareView';
import { saveCurrent } from './fileActions';
import { useKeyboardShortcuts } from './interaction/useKeyboardShortcuts';
import { CheckBanner, NoticeToast } from './panels/Banners';
import { DialogHost } from './panels/dialogs';
import { InfoPanel } from './panels/InfoPanel';
import { MenuBar } from './panels/MenuBar';
import { PartsPanel } from './panels/PartsPanel';
import { RoutingProblems, StatsCard } from './panels/RoutingStatus';
import { StatusBar } from './panels/StatusBar';
import { getBrowserStore, restoreAutosave, writeAutosave } from './persistence/browserStorage';
import { useRoutingAnimation } from './routing/useRoutingAnimation';
import { resetEditor, useEditor } from './store/editorStore';

export const ANALYSIS_DELAY_MS = 150;
export const AUTOSAVE_DELAY_MS = 1000;

/** 第一次繪製前呼叫：有可用的自動存檔就載入，沒有或損毀就用空白電路。沒存過的修改在重新整理後仍算「未儲存」。 */
export function bootstrapEditor(): void {
  const { doc, projectId, dirty } = restoreAutosave(getBrowserStore());
  resetEditor(doc, projectId);
  if (dirty) useEditor.setState({ dirty: true });
}

/** 規格第 4.5 節：電路改變後 150 ms 重算即時檢查與狀態列，文件改變後 1 秒自動存檔。回傳自動存檔的錯誤訊息。 */
function useBackgroundWork(): string | null {
  const doc = useEditor((s) => s.doc);
  const projectId = useEditor((s) => s.projectId);
  const dirty = useEditor((s) => s.dirty);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => useEditor.getState().refreshAnalysis(), ANALYSIS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc.circuit]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = writeAutosave(getBrowserStore(), doc, projectId, dirty);
      setAutosaveError(result.ok ? null : result.reason);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, projectId, dirty]);
  return autosaveError;
}

const saveShortcut = () => void saveCurrent();

const DRAWER = 'absolute inset-y-0 z-20 flex-col bg-white shadow-xl lg:static lg:z-auto lg:flex lg:shadow-none';

/** 規格第 12 節：≥ 1024 px 三欄；較窄時元件庫與資訊面板改成抽屜。 */
export function App() {
  const autosaveError = useBackgroundWork();
  useKeyboardShortcuts(saveShortcut);
  useRoutingAnimation();
  const mode = useEditor((s) => s.mode);
  const picking = useEditor((s) => s.armedPart !== null || s.ghost !== null);
  const [partsOpen, setPartsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  useEffect(() => {
    if (picking) setPartsOpen(false);
  }, [picking]);

  return (
    <div className="flex h-full flex-col">
      <MenuBar
        partsOpen={partsOpen}
        infoOpen={infoOpen}
        onToggleParts={() => setPartsOpen((v) => !v)}
        onToggleInfo={() => setInfoOpen((v) => !v)}
        onShowInfo={() => setInfoOpen(true)}
      />
      <div className="relative flex min-h-0 flex-1">
        <aside aria-label="元件庫" data-open={partsOpen} className={`${partsOpen ? 'flex' : 'hidden'} ${DRAWER} left-0 w-60 border-r border-gray-300`}>
          <PartsPanel />
        </aside>
        <main className="relative min-w-0 flex-1">
          {mode === 'compare' ? <CompareView /> : <BoardCanvas registerAsMain />}
          <StatsCard />
          <RoutingProblems />
          <CheckBanner />
        </main>
        <aside aria-label="資訊" data-open={infoOpen} className={`${infoOpen ? 'flex' : 'hidden'} ${DRAWER} right-0 w-75 border-l border-gray-300`}>
          <InfoPanel />
        </aside>
      </div>
      <StatusBar autosaveError={autosaveError} />
      <DialogHost />
      <NoticeToast />
    </div>
  );
}
