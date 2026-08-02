import { useEffect, useState, type FormEvent } from "react";
import { Input } from "@/components/shadcn/ui/input";
import { Label } from "@/components/shadcn/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/ui/select";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import type { GroupItem } from "../groups/types";
import type { LinkDraft, LinkItem, LinkProtocol } from "./types";
import "./LinkDialog.css";

const protocols: LinkProtocol[] = ["https", "http", "ws", "wss"];
const ungroupedValue = "__ungrouped__";

interface LinkDialogProps {
  groups: GroupItem[];
  link?: LinkItem;
  defaultGroupId?: string | null;
  onCancel: () => void;
  onSave: (link: LinkDraft) => void;
}

const emptyLink: LinkDraft = {
  address: "",
  groupId: null,
  notes: "",
  protocol: "https",
  title: "",
};

export function LinkDialog({ groups, link, defaultGroupId, onCancel, onSave }: LinkDialogProps) {
  const [draft, setDraft] = useState<LinkDraft>(
    link ?? { ...emptyLink, groupId: defaultGroupId ?? null },
  );
  const isEditing = Boolean(link);

  useEffect(() => {
    setDraft(link ?? { ...emptyLink, groupId: defaultGroupId ?? null });
  }, [link, defaultGroupId]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();
    const address = draft.address.trim();
    if (!title || !address) return;

    onSave({ ...draft, address, notes: draft.notes.trim(), title });
  };

  return (
    <Dialog
      footer={
        <>
          <Button onClick={onCancel}>取消</Button>
          <Button form="link-form" type="submit" variant="primary">
            保存
          </Button>
        </>
      }
      onClose={onCancel}
      title={isEditing ? "编辑链接" : "添加链接"}
    >
      <form className="link-form" id="link-form" onSubmit={handleSubmit}>
        <Label className="field-label" htmlFor="link-title">
          标题
        </Label>
        <Input
          autoFocus
          id="link-title"
          onChange={(event) =>
            setDraft((current) => ({ ...current, title: event.target.value }))
          }
          required
          value={draft.title}
        />

        <div className="link-form__field-row">
          <div className="link-form__protocol-field">
            <Label className="field-label" htmlFor="link-protocol">
              协议
            </Label>
            <Select
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  protocol: value as LinkProtocol,
                }))
              }
              value={draft.protocol}
            >
              <SelectTrigger className="w-full" id="link-protocol">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {protocols.map((protocol) => (
                  <SelectItem key={protocol} value={protocol}>
                    {protocol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="link-form__address-field">
            <Label className="field-label" htmlFor="link-address">
              地址
            </Label>
            <Input
              id="link-address"
              onChange={(event) =>
                setDraft((current) => ({ ...current, address: event.target.value }))
              }
              placeholder="example.com/path"
              required
              value={draft.address}
            />
          </div>
        </div>

        <Label className="field-label" htmlFor="link-notes">
          备注
        </Label>
        <Textarea
          className="link-form__notes"
          id="link-notes"
          onChange={(event) =>
            setDraft((current) => ({ ...current, notes: event.target.value }))
          }
          value={draft.notes}
        />

        <Label className="field-label" htmlFor="link-group">
          分组
        </Label>
        <Select
          onValueChange={(value) =>
            setDraft((current) => ({
              ...current,
              groupId: value === ungroupedValue ? null : value,
            }))
          }
          value={draft.groupId ?? ungroupedValue}
        >
          <SelectTrigger className="w-full" id="link-group">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ungroupedValue}>未分组</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </form>
    </Dialog>
  );
}
