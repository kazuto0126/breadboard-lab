import type { CircuitError } from '../../types/circuit';
import { useEditor } from '../store/editorStore';
import { centerViewportOn } from './focus';

function focusError(error: CircuitError): void {
  const s = useEditor.getState();
  if (error.componentIds[0]) s.select({ kind: 'component', id: error.componentIds[0] });
  else if (error.wireIds[0]) s.select({ kind: 'wire', id: error.wireIds[0] });
  if (error.points[0]) centerViewportOn(error.points[0]);
}

function Group({ title, items }: { title: string; items: CircuitError[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <ul className="space-y-1">
        {items.map((e, i) => (
          <li key={`${e.code}-${i}`}>
            <button type="button" className="min-h-11 w-full rounded-md px-2 text-left text-sm hover:bg-gray-100 lg:min-h-0 lg:py-1.5" onClick={() => focusError(e)}>
              {e.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CheckResults() {
  const liveCheck = useEditor((s) => s.analysis.liveCheck);
  const errors = liveCheck.filter((e) => e.severity === 'error');
  const warnings = liveCheck.filter((e) => e.severity === 'warning');
  if (errors.length === 0 && warnings.length === 0) {
    return <p className="rounded-md bg-green-50 p-3 text-sm font-medium text-green-700">✓ Circuit Valid：電路檢查通過</p>;
  }
  return (
    <div className="space-y-4">
      <Group title={`🔴 錯誤（${errors.length}）`} items={errors} />
      <Group title={`🟡 警告（${warnings.length}）`} items={warnings} />
    </div>
  );
}
