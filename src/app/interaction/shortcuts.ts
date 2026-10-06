export type ShortcutAction = 'rotate' | 'delete' | 'undo' | 'redo' | 'save' | 'escape';

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** 規格第 6.5 節。輸入框中只有 Ctrl+S（⌘S）有效。 */
export function shortcutFor(input: KeyInput, inTextField: boolean): ShortcutAction | null {
  const mod = input.ctrlKey || input.metaKey;
  const key = input.key.toLowerCase();
  if (mod && key === 's') return 'save';
  if (inTextField) return null;
  if (mod && key === 'z') return input.shiftKey ? 'redo' : 'undo';
  if (mod && key === 'y') return 'redo';
  if (mod || input.altKey) return null;
  if (key === 'r') return 'rotate';
  if (key === 'delete' || key === 'backspace') return 'delete';
  if (key === 'escape') return 'escape';
  return null;
}
