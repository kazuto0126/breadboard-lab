import { deleteComponent, deleteWire, flipWire, rotateComponent, type CommandResult } from '../commands/commands';
import type { ProjectFile } from '../model/projectFile';
import { useEditor } from '../store/editorStore';
import type { ContextMenuState } from './useBoardInteractions';

function Item({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="block min-h-11 w-full px-4 text-left hover:bg-gray-100 lg:min-h-0 lg:py-1.5" onClick={onClick}>
      {label}
    </button>
  );
}

export function ContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const componentId = menu.hit.kind === 'pin' || menu.hit.kind === 'component' ? menu.hit.componentId : null;
  const wireId = menu.hit.kind === 'wire' ? menu.hit.wireId : null;
  const act = (command: (doc: ProjectFile) => CommandResult) => () => {
    useEditor.getState().run(command);
    onClose();
  };
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div role="menu" className="fixed z-50 min-w-36 rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg" style={{ left: menu.x, top: menu.y }}>
        {componentId && <Item label="旋轉 90°" onClick={act((doc) => rotateComponent(doc, componentId))} />}
        {componentId && <Item label="刪除" onClick={act((doc) => deleteComponent(doc, componentId))} />}
        {wireId && <Item label="翻轉轉角" onClick={act((doc) => flipWire(doc, wireId))} />}
        {wireId && <Item label="刪除" onClick={act((doc) => deleteWire(doc, wireId))} />}
      </div>
    </>
  );
}
