import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateCircuit } from '../../src/core/circuit/validate';
import { API_KEY_STORAGE, clearApiKey, loadApiKey, saveApiKey } from '../../src/state/apiKey';
import { useAi } from '../../src/state/ai';
import { initialState, useStore } from '../../src/state/store';
import { circuit, comp, wire } from '../fixtures/build';

const h = vi.hoisted(() => ({
  sent: [] as string[],
  keys: [] as string[],
  script: null as null | ((message: string, signal: AbortSignal) => AsyncGenerator<string>),
}));

vi.mock('../../src/ai/gemini', () => ({
  GEMINI_MODEL: 'gemini-3.5-flash',
  createGeminiSession: async (apiKey: string) => {
    h.keys.push(apiKey);
    return {
      send(message: string, signal: AbortSignal) {
        h.sent.push(message);
        return h.script!(message, signal);
      },
    };
  },
}));

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

/** 回答 parts 之後一直等，直到按停止（或電路改變）才中斷。 */
function untilStopped(...parts: string[]) {
  return async function* (_m: string, signal: AbortSignal) {
    yield* parts;
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  };
}

const icCircuit = () => circuit([comp('U1', '74LS00', 'F10'), comp('V1', 'vcc', 'T+3'), comp('G1', 'gnd', 'B-3')], [wire('g1', 'J16', 'B-16'), wire('y', 'I12', 'I13')]); // 1Y 接到 2A：第 1 組閘有用到，1A、1B 懸空會警告
const ai = () => useAi.getState();
const last = () => ai().chat!.messages.at(-1)!;

let c = icCircuit();
let issues: ReturnType<typeof validateCircuit> = [];

beforeEach(() => {
  vi.stubGlobal('window', { sessionStorage: memoryStorage(), localStorage: memoryStorage() });
  h.sent.length = 0;
  h.keys.length = 0;
  h.script = async function* () {
    yield '答';
    yield '案';
  };
  c = icCircuit();
  useStore.setState({ ...initialState(), circuit: c });
  issues = validateCircuit(c);
  useAi.setState({ key: { key: 'k1', remembered: false }, chat: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API key storage', () => {
  it('keeps the key in the tab unless asked to remember it, and clears both', () => {
    expect(loadApiKey()).toBeNull();
    expect(saveApiKey('abc', false)).toBe(true);
    expect(window.sessionStorage.getItem(API_KEY_STORAGE)).toBe('abc');
    expect(window.localStorage.getItem(API_KEY_STORAGE)).toBeNull();
    expect(loadApiKey()).toEqual({ key: 'abc', remembered: false });

    saveApiKey('abc', true);
    expect(window.sessionStorage.getItem(API_KEY_STORAGE)).toBeNull();
    expect(window.localStorage.getItem(API_KEY_STORAGE)).toBe('abc');
    expect(loadApiKey()).toEqual({ key: 'abc', remembered: true });

    clearApiKey();
    expect(loadApiKey()).toBeNull();
  });

  it('keeps working in memory when storage is blocked', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('blocked');
      },
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    });
    expect(saveApiKey('abc', false)).toBe(false);
    expect(loadApiKey()).toBeNull();
    expect(() => clearApiKey()).not.toThrow();
    ai().setKey('  abc  ', true);
    expect(ai().key).toEqual({ key: 'abc', remembered: true });
  });
});

describe('asking Gemini about an issue', () => {
  it('sends the circuit brief with the first question only and streams the answer', async () => {
    await ai().ask(c, { kind: 'issue', issue: issues[0] }, '  為什麼會這樣？ ');
    expect(h.sent[0]).toMatch(/^【電路摘要】/);
    expect(h.sent[0].endsWith('【學生的問題】\n為什麼會這樣？')).toBe(true);
    expect(ai().chat).toMatchObject({ circuit: c, topic: { kind: 'issue', issue: issues[0] }, sending: false, error: null });
    expect(ai().chat!.messages).toEqual([
      { role: 'user', text: '為什麼會這樣？' },
      { role: 'model', text: '答案', state: 'done' },
    ]);

    await ai().ask(c, { kind: 'issue', issue: issues[0] }, '還有呢？');
    expect(h.sent[1]).toBe('還有呢？');
    expect(ai().chat!.messages).toHaveLength(4);
    expect(h.keys).toEqual(['k1']);
  });

  it('does nothing without a key or with an empty question', async () => {
    await ai().ask(c, { kind: 'issue', issue: issues[0] }, '   ');
    useAi.setState({ key: null });
    await ai().ask(c, { kind: 'issue', issue: issues[0] }, '為什麼？');
    expect(h.sent).toEqual([]);
    expect(ai().chat).toBeNull();
  });

  it('keeps the partial answer and records the error kind when Gemini fails', async () => {
    h.script = async function* () {
      yield '一半';
      throw Object.assign(new Error('quota'), { status: 429 });
    };
    await ai().ask(c, { kind: 'issue', issue: issues[0] }, '問');
    expect(last()).toEqual({ role: 'model', text: '一半', state: 'failed' });
    expect(ai().chat).toMatchObject({ sending: false, error: { kind: 'rate-limit', status: 429 } });

    h.script = async function* () {
      yield '好了';
    };
    await ai().ask(c, { kind: 'issue', issue: issues[0] }, '再問一次');
    expect(ai().chat!.error).toBeNull();
    expect(last()).toEqual({ role: 'model', text: '好了', state: 'done' });
  });

  it('reports an empty answer', async () => {
    h.script = async function* () {};
    await ai().ask(c, { kind: 'issue', issue: issues[0] }, '問');
    expect(last()).toEqual({ role: 'model', text: '', state: 'failed' });
    expect(ai().chat!.error).toEqual({ kind: 'empty' });
  });

  it('marks the answer as stopped when the student presses stop', async () => {
    h.script = untilStopped('前半');
    const pending = ai().ask(c, { kind: 'issue', issue: issues[0] }, '問');
    await vi.waitFor(() => expect(last().text).toBe('前半'));
    expect(ai().chat!.sending).toBe(true);
    ai().stop();
    await pending;
    expect(last()).toEqual({ role: 'model', text: '前半', state: 'stopped' });
    expect(ai().chat).toMatchObject({ sending: false, error: null });
  });

  it('drops the conversation when the circuit changes while Gemini is answering', async () => {
    h.script = untilStopped('前半');
    const pending = ai().ask(c, { kind: 'issue', issue: issues[0] }, '問');
    await vi.waitFor(() => expect(last().text).toBe('前半'));
    useStore.setState({ circuit: circuit([]) });
    await pending;
    expect(ai().chat).toBeNull();
  });

  it('starts a new conversation for another issue, and again after the key changes', async () => {
    expect(issues.length).toBeGreaterThan(1);
    h.script = untilStopped('舊的');
    const first = ai().ask(c, { kind: 'issue', issue: issues[0] }, '問一');
    await vi.waitFor(() => expect(last().text).toBe('舊的'));

    h.script = async function* () {
      yield '新的';
    };
    await ai().ask(c, { kind: 'issue', issue: issues[1] }, '問二');
    await first;
    expect(h.sent[1]).toMatch(/^【電路摘要】/);
    expect(ai().chat).toMatchObject({ topic: { kind: 'issue', issue: issues[1] }, sending: false });
    expect(ai().chat!.messages.map((m) => m.text)).toEqual(['問二', '新的']);

    ai().setKey('k1', true);
    expect(ai().chat).not.toBeNull();
    ai().setKey('k2', false);
    expect(ai().chat).toBeNull();
    await ai().ask(c, { kind: 'issue', issue: issues[1] }, '問三');
    expect(h.sent[2]).toMatch(/^【電路摘要】/);
    expect(h.keys).toEqual(['k1', 'k1', 'k2']);

    ai().clearKey();
    expect(ai()).toMatchObject({ key: null, chat: null });
  });
});

describe('asking Gemini about a wire', () => {
  it('sends the wire brief first, then only the follow-ups, and switches topics cleanly', async () => {
    await ai().ask(c, { kind: 'wire', wireId: 'g1' }, '為什麼這樣走？');
    expect(h.sent[0]).toContain('【學生正在看的導線】\ng1（學生手動接的線）');
    expect(ai().chat).toMatchObject({ topic: { kind: 'wire', wireId: 'g1' }, sending: false });

    await ai().ask(c, { kind: 'wire', wireId: 'g1' }, '還有呢？');
    expect(h.sent[1]).toBe('還有呢？');
    expect(ai().chat!.messages).toHaveLength(4);

    await ai().ask(c, { kind: 'issue', issue: issues[0] }, '這個錯誤呢？');
    expect(h.sent[2]).toMatch(/^【電路摘要】/);
    expect(h.sent[2]).toContain('【學生正在看的錯誤】');
    expect(ai().chat!.topic).toEqual({ kind: 'issue', issue: issues[0] });
    expect(ai().chat!.messages).toHaveLength(2);
    expect(h.keys).toEqual(['k1', 'k1']);
  });
});
