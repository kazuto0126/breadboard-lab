import { useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { deleteProject, getBrowserStore, listProjects, type ProjectEntry } from '../persistence/browserStorage';

type DialogRequest = { id: number } & (
  | { kind: 'name'; title: string; initial: string; resolve: (value: string | null) => void }
  | { kind: 'confirm'; message: string; resolve: (ok: boolean) => void }
  | { kind: 'open'; resolve: (id: string | null) => void }
);

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

const useDialogs = create<{ request: DialogRequest | null }>()(() => ({ request: null }));
let counter = 0;

function cancel(request: DialogRequest): void {
  if (request.kind === 'confirm') request.resolve(false);
  else request.resolve(null);
}

function show(request: DistributiveOmit<DialogRequest, 'id'>): void {
  const previous = useDialogs.getState().request;
  if (previous) cancel(previous);
  counter += 1;
  useDialogs.setState({ request: { ...request, id: counter } as DialogRequest });
}

function close(): void {
  useDialogs.setState({ request: null });
}

export const STORAGE_HINT = '學校電腦可能會清除瀏覽器資料，重要的電路請匯出 JSON';

export function askName(title: string, initial: string): Promise<string | null> {
  return new Promise((resolve) => show({ kind: 'name', title, initial, resolve }));
}

export function askConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => show({ kind: 'confirm', message, resolve }));
}

export function askOpenProject(): Promise<string | null> {
  return new Promise((resolve) => show({ kind: 'open', resolve }));
}

const BUTTON = 'min-h-11 rounded-md px-4 text-sm lg:min-h-9';

function Modal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function NameDialog({ request }: { request: Extract<DialogRequest, { kind: 'name' }> }) {
  const [value, setValue] = useState(request.initial);
  const trimmed = value.trim();
  return (
    <Modal title={request.title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!trimmed) return;
          close();
          request.resolve(trimmed);
        }}
      >
        <input aria-label="名稱" autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="min-h-11 w-full rounded border border-gray-300 p-2 lg:min-h-0" />
        <p className="mt-2 text-xs text-gray-500">{STORAGE_HINT}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className={`${BUTTON} border border-gray-300`}
            onClick={() => {
              close();
              request.resolve(null);
            }}
          >
            取消
          </button>
          <button type="submit" disabled={!trimmed} className={`${BUTTON} bg-blue-600 text-white disabled:opacity-40`}>
            確定
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDialog({ request }: { request: Extract<DialogRequest, { kind: 'confirm' }> }) {
  const answer = (ok: boolean) => () => {
    close();
    request.resolve(ok);
  };
  return (
    <Modal title="請確認">
      <p className="text-sm">{request.message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={`${BUTTON} border border-gray-300`} onClick={answer(false)}>
          取消
        </button>
        <button type="button" className={`${BUTTON} bg-blue-600 text-white`} onClick={answer(true)}>
          確定
        </button>
      </div>
    </Modal>
  );
}

function OpenDialog({ request }: { request: Extract<DialogRequest, { kind: 'open' }> }) {
  const [entries, setEntries] = useState<ProjectEntry[]>(() => listProjects(getBrowserStore()));
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const remove = (entry: ProjectEntry) => {
    deleteProject(getBrowserStore(), entry.id);
    setPendingDelete(null);
    setEntries(listProjects(getBrowserStore()));
  };
  const finish = (id: string | null) => {
    close();
    request.resolve(id);
  };
  return (
    <Modal title="開啟專案">
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">還沒有儲存過的專案</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 rounded border border-gray-200 p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{entry.name}</div>
                <div className="text-xs text-gray-500">{new Date(entry.savedAt).toLocaleString('zh-TW')}</div>
              </div>
              {pendingDelete === entry.id ? (
                <>
                  <button type="button" aria-label={`確定刪除「${entry.name}」`} className={`${BUTTON} bg-red-600 text-white`} onClick={() => remove(entry)}>
                    刪除
                  </button>
                  <button type="button" className={`${BUTTON} border border-gray-300`} onClick={() => setPendingDelete(null)}>
                    不刪除
                  </button>
                </>
              ) : (
                <>
                  <button type="button" aria-label={`開啟「${entry.name}」`} className={`${BUTTON} bg-blue-600 text-white`} onClick={() => finish(entry.id)}>
                    開啟
                  </button>
                  <button type="button" aria-label={`刪除「${entry.name}」`} className={`${BUTTON} border border-gray-300`} onClick={() => setPendingDelete(entry.id)}>
                    刪除
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-gray-500">{STORAGE_HINT}</p>
      <div className="mt-4 flex justify-end">
        <button type="button" className={`${BUTTON} border border-gray-300`} onClick={() => finish(null)}>
          關閉
        </button>
      </div>
    </Modal>
  );
}

export function DialogHost() {
  const request = useDialogs((s) => s.request);
  if (!request) return null;
  switch (request.kind) {
    case 'name':
      return <NameDialog key={request.id} request={request} />;
    case 'confirm':
      return <ConfirmDialog key={request.id} request={request} />;
    case 'open':
      return <OpenDialog key={request.id} request={request} />;
  }
}
