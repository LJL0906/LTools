import { useEffect, useState, type FormEvent } from "react";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";

interface NoteRenameDialogProps {
  initialTitle: string;
  onCancel: () => void;
  onSave: (title: string) => void;
}

/** 重命名笔记弹窗 */
export function NoteRenameDialog({
  initialTitle,
  onCancel,
  onSave,
}: NoteRenameDialogProps) {
  const [title, setTitle] = useState(initialTitle);

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <Dialog
      footer={
        <>
          <Button onClick={onCancel}>取消</Button>
          <Button form="note-rename-form" type="submit" variant="primary">
            保存
          </Button>
        </>
      }
      onClose={onCancel}
      title="重命名笔记"
    >
      <form
        className="flex flex-col gap-2"
        id="note-rename-form"
        onSubmit={handleSubmit}
      >
        <Label htmlFor="note-rename-title">标题</Label>
        <Input
          autoFocus
          id="note-rename-title"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="笔记标题"
          value={title}
        />
      </form>
    </Dialog>
  );
}
