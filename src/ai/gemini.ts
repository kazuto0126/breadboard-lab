/** 規格 1、3.3：問 AI 用的模型。 */
export const GEMINI_MODEL = 'gemini-3.5-flash';

export interface AiSession {
  /** 送出一則訊息，逐段產生回答文字。中途停止或出錯的那一輪不會留在對話紀錄裡（套件的 Chat 只記完整的回答）。 */
  send(message: string, signal: AbortSignal): AsyncGenerator<string, void, undefined>;
}

/**
 * 建立一段對話。@google/genai 在第一次發問時才載入（約 450 KB），網站開啟速度不受影響。
 * fetchImpl 只給測試注入假的回應。
 */
export async function createGeminiSession(apiKey: string, systemInstruction: string, fetchImpl?: typeof fetch): Promise<AiSession> {
  const { GoogleGenAI, ThinkingLevel } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey, ...(fetchImpl ? { httpOptions: { fetch: fetchImpl } } : {}) });
  const config = { systemInstruction, thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } };
  const chat = ai.chats.create({ model: GEMINI_MODEL, config });
  return {
    async *send(message, signal) {
      // 每一則都要帶完整的 config：傳了 config 就不會再用建立時的那一份。
      const stream = await chat.sendMessageStream({ message, config: { ...config, abortSignal: signal } });
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield text;
      }
    },
  };
}
