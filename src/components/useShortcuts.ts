import { useEffect } from 'react';
import { useStore } from '../state/store';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** 全域快捷鍵（需求文件第七、二十三、二十六章）。焦點在輸入框時不處理。 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.key === 'Escape') {
        if (s.dialog) s.closeDialog();
        else if (s.routing) s.cancelRouting();
        else if (s.placing) s.cancelPlacing();
        else if (s.animation) s.finishAnimation();
        else if (s.resultVisible) s.dismissResult();
        else if (s.view === 'compare') s.closeCompare();
        else s.select(null);
        return;
      }
      if (s.dialog) return;

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        if (e.shiftKey) s.openDialog('save-as');
        else s.saveProject();
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        s.openDialog('open');
        return;
      }
      if (mod || e.altKey) return;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          s.deleteSelection();
          break;
        case 'r':
        case 'R':
          s.rotateSelection();
          break;
        case 'f':
        case 'F':
          s.fitToScreen();
          break;
        case '0':
          s.resetView();
          break;
        case '+':
        case '=':
          s.zoomBy(1.25);
          break;
        case '-':
        case '_':
          s.zoomBy(0.8);
          break;
        case '?':
          s.openDialog('help');
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
