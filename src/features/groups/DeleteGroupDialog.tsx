import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import type { GroupItem, GroupScope } from "./types";

interface DeleteGroupDialogProps {
  group: GroupItem;
  onCancel: () => void;
  onConfirm: () => void;
  scope: GroupScope;
}

export function DeleteGroupDialog({
  group,
  onCancel,
  onConfirm,
  scope,
}: DeleteGroupDialogProps) {
  return (
    <div data-group-scope={scope}>
      <ConfirmDialog
        confirmLabel="删除"
        message={`确定删除“${group.name}”？`}
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="删除分组"
      />
    </div>
  );
}
