/**
 * 規格 1：Gemini API 金鑰只存在使用者自己的瀏覽器。預設存在這個分頁（sessionStorage，關掉分頁就忘記），
 * 勾選「在這台電腦記住」才存進 localStorage；兩邊不會同時有。
 */
export const API_KEY_STORAGE = 'breadboard-lab:gemini-api-key';

export interface StoredKey {
  key: string;
  remembered: boolean;
}

type Area = 'sessionStorage' | 'localStorage';

/** 瀏覽器不允許（或 Node 測試沒有 window）時回傳 null。 */
function area(name: Area): Storage | null {
  try {
    return window[name] ?? null;
  } catch {
    return null;
  }
}

export function loadApiKey(): StoredKey | null {
  try {
    const session = area('sessionStorage')?.getItem(API_KEY_STORAGE);
    if (session) return { key: session, remembered: false };
    const local = area('localStorage')?.getItem(API_KEY_STORAGE);
    if (local) return { key: local, remembered: true };
  } catch {
    // 讀不到就當作沒有金鑰。
  }
  return null;
}

/** 存進瀏覽器；不行時回傳 false（金鑰只留在記憶體，重新整理就沒了）。 */
export function saveApiKey(key: string, remember: boolean): boolean {
  try {
    area(remember ? 'sessionStorage' : 'localStorage')?.removeItem(API_KEY_STORAGE);
    const target = area(remember ? 'localStorage' : 'sessionStorage');
    if (!target) return false;
    target.setItem(API_KEY_STORAGE, key);
    return true;
  } catch {
    return false;
  }
}

export function clearApiKey(): void {
  for (const name of ['sessionStorage', 'localStorage'] as const) {
    try {
      area(name)?.removeItem(API_KEY_STORAGE);
    } catch {
      // 忽略：本來就存不進去。
    }
  }
}
