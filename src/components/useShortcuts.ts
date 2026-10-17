import { useEffect } from 'react';
import { useLogic } from '../state/logic';
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

      // 邏輯圖：Esc、復原、刪除、Fit 作用在邏輯圖（規格（2026-10-11 logic-diagram）第 1 節）。
      if (s.workspace === 'logic' && !s.dialog) {
        const l = useLogic.getState();
        if (e.key === 'Escape') {
          if (l.placing) l.startPlacing(null);
          else l.select(null);
          return;
        }
        if (mod && key === 'c') {
          l.copy();
          return;
        }
        if (mod && key === 'v') {
          e.preventDefault();
          if (!l.paste()) s.toast('warning', '沒有可以貼上的元件，或附近沒有空位');
          return;
        }
        if (mod && (key === 'z' || key === 'y')) {
          e.preventDefault();
          if (key === 'y' || e.shiftKey) l.redo();
          else l.undo();
          return;
        }
        if (!mod && !e.altKey && (e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault();
          l.deleteSelection();
          return;
        }
        if (!mod && !e.altKey && key === 'f') {
          l.fit();
          return;
        }
        // 子專案 26：R 轉向（和麵包板一樣）。
        if (!mod && !e.altKey && key === 'r') {
          const reason = l.rotateSelection();
          if (reason) s.toast('warning', reason);
          return;
        }
        if (!mod) return;
      }

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
        case 'n':
        case 'N':
          e.preventDefault();
          s.addNoteAtCenter();
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
