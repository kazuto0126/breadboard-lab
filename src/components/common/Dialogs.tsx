import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GEMINI_MODEL } from '../../ai/gemini';
import { switchText, toBreadboard, type ConvertOptions } from '../../logic/toBreadboard';
import { useAi } from '../../state/ai';
import { useLogic } from '../../state/logic';
import { listProjects, storageAvailable, type ProjectSummary } from '../../state/persistence';
import { useStore } from '../../state/store';

function Modal({ title, children, onClose, width = 'w-[460px]' }: { title: string; children: ReactNode; onClose: () => void; width?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${width} flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-slate-600 bg-slate-900 p-5 text-slate-200 shadow-2xl`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 className="text-base font-semibold text-slate-50">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="關閉">
            ✕
          </button>
        </div>
        {/* 畫面太矮時（平板橫放）標題與關閉鈕留在上面，內容可以捲動。 */}
        <div className="bbl-scroll min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const button = 'rounded px-3 py-1.5 text-sm';

function OpenDialog() {
  const store = useStore.getState();
  const [projects, setProjects] = useState<ProjectSummary[]>(() => listProjects());
  return (
    <Modal title="開啟電路 Load" onClose={() => store.closeDialog()}>
      {!storageAvailable() && <p className="mb-2 text-sm text-amber-300">瀏覽器不允許使用本機儲存空間，無法讀取專案庫。</p>}
      {projects.length === 0 ? (
        <p className="text-sm text-slate-400">還沒有儲存的電路。用「檔案 → 儲存」把目前的電路存在這個瀏覽器裡，或用「匯入 JSON」開啟檔案。</p>
      ) : (
        <ul className="bbl-scroll max-h-[50vh] space-y-1 overflow-y-auto">
          {projects.map((p) => (
            <li key={p.name} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-800">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => store.openProject(p.name)}>
                <div className="truncate text-sm text-slate-100">{p.name}</div>
                <div className="text-xs text-slate-400">
                  {p.savedAt ? new Date(p.savedAt).toLocaleString() : ''} · {p.components} 個元件 · {p.wires} 條導線
                </div>
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 text-xs text-red-300 hover:bg-red-950"
                onClick={() => {
                  if (window.confirm(`確定要刪除「${p.name}」嗎？`)) {
                    store.deleteProject(p.name);
                    setProjects(listProjects());
                  }
                }}
              >
                刪除
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function SaveAsDialog() {
  const store = useStore.getState();
  const [name, setName] = useState(() => store.projectName ?? '我的電路');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.select(), []);
  const exists = listProjects().some((p) => p.name === name.trim());
  const submit = () => name.trim() && store.saveProject(name.trim());
  return (
    <Modal title="另存新檔 Save As" onClose={() => store.closeDialog()}>
      <label className="block text-sm text-slate-300">
        電路名稱
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-slate-100 focus:border-sky-500 focus:outline-none"
          maxLength={80}
        />
      </label>
      {exists && <p className="mt-1 text-xs text-amber-300">已有同名的電路，儲存會覆蓋它。</p>}
      <p className="mt-2 text-xs text-slate-400">電路會存在這個瀏覽器的本機儲存空間。要帶到別台電腦，請用「匯出 JSON」。</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={`${button} bg-slate-700 hover:bg-slate-600`} onClick={() => store.closeDialog()}>
          取消
        </button>
        <button type="button" className={`${button} bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50`} disabled={!name.trim()} onClick={submit}>
          儲存
        </button>
      </div>
    </Modal>
  );
}

function ConfirmNewDialog() {
  const store = useStore.getState();
  return (
    <Modal title="建立新電路？" onClose={() => store.closeDialog()}>
      <p className="text-sm text-slate-300">目前的電路有尚未儲存的修改。建立新電路後，Undo 無法回到目前的電路。</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={`${button} bg-slate-700 hover:bg-slate-600`} onClick={() => store.closeDialog()}>
          取消
        </button>
        <button
          type="button"
          className={`${button} bg-slate-700 hover:bg-slate-600`}
          onClick={() => {
            store.closeDialog();
            store.openDialog('save-as');
          }}
        >
          先儲存
        </button>
        <button type="button" className={`${button} bg-red-700 text-white hover:bg-red-600`} onClick={() => store.newCircuit()}>
          不儲存，建立新電路
        </button>
      </div>
    </Modal>
  );
}

function AiKeyDialog() {
  const store = useStore.getState();
  const stored = useAi((s) => s.key);
  const [value, setValue] = useState('');
  const [remember, setRemember] = useState(() => stored?.remembered ?? false);
  const save = () => {
    if (value.trim()) useAi.getState().setKey(value, remember);
    else if (stored && stored.remembered !== remember) useAi.getState().setKey(stored.key, remember);
    store.closeDialog();
  };
  const status = !stored ? '目前沒有金鑰。' : stored.remembered ? '已設定，記在這台電腦。' : '已設定，只保留到關掉這個分頁。';
  return (
    <Modal title="Gemini API 金鑰" onClose={() => store.closeDialog()} width="w-[520px]">
      <div className="space-y-2 text-sm text-slate-300">
        <p>「問 AI」會把目前的電路內容、錯誤說明和你的問題送到 Google Gemini（模型 {GEMINI_MODEL}）。</p>
        <p>
          到{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-sky-300 underline hover:text-sky-200">
            Google AI Studio
          </a>{' '}
          免費申請金鑰。
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">
          <li>免費額度：不用付費，但內容可能被 Google 用來改進產品，請不要在問題裡寫個人資料；每分鐘有次數上限。</li>
          <li>付費金鑰：費用由金鑰擁有人支付，一次追問通常不到新台幣 1 元。</li>
          <li>金鑰只存在這個瀏覽器，只會送到 Google 的 Gemini API。</li>
        </ul>
      </div>
      <label className="mt-3 block text-sm text-slate-300">
        API 金鑰
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={stored ? '已設定（輸入新的金鑰會取代）' : '貼上你的 Gemini API 金鑰'}
          className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        在這台電腦記住（關掉分頁後仍保留）
      </label>
      <p data-testid="ai-key-status" className="mt-1 text-xs text-slate-400">
        {status}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        {stored && (
          <button type="button" className={`${button} mr-auto bg-slate-700 text-red-200 hover:bg-slate-600`} onClick={() => useAi.getState().clearKey()}>
            清除金鑰
          </button>
        )}
        <button type="button" className={`${button} bg-slate-700 hover:bg-slate-600`} onClick={() => store.closeDialog()}>
          取消
        </button>
        <button type="button" className={`${button} bg-sky-600 text-white hover:bg-sky-500`} onClick={save}>
          儲存
        </button>
      </div>
    </Modal>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['拖曳元件庫項目到麵包板', '放置元件（自動吸附到合法孔位）'],
  ['從孔拖曳到另一個孔', '拉一條直線導線（可以斜；不能經過元件或和別條線重疊）'],
  ['選取導線後拖曳兩端的白點', '把那一端改接到別的孔'],
  ['拖曳元件', '移動（也可以拖到另一塊麵包板）'],
  ['拖曳麵包板沒有孔的地方', '移動麵包板 / 整個群組；靠近另一塊板的邊會自動吸附並對齊'],
  ['Alt / Shift + 拖曳麵包板', '只移動這一塊（拆開群組）'],
  ['R', '旋轉選取的元件 / 放置中的元件'],
  ['N', '新增便條（雙擊便條改字、拖曳移動）'],
  ['Delete / Backspace', '刪除選取的元件、導線或麵包板'],
  ['Esc', '取消放置、接線、移動或選取'],
  ['Ctrl+Z / Ctrl+Shift+Z（Ctrl+Y）', 'Undo / Redo'],
  ['Ctrl+S / Ctrl+Shift+S / Ctrl+O', '儲存 / 另存新檔 / 開啟'],
  ['滑鼠滾輪', '以游標為中心縮放'],
  ['中鍵拖曳、Space + 拖曳、拖曳空白處', '平移畫面'],
  ['F / 0 / + / -', 'Fit to Screen / Reset View / 放大 / 縮小'],
  ['右鍵元件、導線或麵包板', 'Rotate 90°、刪除、改顏色、移出群組'],
];

function HelpDialog() {
  const store = useStore.getState();
  return (
    <Modal title="操作說明與快捷鍵" onClose={() => store.closeDialog()} width="w-[620px]">
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map(([key, action]) => (
            <tr key={key} className="border-b border-slate-800">
              <td className="py-1.5 pr-4 text-slate-100">{key}</td>
              <td className="py-1.5 text-slate-300">{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-5 text-slate-400">
        AI 標準佈線會保留你的接線所定義的電氣連接（哪些導通群組要連在一起），重新決定每一條導線：每條線都是水平或垂直的直線跳線，
        要轉彎就停在一排相通的孔、從同一排的另一個孔接下一條線；一個孔只插一條線、不重疊、不經過元件，並盡量避免交叉、少用線。
        這個模式不會移動元件。
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        AI 佈線（可移動 IC）：先幫每顆 IC 找一個線比較少、比較短的位置（可以搬到貼在一起的任何一塊板、可以轉 180 度），再用同樣的規則佈線；
        指撥開關、按鈕、電阻、LED、電源與接地都不動，每支腳接到的腳也不變。找不到更好的位置時 IC 留在原位。
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        多塊麵包板：貼在一起且對齊的板子自動成為同一個 Board Group，自動佈線把整組當成一張連續的格子。
        貼在一起<b className="text-slate-300">不代表導通</b>——不同板子的孔只有用導線連接才會形成同一個 Net。
      </p>
    </Modal>
  );
}

/** 規格（2026-10-13 logic-to-breadboard）第 2 節：轉成麵包板的設定。 */
function ToBreadboardDialog() {
  const store = useStore.getState();
  const diagram = useLogic((l) => l.diagram);
  const hasParts = useStore((s) => s.circuit.components.length > 0 || s.circuit.wires.length > 0);
  const [switchTo, setSwitchTo] = useState<ConvertOptions['switchTo']>('vcc');
  const [board, setBoard] = useState<ConvertOptions['board']>('auto');
  const [gates, setGates] = useState<NonNullable<ConvertOptions['gates']>>('direct');
  const [pulls, setPulls] = useState(false);
  const [inputs, setInputs] = useState<NonNullable<ConvertOptions['inputs']>>('switch');
  const [display, setDisplay] = useState<NonNullable<ConvertOptions['display']>>('ca');
  const hasDisplay = diagram.nodes.some((n) => n.kind === 'DISPLAY');
  const preview = toBreadboard(diagram, { switchTo, board, gates, pulls, inputs, display });
  const radio = (checked: boolean) => `flex cursor-pointer items-start gap-2 rounded border px-3 py-2 ${checked ? 'border-sky-500 bg-sky-950/40' : 'border-slate-700 hover:bg-slate-800'}`;
  return (
    <Modal title="轉成麵包板" onClose={() => store.closeDialog()} width="w-[520px]">
      <div className="space-y-3 overflow-y-auto text-sm">
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-semibold text-slate-100">閘的種類</legend>
          {(
            [
              ['direct', '照種類對應', 'AND → 74LS08、OR → 74LS32、NOT → 74LS04…'],
              ['nand', '只用 NAND（74LS00）', '所有閘都用 NAND 組出來，實驗室只要準備一種 IC。'],
              ['nor', '只用 NOR（74LS02）', '所有閘都用 NOR 組出來，實驗室只要準備一種 IC。'],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className={radio(gates === id)}>
              <input type="radio" name="gates" className="mt-1" checked={gates === id} onChange={() => setGates(id)} />
              <span>
                <span className="block text-slate-100">{label}</span>
                <span className="block text-xs text-slate-400">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {hasDisplay && (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 font-semibold text-slate-100">7 段顯示器</legend>
            {(
              [
                ['ca', '共陽極 + 74LS47', '共同腳接 +5 V，74LS47 的輸出是低電位有效。'],
                ['cc', '共陰極 + 74LS48', '共同腳接 GND，74LS48 的輸出是高電位有效。'],
              ] as const
            ).map(([id, label, hint]) => (
              <label key={id} className={radio(display === id)}>
                <input type="radio" name="display" className="mt-1" checked={display === id} onChange={() => setDisplay(id)} />
                <span>
                  <span className="block text-slate-100">{label}</span>
                  <span className="block text-xs text-slate-400">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-semibold text-slate-100">輸入</legend>
          {(
            [
              ['switch', '指撥開關', '每個輸入一個開關，撥好就固定（看真值表一列一列比較方便）。'],
              ['button', '按鈕', '每個輸入一顆按鈕，按住才是那個值（適合計數、時脈等需要「按一下」的輸入）。'],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className={radio(inputs === id)}>
              <input type="radio" name="inputs" className="mt-1" checked={inputs === id} onChange={() => setInputs(id)} />
              <span>
                <span className="block text-slate-100">{label}</span>
                <span className="block text-xs text-slate-400">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-semibold text-slate-100">{inputs === 'button' ? '按鈕的接法' : '指撥開關的接法'}</legend>
          {(
            [
              ['vcc', '開關接 +5 V（撥 ON = 1）', pulls ? '每個輸入加一顆 330 Ω 下拉電阻接到 GND。' : '撥 OFF = 0（模擬時當成理想開關）。'],
              ['gnd', '開關接 GND（撥 ON = 0）', pulls ? '每個輸入加一顆 1 kΩ 上拉電阻接到 +5 V。' : '撥 OFF = 1（模擬時當成理想開關）。'],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className={radio(switchTo === id)}>
              <input type="radio" name="switch-to" className="mt-1" checked={switchTo === id} onChange={() => setSwitchTo(id)} />
              <span>
                <span className="block text-slate-100">{label}</span>
                <span className="block text-xs text-slate-400">{hint}</span>
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer items-start gap-2 px-1 pt-1">
            <input type="checkbox" className="mt-1" checked={pulls} onChange={(e) => setPulls(e.target.checked)} />
            <span>
              <span className="block text-slate-100">加上 / 下拉電阻（實際接線建議勾）</span>
              <span className="block text-xs text-slate-400">不勾時板面比較乾淨，但實際的 TTL 輸入在開關 OFF 時會懸空；檢查會提出警告。</span>
            </span>
          </label>
        </fieldset>
        <fieldset>
          <legend className="mb-1 font-semibold text-slate-100">麵包板</legend>
          <div className="flex gap-2">
            {(
              [
                ['auto', '自動'],
                ['MB102', 'MB-102'],
                ['EIC1106', 'EIC-1106'],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className={radio(board === id)}>
                <input type="radio" name="board" checked={board === id} onChange={() => setBoard(id)} />
                <span className="text-slate-100">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div data-testid="convert-preview" className="rounded border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-300">
          {preview.ok ? (
            <>
              會用到：
              {Object.entries(preview.bom.ics)
                .map(([id, n]) => `${id} × ${n}`)
                .join('、')}
              、{switchText(preview.bom)}
              {/* 子專案 38：加上電阻、輸入超過 4 個時，轉換可能改用兩個 4 位元開關（預覽是預設的擺法）。 */}
              {preview.bom.switch === 'dipsw-8' && pulls && '（可能改用 4 位元 × 2，電阻才能都直接插進電源軌）'}
              、電阻 × {preview.bom.resistors}、LED × {preview.bom.leds}
              {preview.bom.displays > 0 && `、7 段顯示器 × ${preview.bom.displays}（${display === 'cc' ? '共陰極' : '共陽極'}）`}；放在 {preview.bom.layout === 'MB102' ? 'MB-102' : 'EIC-1106'}。
            </>
          ) : (
            <span className="text-red-300">{preview.reason}</span>
          )}
        </div>
        {hasParts && <p className="text-xs text-amber-300">會取代目前的麵包板（可以按復原找回來）。</p>}
        <p className="text-xs text-slate-400">轉換時會試好幾種擺法，每一種用 AI 佈線（可移動 IC）試過、挑線最少的一種（大電路要等十幾秒），並用模擬逐列比對真值表。</p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={`${button} bg-slate-700 hover:bg-slate-600`} onClick={() => store.closeDialog()}>
          取消
        </button>
        <button type="button" disabled={!preview.ok} className={`${button} bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50`} onClick={() => store.convertLogic({ switchTo, board, gates, pulls, inputs, display })}>
          轉換
        </button>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  switch (dialog) {
    case 'open':
      return <OpenDialog />;
    case 'save-as':
      return <SaveAsDialog />;
    case 'confirm-new':
      return <ConfirmNewDialog />;
    case 'help':
      return <HelpDialog />;
    case 'ai-key':
      return <AiKeyDialog />;
    case 'to-breadboard':
      return <ToBreadboardDialog />;
    default:
      return null;
  }
}

const TOAST_TONE = {
  info: 'border-slate-600 bg-slate-800 text-slate-100',
  success: 'border-emerald-600 bg-emerald-950 text-emerald-100',
  warning: 'border-amber-600 bg-amber-950 text-amber-100',
  error: 'border-red-600 bg-red-950 text-red-100',
};

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto max-w-[560px] rounded-md border px-4 py-2 text-sm shadow-xl ${TOAST_TONE[t.kind]}`} data-toast={t.kind}>
          <button type="button" className="text-left" onClick={() => useStore.getState().dismissToast(t.id)}>
            {t.message}
          </button>
        </div>
      ))}
    </div>
  );
}
