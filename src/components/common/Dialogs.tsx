import { useEffect, useRef, useState, type ReactNode } from 'react';
import { listProjects, storageAvailable, type ProjectSummary } from '../../state/persistence';
import { useStore } from '../../state/store';

function Modal({ title, children, onClose, width = 'w-[460px]' }: { title: string; children: ReactNode; onClose: () => void; width?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${width} max-w-[calc(100vw-2rem)] rounded-lg border border-slate-600 bg-slate-900 p-5 text-slate-200 shadow-2xl`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-50">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="關閉">
            ✕
          </button>
        </div>
        {children}
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

const SHORTCUTS: Array<[string, string]> = [
  ['拖曳元件庫項目到麵包板', '放置元件（自動吸附到合法孔位）'],
  ['從空孔拖曳到另一個空孔', '建立導線（只有水平 / 垂直）'],
  ['拖曳元件', '移動（也可以拖到另一塊麵包板）'],
  ['拖曳麵包板沒有孔的地方', '移動麵包板 / 整個群組；靠近另一塊板的邊會自動吸附並對齊'],
  ['Alt / Shift + 拖曳麵包板', '只移動這一塊（拆開群組）'],
  ['R', '旋轉選取的元件 / 放置中的元件'],
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
        AI 標準佈線會保留你的接線所定義的電氣連接（哪些導通群組要連在一起），重新決定每一條導線的位置：只走水平 / 垂直、不重疊、
        不穿過元件，並盡量避免交叉、縮短總長、減少轉彎。元件位置不會被移動。
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        多塊麵包板：貼在一起且對齊的板子自動成為同一個 Board Group，自動佈線把整組當成一張連續的格子。
        貼在一起<b className="text-slate-300">不代表導通</b>——不同板子的孔只有用導線連接才會形成同一個 Net。
      </p>
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
