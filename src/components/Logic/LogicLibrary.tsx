import { BLOCK_CHIPS, BLOCK_NAMES, isSequentialChip } from '../../logic/blocks';
import { canUseInside, deleteBlock } from '../../logic/customBlocks';
import { LOGIC_EXAMPLES } from '../../logic/examples';
import { blockPins } from '../../logic/flatten';
import type { NodeKind } from '../../logic/types';
import { useLogic } from '../../state/logic';
import { useStore } from '../../state/store';
import { PartIcon } from './GateSymbol';
import { LogicNoteCard } from './LogicNoteCard';

const PARTS: Array<[NodeKind, string, string]> = [
  ['AND', 'AND', '及閘，2–4 輸入'],
  ['OR', 'OR', '或閘，2–4 輸入'],
  ['NOT', 'NOT', '反閘'],
  ['NAND', 'NAND', '反及閘，2–4 輸入'],
  ['NOR', 'NOR', '反或閘，2–4 輸入'],
  ['XOR', 'XOR', '互斥或閘'],
  ['INPUT', '輸入端', '開關，點一下切換 0 / 1'],
  ['OUTPUT', '輸出端', '燈號，顯示結果'],
  ['HIGH', '5V', '常數 1，接到要固定是 1 的腳'],
  ['LOW', 'GND', '常數 0，接到要固定是 0 的腳（例如 /G）'],
  ['DISPLAY', '7 段顯示器', 'A–D 四條線當成 BCD 數字，顯示 0–9'],
  ['CLOCK', '時脈', '點「脈衝」送出 0 → 1 → 0，接到正反器、計數器的 CLK'],
  ['MERGE', '合起來', '把好幾條線合成一條匯流排（第 0 位在最上面）'],
  ['SPLIT', '拆開', '把匯流排拆回一條一條的線'],
];

/** 子專案 46：IC 方塊分成組合邏輯與時序（正反器、計數器）兩區。 */
const BLOCK_GROUPS: Array<[string, typeof BLOCK_CHIPS]> = [
  ['IC 方塊', BLOCK_CHIPS.filter((c) => !isSequentialChip(c))],
  ['正反器與計數器', BLOCK_CHIPS.filter((c) => isSequentialChip(c))],
];

/** 子專案 65（規格 2026-11-14 custom-blocks 第 4 節）：這個檔案的自訂方塊；點一下放置，沒用到的可以刪除。 */
function CustomBlockList() {
  const diagram = useLogic((s) => s.diagram);
  const inside = useLogic((s) => s.outer[s.outer.length - 1]?.blockId);
  const placing = useLogic((s) => s.placing);
  const placingBlock = useLogic((s) => s.placingBlock);
  const blocks = (diagram.blocks ?? []).filter((b) => inside === undefined || canUseInside(diagram.blocks ?? [], inside, b.id));
  return (
    <div data-testid="custom-blocks">
      <div className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">自訂方塊（這個檔案）</div>
      {blocks.length === 0 && <p className="mt-1 px-1 text-[11px] leading-5 text-slate-400">框選幾個閘，在右邊按「包成方塊」，就會出現在這裡，可以再放好幾個。</p>}
      <div className="mt-1 grid grid-cols-1 gap-1.5">
        {blocks.map((b) => {
          const p = blockPins(b);
          return (
            <div key={b.id} className={`flex items-center gap-1 rounded-md border ${placing === 'CUSTOM' && placingBlock === b.id ? 'border-sky-500 bg-sky-900/40' : 'border-emerald-800 bg-slate-800/60'}`}>
              <button
                type="button"
                data-logic-part={`CUSTOM:${b.name}`}
                title={`${b.name}：${p.inputs.map((n) => n.name).join('、')} → ${p.outputs.map((n) => n.name).join('、')}（點一下再點畫布放下；畫布上點兩下方塊可以進去改）`}
                onPointerDown={() => {
                  useLogic.getState().startPlacing('CUSTOM', undefined, b.id);
                  useStore.getState().toggleDrawer(null);
                }}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
              >
                <span className="flex h-6 w-10 shrink-0 items-center justify-center rounded bg-emerald-50">
                  <PartIcon kind="BLOCK" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium leading-4 text-slate-100">{b.name}</span>
                  <span className="block truncate text-[10px] leading-4 text-slate-400">
                    {p.inputs.map((n) => n.name).join(' ')} → {p.outputs.map((n) => n.name).join(' ')}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`刪除方塊 ${b.name}`}
                title="刪除這個方塊（要先刪掉用到它的地方）"
                className="shrink-0 px-2 text-slate-400 hover:text-red-300"
                onClick={() => {
                  const r = deleteBlock(useLogic.getState().diagram, b.id);
                  if (!r.ok) useStore.getState().toast('error', r.reason);
                  else useLogic.getState().apply(r, `刪除方塊 ${b.name}`);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 規格第 5 節：邏輯圖時的元件庫（邏輯閘、輸入端、輸出端）。 */
export function LogicLibrary() {
  const placing = useLogic((s) => s.placing);
  const placingChip = useLogic((s) => s.placingChip);
  // 子專案 65：在方塊裡編輯時不能放時脈、顯示器。
  const inBlock = useLogic((s) => s.outer.length > 0);
  const open = useStore((s) => s.drawer === 'library');
  return (
    <aside
      aria-label="邏輯閘"
      className={`${open ? 'flex' : 'hidden'} absolute inset-y-0 left-0 z-30 w-72 max-w-[85vw] shrink-0 flex-col border-r border-slate-800 bg-slate-900 shadow-2xl lg:static lg:z-auto lg:flex lg:h-full lg:w-64 lg:shadow-none`}
    >
      <div className="border-b border-slate-800 p-3 pb-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">邏輯閘 Logic</div>
      </div>
      <div className="bbl-scroll min-h-0 flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-1.5">
          {PARTS.filter(([kind]) => !inBlock || (kind !== 'CLOCK' && kind !== 'DISPLAY')).map(([kind, label, hint]) => (
            <button
              key={kind}
              type="button"
              data-logic-part={kind}
              title={`${hint}（點一下再點畫布放下，也可以直接拖到畫布）`}
              onPointerDown={() => {
                useLogic.getState().startPlacing(kind);
                useStore.getState().toggleDrawer(null);
              }}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left ${placing === kind ? 'border-sky-500 bg-sky-900/40' : 'border-slate-700 bg-slate-800/60 hover:bg-slate-800'}`}
            >
              <span className="flex h-6 w-10 shrink-0 items-center justify-center rounded bg-slate-100">
                <PartIcon kind={kind} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-medium leading-4 text-slate-100">{label}</span>
                <span className="block truncate text-[10px] leading-4 text-slate-400">{hint}</span>
              </span>
            </button>
          ))}
        </div>
        {BLOCK_GROUPS.map(([title, chips]) => (
        <div key={title}>
        <div className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
        <div className="mt-1 grid grid-cols-1 gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              data-logic-part={`BLOCK:${chip}`}
              title={`${chip} ${BLOCK_NAMES[chip]}：照實際的腳名當輸入、輸出（點一下再點畫布放下）`}
              onPointerDown={() => {
                useLogic.getState().startPlacing('BLOCK', chip);
                useStore.getState().toggleDrawer(null);
              }}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left ${placing === 'BLOCK' && placingChip === chip ? 'border-sky-500 bg-sky-900/40' : 'border-slate-700 bg-slate-800/60 hover:bg-slate-800'}`}
            >
              <span className="flex h-6 w-10 shrink-0 items-center justify-center rounded bg-slate-100">
                <PartIcon kind="BLOCK" />
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-medium leading-4 text-slate-100">{chip}</span>
                <span className="block truncate text-[10px] leading-4 text-slate-400">{BLOCK_NAMES[chip]}</span>
              </span>
            </button>
          ))}
        </div>
        </div>
        ))}
        <CustomBlockList />
        <LogicNoteCard />
        <p className="mt-3 px-1 text-[11px] leading-5 text-slate-400">
          點一下元件再點畫布放下（Esc 取消）。從一個腳拖到另一個腳連線；點輸入端的開關切換 0 / 1。
        </p>
        <div className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">範例</div>
        {LOGIC_EXAMPLES.map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => useStore.getState().loadExampleLogic(ex.id)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-left text-[12px] text-slate-100 hover:bg-slate-800"
            title={ex.description}
          >
            {ex.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
