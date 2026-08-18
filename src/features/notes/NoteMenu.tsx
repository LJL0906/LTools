interface NoteMenuProps {
  noteTitle: string;
  onClose: () => void;
  onDelete: () => void;
  onRename: () => void;
}

/** 笔记条目操作菜单（复用分组菜单的视觉与交互模式） */
export function NoteMenu({ noteTitle, onClose, onDelete, onRename }: NoteMenuProps) {
  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div className="group-menu">
        <div className="group-menu__title">{noteTitle}</div>
        <button
          className="group-menu__action"
          onClick={() => {
            onRename();
            onClose();
          }}
          type="button"
        >
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
          删除笔记
        </button>
      </div>
    </>
  );
}
