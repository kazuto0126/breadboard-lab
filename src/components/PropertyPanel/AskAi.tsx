import { useState, type KeyboardEvent } from 'react';
import { aiErrorText } from '../../ai/errors';
import { sameTopic } from '../../editor/explain/brief';
import { useAi, type AiMessage, type AiTopic } from '../../state/ai';
import { useStore } from '../../state/store';
import type { Circuit } from '../../types/circuit';
import { LinkedText } from './LinkedText';

const SUGGESTED: Record<AiTopic['kind'], string[]> = {
  issue: ['為什麼會這樣？', '有沒有別的改法？', '實體麵包板上要注意什麼？'],
  wire: ['為什麼這樣走？', '可以換一種接法嗎？', '實際插線時要注意什麼？'],
};
const small = 'rounded px-2 py-1 text-xs disabled:opacity-50';

function Message({ m, circuit }: { m: AiMessage; circuit: Circuit }) {
  const model = m.role === 'model';
  // 一個字都沒收到就出錯：只顯示下面的錯誤原因。
  if (model && !m.text && m.state === 'failed') return null;
  return (
    <li data-ai-message={m.role} className={model ? 'text-slate-100' : 'text-slate-300'}>
      <span className={model ? 'text-sky-300' : 'text-slate-400'}>{model ? 'Gemini：' : '你：'}</span>
      <span className="whitespace-pre-wrap">{m.text ? model ? <LinkedText circuit={circuit} text={m.text} /> : m.text : m.state === 'streaming' ? '…' : ''}</span>
      {m.state === 'stopped' && <span className="text-amber-300">（已停止）</span>}
    </li>
  );
}

/** 規格 2.1：錯誤解說卡下面的「問 AI」。 */
/** 規格 5.1：錯誤卡與導線卡共用；topic 決定建議問題與送出的內容。 */
export function AskAi({ circuit, topic }: { circuit: Circuit; topic: AiTopic }) {
  const hasKey = useAi((s) => s.key !== null);
  const chat = useAi((s) => (s.chat && s.chat.circuit === circuit && sameTopic(s.chat.topic, topic) ? s.chat : null));
  const [draft, setDraft] = useState('');
  const sending = chat?.sending ?? false;
  const openKey = () => useStore.getState().openDialog('ai-key');
  const ask = (question: string) => void useAi.getState().ask(circuit, topic, question);
  const submit = () => {
    if (sending || !draft.trim()) return;
    ask(draft);
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 用輸入法選字時按 Enter 不能送出。
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  };

  return (
    <div data-testid="ask-ai" className="border-t border-slate-700 pt-2">
      <div className="font-semibold text-sky-300">問 AI（Gemini）</div>
      {!hasKey ? (
        <div className="mt-1 space-y-1">
          <p className="text-slate-400">問 AI 需要網路和你自己的 Gemini API 金鑰。</p>
          <button type="button" onClick={openKey} className={`${small} bg-sky-700 text-white hover:bg-sky-600`}>
            設定 Gemini API 金鑰
          </button>
        </div>
      ) : (
        <div className="mt-1 space-y-1.5">
          {chat && (
            <ul className="space-y-1.5">
              {chat.messages.map((m, i) => (
                <Message key={i} m={m} circuit={circuit} />
              ))}
            </ul>
          )}
          {sending && (
            <div className="flex items-center gap-2 text-slate-400">
              Gemini 回答中…
              <button type="button" onClick={() => useAi.getState().stop()} className={`${small} bg-slate-700 hover:bg-slate-600`}>
                停止
              </button>
            </div>
          )}
          {chat?.error && (
            <p data-testid="ai-error" className="text-red-300">
              {aiErrorText(chat.error)}
              {chat.error.kind === 'bad-key' && (
                <button type="button" onClick={openKey} className={`${small} ml-2 bg-slate-700 text-slate-100 hover:bg-slate-600`}>
                  重新設定金鑰
                </button>
              )}
            </p>
          )}
          {!chat && (
            <div className="flex flex-wrap gap-1">
              {SUGGESTED[topic.kind].map((q) => (
                <button key={q} type="button" onClick={() => ask(q)} className={`${small} bg-slate-800 text-slate-100 hover:bg-slate-700`}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1">
            <textarea
              aria-label="問 AI 的問題"
              rows={2}
              maxLength={500}
              value={draft}
              placeholder={chat ? '接著追問…（Enter 送出，Shift+Enter 換行）' : '自己打字問…（Enter 送出，Shift+Enter 換行）'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              className="min-w-0 flex-1 resize-none rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
            />
            <button type="button" onClick={submit} disabled={sending || !draft.trim()} className={`${small} bg-sky-700 text-white hover:bg-sky-600`}>
              送出
            </button>
          </div>
          {chat && <p className="text-[11px] text-slate-500">AI 的回答可能有錯，請以實際電路和老師的說明為準。</p>}
        </div>
      )}
    </div>
  );
}
