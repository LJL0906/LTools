import { useEffect, useState, type FormEvent } from "react";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import type { GroupScope } from "./types";

interface GroupDialogProps {
  initialName?: string;
  mode: "create" | "rename";
  onCancel: () => void;
  onSave: (name: string) => void;
  scope: GroupScope;
}

export function GroupDialog({
  initialName = "",
  mode,
  onCancel,
  onSave,
  scope,
}: GroupDialogProps) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const title = mode === "create" ? "新建分组" : "重命名分组";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSave(trimmedName);
  };

  return (
    <Dialog
      footer={
        <>
          <Button onClick={onCancel}>取消</Button>
          <Button form={`${scope}-group-form`} type="submit" variant="primary">
            保存
          </Button>
        </>
      }
      onClose={onCancel}
      title={title}
    >
      <form className="flex flex-col gap-2" id={`${scope}-group-form`} onSubmit={handleSubmit}>
        <Label htmlFor={`${scope}-group-name`}>名称</Label>
        <Input
          autoFocus
          id={`${scope}-group-name`}
          onChange={(event) => setName(event.target.value)}
          placeholder="分组名称"
          value={name}
        />
      </form>
    </Dialog>
  );
}
