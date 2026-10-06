import { useEffect, useState } from 'react';
import { useEditor } from '../store/editorStore';

/** 電路檢查通過時顯示 3 秒的綠色橫幅。 */
export function CheckBanner() {
  const passedAt = useEditor((s) => s.checkPassedAt);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (passedAt === null) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [passedAt]);
  if (!visible) return null;
  return (
    <div role="status" className="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
      ✓ Circuit Valid：電路檢查通過
    </div>
  );
}

/** 通知訊息，3 秒後自動消失。 */
export function NoticeToast() {
  const notice = useEditor((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useEditor.getState().dismissNotice(), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  const tone = notice.tone === 'error' ? 'bg-red-600' : notice.tone === 'success' ? 'bg-green-600' : 'bg-gray-800';
  return (
    <div role="status" className={`fixed bottom-12 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-md px-4 py-2 text-sm text-white shadow-lg ${tone}`}>
      {notice.text}
    </div>
  );
}
