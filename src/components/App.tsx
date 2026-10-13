import { useEffect } from 'react';
import { startAutosave, useStore } from '../state/store';
import { BreadboardCanvas } from './Breadboard/BreadboardCanvas';
import { CompareView } from './Compare/CompareView';
import { Dialogs, Toasts } from './common/Dialogs';
import { ComponentLibrary } from './ComponentLibrary/ComponentLibrary';
import { LogicCanvas } from './Logic/LogicCanvas';
import { LogicLibrary } from './Logic/LogicLibrary';
import { LogicPanel } from './Logic/LogicPanel';
import { PropertyPanel } from './PropertyPanel/PropertyPanel';
import { StatusBar } from './StatusBar/StatusBar';
import { Toolbar } from './Toolbar/Toolbar';
import { useShortcuts } from './useShortcuts';

/** 需求文件第二十一章的版面：上方選單、左元件庫、中間麵包板、右資訊面板、下方狀態列。 */
export function App() {
  useShortcuts();
  useEffect(() => startAutosave(), []);
  const view = useStore((s) => s.view);
  const drawer = useStore((s) => s.drawer);
  const workspace = useStore((s) => s.workspace);
  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      <Toolbar />
      <div className="relative flex min-h-0 flex-1">
        {workspace === 'logic' ? (
          <>
            {/* 規格（2026-10-11 logic-diagram）第 5 節：邏輯圖時換掉元件庫、畫布、右側面板。 */}
            <LogicLibrary />
            <main className="relative isolate min-w-0 flex-1">
              <LogicCanvas />
            </main>
            <LogicPanel />
          </>
        ) : (
          <>
            <ComponentLibrary />
            {/* isolate：畫布上的浮層（比較畫面、右鍵選單、佈線中的遮罩）都留在 main 裡，不會蓋過窄螢幕的抽屜。 */}
            <main className="relative isolate min-w-0 flex-1">
              {/* 畫布一直保留（不卸載），切到 Compare 時只是蓋在上面，縮放與平移狀態不會遺失。 */}
              <BreadboardCanvas />
              {view === 'compare' && (
                <div className="absolute inset-0 z-40">
                  <CompareView />
                </div>
              )}
            </main>
            <PropertyPanel />
          </>
        )}
        {/* 窄螢幕：抽屜打開時，點旁邊的暗色區域關閉。 */}
        {drawer && (
          <div className="absolute inset-0 z-20 bg-black/40 lg:hidden" data-testid="drawer-backdrop" onClick={() => useStore.getState().toggleDrawer(null)} />
        )}
      </div>
      <StatusBar />
      <Dialogs />
      <Toasts />
    </div>
  );
}
