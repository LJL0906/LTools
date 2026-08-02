import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/shadcn/ui/alert-dialog";

interface ConfirmDialogProps {
  confirmLabel?: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}

export function ConfirmDialog({
  confirmLabel = "删除",
  message,
  onCancel,
  onConfirm,
  title,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open>
      <AlertDialogContent
        className="dialog gap-0 p-0 sm:max-w-none"
        onEscapeKeyDown={onCancel}
        role="dialog"
      >
        <header className="dialog__header">
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </header>
        <div className="dialog__body">
          <AlertDialogDescription className="confirm-dialog__message">
            {message}
          </AlertDialogDescription>
        </div>
        <footer className="dialog__footer">
          <button className="dialog-btn dialog-btn--cancel" onClick={onCancel} type="button">
            取消
          </button>
          <button className="dialog-btn dialog-btn--danger" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </footer>
      </AlertDialogContent>
    </AlertDialog>
  );
}
