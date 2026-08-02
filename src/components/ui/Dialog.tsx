import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  Dialog as ShadcnDialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/shadcn/ui/dialog";

interface DialogProps {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  title: string;
}

export function Dialog({ children, footer, onClose, title }: DialogProps) {
  return (
    <ShadcnDialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent
        aria-describedby={undefined}
        className="dialog gap-0 p-0 sm:max-w-none"
        showCloseButton={false}
      >
        <header className="dialog__header">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose aria-label="关闭" className="icon-button dialog__close">
            <X aria-hidden="true" />
          </DialogClose>
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </DialogContent>
    </ShadcnDialog>
  );
}
