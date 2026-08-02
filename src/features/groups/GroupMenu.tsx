import { Pencil, Trash2 } from "lucide-react";
import type { GroupItem } from "./types";

interface GroupMenuProps {
  group: GroupItem;
  onClose: () => void;
  onDelete: () => void;
  onRename: () => void;
}

export function GroupMenu({ group, onClose, onDelete, onRename }: GroupMenuProps) {
  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div className="group-menu">
        <div className="group-menu__title">{group.name}</div>
        <button
          className="group-menu__action"
          onClick={() => {
            onRename();
            onClose();
          }}
          type="button"
        >
          <Pencil size={14} aria-hidden="true" />
          重命名
        </button>
        <button
          className="group-menu__action group-menu__action--danger"
          onClick={() => {
            onDelete();
            onClose();
          }}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
          删除分组
        </button>
      </div>
    </>
  );
}
