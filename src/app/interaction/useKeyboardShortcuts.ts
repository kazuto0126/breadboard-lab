import { useEffect } from 'react';
import { deleteComponent, deleteWire, rotateComponent } from '../commands/commands';
import type { Selection } from '../model/editorTypes';
import { useEditor } from '../store/editorStore';
import { shortcutFor, type ShortcutAction } from './shortcuts';

export function isTextTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true;
}

export function selectedComponentId(selection: Selection | null): string | null {
  if (!selection) return null;
  if (selection.kind === 'component') return selection.id;
  if (selection.kind === 'pin') return selection.componentId;
  return null;
}

export function runShortcut(action: ShortcutAction, onSave: () => void): void {
  const s = useEditor.getState();
  switch (action) {
    case 'undo':
      s.undo();
      return;
    case 'redo':
      s.redo();
      return;
    case 'save':
      onSave();
      return;
    case 'rotate': {
      const id = selectedComponentId(s.selection);
      if (id) s.run((doc) => rotateComponent(doc, id));
      return;
    }
    case 'delete': {
      const selection = s.selection;
      const id = selectedComponentId(selection);
      if (id) s.run((doc) => deleteComponent(doc, id));
      else if (selection?.kind === 'wire') s.run((doc) => deleteWire(doc, selection.id));
      return;
    }
    case 'escape':
      if (s.ghost || s.wirePreview || s.armedPart) {
        s.setGhost(null);
        s.setWirePreview(null);
        s.setArmedPart(null);
        return;
      }
      if (s.mode === 'compare') {
        s.setMode('edit');
        return;
      }
      s.select(null);
  }
}

export function useKeyboardShortcuts(onSave: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e, isTextTarget(e.target));
      if (!action) return;
      e.preventDefault();
      runShortcut(action, onSave);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave]);
}
