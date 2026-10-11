import { create } from 'zustand';
import { classifyAiError, type AiError } from '../ai/errors';
import { createGeminiSession, type AiSession } from '../ai/gemini';
import { AI_SYSTEM_INSTRUCTION, firstMessage, sameTopic, type AiTopic } from '../editor/explain/brief';
import type { Circuit } from '../types/circuit';
import { clearApiKey, loadApiKey, saveApiKey, type StoredKey } from './apiKey';
import { useStore } from './store';

export type { AiTopic };

export interface AiMessage {
  role: 'user' | 'model';
  text: string;
  /** 只用在 Gemini 的回答：回答中、完整、按停止中斷、出錯中斷。 */
  state?: 'streaming' | 'done' | 'stopped' | 'failed';
}

/** 一段對話屬於「某個電路（參照比較）+ 某個主題（錯誤或導線）」；畫面只在兩者都和目前一樣時顯示。 */
export interface AiChat {
  circuit: Circuit;
  topic: AiTopic;
  messages: AiMessage[];
  sending: boolean;
  error: AiError | null;
}

interface AiState {
  key: StoredKey | null;
  chat: AiChat | null;
  setKey(key: string, remember: boolean): void;
  clearKey(): void;
  ask(circuit: Circuit, topic: AiTopic, question: string): Promise<void>;
  stop(): void;
}

/** 目前這段對話在 Gemini 那邊的連線；換對話、換金鑰就丟掉。 */
let link: { circuit: Circuit; topic: AiTopic; session: Promise<AiSession> } | null = null;
let controller: AbortController | null = null;

const sameChat = (chat: AiChat | null, circuit: Circuit, topic: AiTopic): chat is AiChat => !!chat && chat.circuit === circuit && sameTopic(chat.topic, topic);

function forget(): void {
  controller?.abort();
  link = null;
}

/** 規格 1、2、4：問 AI 的金鑰與對話（獨立於主 store，不進 Undo）。 */
export const useAi = create<AiState>((set, get) => ({
  key: loadApiKey(),
  chat: null,

  setKey(key, remember) {
    const value = key.trim();
    if (!value) return;
    saveApiKey(value, remember);
    // 換了金鑰：舊的連線綁著舊金鑰，對話重新開始。只改「記住」就保留對話。
    if (get().key?.key !== value) {
      forget();
      set({ chat: null });
    }
    set({ key: { key: value, remembered: remember } });
  },

  clearKey() {
    clearApiKey();
    forget();
    set({ key: null, chat: null });
  },

  stop() {
    controller?.abort();
  },

  async ask(circuit, topic, question) {
    const text = question.trim();
    const key = get().key?.key;
    const previous = get().chat;
    const same = sameChat(previous, circuit, topic);
    if (!text || !key || (same && previous.sending)) return;

    controller?.abort(); // 另一段對話還在回答：停掉它
    const fresh = !link || link.circuit !== circuit || !sameTopic(link.topic, topic);
    if (fresh) {
      const session = createGeminiSession(key, AI_SYSTEM_INSTRUCTION);
      const mine = { circuit, topic, session };
      link = mine;
      // 套件載入失敗（例如離線）：下一次發問重新建立。
      session.catch(() => {
        if (link === mine) link = null;
      });
    }
    const pending = link!;
    const ctrl = new AbortController();
    controller = ctrl;

    const messages: AiMessage[] = [...(same ? previous.messages : []), { role: 'user', text }, { role: 'model', text: '', state: 'streaming' }];
    set({ chat: { circuit, topic, messages, sending: true, error: null } });

    /** 更新最後一則回答；對話已經被換掉時不動。 */
    const finish = (patch: Partial<AiMessage>, extra: Partial<AiChat> = {}) => {
      const chat = get().chat;
      if (!sameChat(chat, circuit, topic)) return;
      const list = chat.messages.slice();
      list[list.length - 1] = { ...list[list.length - 1], ...patch };
      set({ chat: { ...chat, messages: list, ...extra } });
    };
    const stale = () => useStore.getState().circuit !== circuit;
    // 回答中改了電路：停止這一輪（畫面上這個錯誤可能已經不存在）。
    const unsubscribe = useStore.subscribe((s) => {
      if (s.circuit !== circuit) ctrl.abort();
    });

    let answer = '';
    try {
      const session = await pending.session;
      for await (const delta of session.send(fresh ? firstMessage(circuit, topic, text) : text, ctrl.signal)) {
        if (ctrl.signal.aborted) break;
        answer += delta;
        finish({ text: answer });
      }
      if (ctrl.signal.aborted) throw new DOMException('aborted', 'AbortError');
      if (answer) finish({ state: 'done' }, { sending: false });
      else finish({ state: 'failed' }, { sending: false, error: { kind: 'empty' } });
    } catch (error) {
      if (stale()) {
        if (sameChat(get().chat, circuit, topic)) set({ chat: null });
        if (link === pending) link = null;
      } else if (ctrl.signal.aborted) finish({ state: 'stopped' }, { sending: false });
      else finish({ state: 'failed' }, { sending: false, error: classifyAiError(error) });
    } finally {
      unsubscribe();
      if (controller === ctrl) controller = null;
    }
  },
}));
