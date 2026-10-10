/** 規格第 4 節：問 AI 出錯時的分類。按「停止」造成的中斷不是錯誤，由呼叫的一方自己判斷。 */
export type AiErrorKind = 'bad-key' | 'rate-limit' | 'busy' | 'network' | 'empty' | 'unknown';

export interface AiError {
  kind: AiErrorKind;
  status?: number;
}

/** 依 @google/genai 的 ApiError.status 與錯誤種類分類。 */
export function classifyAiError(error: unknown): AiError {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number') {
    const message = error instanceof Error ? error.message : '';
    if (status === 401 || status === 403 || (status === 400 && /api[ _-]?key/i.test(message))) return { kind: 'bad-key', status };
    if (status === 429) return { kind: 'rate-limit', status };
    if (status >= 500 && status < 600) return { kind: 'busy', status };
    return { kind: 'unknown', status };
  }
  // fetch 連不上（離線、DNS、被擋）時瀏覽器丟出 TypeError。
  if (error instanceof TypeError) return { kind: 'network' };
  return { kind: 'unknown' };
}

const TEXT: Record<AiErrorKind, string> = {
  'bad-key': '金鑰不正確或沒有權限，請重新設定。',
  'rate-limit': '已達使用上限（免費額度每分鐘有次數限制），請稍等一下再問。',
  busy: 'Gemini 暫時忙碌，請稍後再試。',
  network: '連不上 Gemini，請確認網路。',
  empty: 'Gemini 沒有回答這個問題，請換個問法。',
  unknown: 'Gemini 回傳錯誤，請稍後再試。',
};

export function aiErrorText(error: AiError): string {
  return error.kind === 'unknown' && error.status !== undefined ? `${TEXT.unknown}（狀態碼 ${error.status}）` : TEXT[error.kind];
}
