import { useEffect } from 'react';
import { startAutosave, useStore } from '../state/store';
import { BreadboardCanvas } from './Breadboard/BreadboardCanvas';
import { CompareView } from './Compare/CompareView';
import { Dialogs, Toasts } from './common/Dialogs';
import { ComponentLibrary } from './ComponentLibrary/ComponentLibrary';
import { PropertyPanel } from './PropertyPanel/PropertyPanel';
import { StatusBar } from './StatusBar/StatusBar';
import { Toolbar } from './Toolbar/Toolbar';
import { useShortcuts } from './useShortcuts';

/** 需求文件第二十一章的版面：上方選單、左元件庫、中間麵包板、右資訊面板、下方狀態列。 */
export function App() {
  useShortcuts();
  useEffect(() => startAutosave(), []);
  const view = useStore((s) => s.view);
  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <ComponentLibrary />
        <main className="relative min-w-0 flex-1">
          {/* 畫布一直保留（不卸載），切到 Compare 時只是蓋在上面，縮放與平移狀態不會遺失。 */}
          <BreadboardCanvas />
          {view === 'compare' && (
            <div className="absolute inset-0 z-40">
              <CompareView />
            </div>
          )}
        </main>
        <PropertyPanel />
      </div>
      <StatusBar />
      <Dialogs />
      <Toasts />
    </div>
  );
}
