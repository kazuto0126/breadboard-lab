import type { RightTab } from '../model/editorTypes';
import { useEditor } from '../store/editorStore';
import { CheckResults } from './CheckResults';
import { Checklist } from './Checklist';
import { SelectionInfo } from './SelectionInfo';

const TABS: Array<{ id: RightTab; label: string }> = [
  { id: 'selection', label: '選取' },
  { id: 'check', label: '檢查結果' },
  { id: 'checklist', label: '接線清單' },
];

export function InfoPanel() {
  const tab = useEditor((s) => s.rightTab);
  const setTab = useEditor((s) => s.setRightTab);
  return (
    <div className="flex h-full flex-col bg-white">
      <div role="tablist" className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-11 flex-1 px-2 text-sm lg:min-h-9 ${tab === t.id ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-gray-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'selection' && <SelectionInfo />}
        {tab === 'check' && <CheckResults />}
        {tab === 'checklist' && <Checklist />}
      </div>
    </div>
  );
}
