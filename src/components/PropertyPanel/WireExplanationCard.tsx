import { explainWire } from '../../editor/explain';
import type { Circuit } from '../../types/circuit';
import { AskAi } from './AskAi';
import { LinkedText } from './LinkedText';

/** 規格 5.1：點一條線時「這條線在做什麼」（不用網路）＋問 AI。 */
export function WireExplanationCard({ circuit, wireId }: { circuit: Circuit; wireId: string }) {
  const e = explainWire(circuit, wireId);
  if (!e) return null;
  return (
    <div data-testid="wire-explanation" className="mt-2 space-y-2 rounded border border-sky-800/70 bg-slate-950/70 px-3 py-2 text-xs leading-6 text-slate-200">
      <div className="font-semibold text-sky-300">這條線在做什麼</div>
      <p>
        <LinkedText circuit={circuit} text={e.summary} />
      </p>
      {e.chain.length > 1 && (
        <div>
          <div>這段連線共 {e.chain.length} 條線：</div>
          <ol className="list-decimal space-y-1 pl-5">
            {e.chain.map((x) => (
              <li key={x.wireId} className={x.wireId === wireId ? 'text-slate-50' : 'text-slate-300'}>
                <LinkedText circuit={circuit} text={x.text} />
                {x.wireId === wireId && <span className="ml-1 text-sky-300">（本條）</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {e.chain.length === 1 && (
        <p>
          <LinkedText circuit={circuit} text={e.chain[0].text} />
        </p>
      )}
      {e.why && (
        <p>
          <span className="font-semibold text-sky-300">為什麼不一條線直接接：</span>
          <LinkedText circuit={circuit} text={e.why} />
        </p>
      )}
      <AskAi circuit={circuit} topic={{ kind: 'wire', wireId }} />
    </div>
  );
}
