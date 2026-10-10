import { beforeAll, describe, expect, it } from 'vitest';
import { aiErrorText, classifyAiError } from '../../src/ai/errors';
import { createGeminiSession, GEMINI_MODEL } from '../../src/ai/gemini';

const event = (text: string) => `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, index: 0 }] })}\r\n\r\n`;
const sse = (...texts: string[]) => new Response(texts.map(event).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });

/** 先送出 first，之後一直等到請求被停止。 */
function hanging(first: string, signal: AbortSignal | null | undefined): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(event(first)));
      signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

interface Call {
  url: string;
  headers: Headers;
  body: { contents: Array<{ role: string; parts: Array<{ text?: string }> }>; systemInstruction?: unknown; generationConfig?: { thinkingConfig?: { thinkingLevel?: string } } };
}

function fakeFetch(replies: Array<(init: RequestInit | undefined) => Response>) {
  const calls: Call[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    return reply(init);
  };
  return { fetch: fn as typeof fetch, calls };
}

async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let text = '';
  for await (const part of stream) text += part;
  return text;
}

/** 套件把串流的每一段各記成一筆 model 內容；比較時把連續同一方的內容接起來。 */
function turns(call: { contents: Array<{ role: string; parts: Array<{ text?: string }> }> }): string[] {
  const out: Array<{ role: string; text: string }> = [];
  for (const c of call.contents) {
    const text = c.parts.map((p) => p.text ?? '').join('');
    const prev = out.at(-1);
    if (prev && prev.role === c.role) prev.text += text;
    else out.push({ role: c.role, text });
  }
  return out.map((t) => `${t.role}:${t.text}`);
}
const open = () => new AbortController().signal;

describe('Gemini session', () => {
  // 第一次載入套件很慢（整套測試同時跑時會超過 5 秒），先載入好，不算在個別測試的時間裡。
  beforeAll(async () => {
    await import('@google/genai');
  }, 60_000);

  it('streams the answer and sends the model, key, system instruction and thinking level', async () => {
    const f = fakeFetch([() => sse('第一段', '第二段')]);
    const session = await createGeminiSession('test-key', '系統指示', f.fetch);
    expect(await collect(session.send('問題一', open()))).toBe('第一段第二段');
    const [call] = f.calls;
    expect(call.url).toContain(`models/${GEMINI_MODEL}:streamGenerateContent`);
    expect(call.headers.get('x-goog-api-key')).toBe('test-key');
    expect(call.body.systemInstruction).toMatchObject({ parts: [{ text: '系統指示' }] });
    expect(call.body.generationConfig?.thinkingConfig?.thinkingLevel).toBe('MEDIUM');
    expect(turns(call.body)).toEqual(['user:問題一']);
  });

  it('sends earlier turns with the next question and leaves out a stopped turn', async () => {
    const f = fakeFetch([() => sse('答一'), (init) => hanging('答二前半', init?.signal), () => sse('答三')]);
    const session = await createGeminiSession('k', 's', f.fetch);
    expect(await collect(session.send('問一', open()))).toBe('答一');

    const stop = new AbortController();
    const second = session.send('問二', stop.signal);
    expect((await second.next()).value).toBe('答二前半');
    stop.abort();
    await expect(second.next()).rejects.toMatchObject({ name: 'AbortError' });

    expect(await collect(session.send('問三', open()))).toBe('答三');
    expect(turns(f.calls[2].body)).toEqual(['user:問一', 'model:答一', 'user:問三']);
  });

  it('turns HTTP errors into the error kinds the student sees', async () => {
    const json = (status: number, message: string) =>
      new Response(JSON.stringify({ error: { code: status, message, status: 'X' } }), { status, headers: { 'content-type': 'application/json' } });
    const f = fakeFetch([() => json(400, 'API key not valid. Please pass a valid API key.'), () => json(429, 'Resource has been exhausted')]);
    const session = await createGeminiSession('bad', 's', f.fetch);
    const failure = async () => collect(session.send('問', open())).then(() => null, (e: unknown) => e);
    expect(classifyAiError(await failure())).toEqual({ kind: 'bad-key', status: 400 });
    expect(classifyAiError(await failure())).toEqual({ kind: 'rate-limit', status: 429 });
  });
});

describe('AI error kinds', () => {
  const withStatus = (status: number, message = 'x') => Object.assign(new Error(message), { status });

  it('classifies by status code and error type', () => {
    expect(classifyAiError(withStatus(403))).toEqual({ kind: 'bad-key', status: 403 });
    expect(classifyAiError(withStatus(401))).toEqual({ kind: 'bad-key', status: 401 });
    expect(classifyAiError(withStatus(400, 'Invalid JSON payload'))).toEqual({ kind: 'unknown', status: 400 });
    expect(classifyAiError(withStatus(503))).toEqual({ kind: 'busy', status: 503 });
    expect(classifyAiError(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' });
    expect(classifyAiError(new Error('boom'))).toEqual({ kind: 'unknown' });
    expect(classifyAiError(null)).toEqual({ kind: 'unknown' });
  });

  it('has a sentence for every kind and adds the status to unknown errors', () => {
    expect(aiErrorText({ kind: 'bad-key' })).toBe('金鑰不正確或沒有權限，請重新設定。');
    expect(aiErrorText({ kind: 'rate-limit' })).toContain('免費額度每分鐘有次數限制');
    expect(aiErrorText({ kind: 'busy' })).toBe('Gemini 暫時忙碌，請稍後再試。');
    expect(aiErrorText({ kind: 'network' })).toBe('連不上 Gemini，請確認網路。');
    expect(aiErrorText({ kind: 'empty' })).toBe('Gemini 沒有回答這個問題，請換個問法。');
    expect(aiErrorText({ kind: 'unknown', status: 418 })).toBe('Gemini 回傳錯誤，請稍後再試。（狀態碼 418）');
  });
});
