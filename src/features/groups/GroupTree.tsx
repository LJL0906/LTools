import { ChevronRight, Folder, Inbox, MoreHorizontal } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcn/ui/tooltip";
import { GroupMenu } from "./GroupMenu";
import type { GroupItem } from "./types";

/** 笔记条目 — 手风琴展开时嵌入显示 */
export interface AccordionNote {
  id: string;
  title: string;
  time: string;
  groupId: string | null;
}

export interface AccordionGroupProps {
  activeMenuGroupId: string | null;
  activeNoteId: string;
  expandedGroupId: string | null;
  groups: GroupItem[];
  notes: AccordionNote[];
  onCloseGroupMenu: () => void;
  onDeleteGroup: (group: GroupItem) => void;
  onOpenGroupMenu: (groupId: string) => void;
  onRenameGroup: (group: GroupItem) => void;
  onSelectNote: (noteId: string) => void;
  onToggleExpand: (groupId: string | null) => void;
}

function getNotesForGroup(
  notes: AccordionNote[],
  groupId: string | null,
): AccordionNote[] {
  if (groupId === null || groupId === "__all__") return notes;
  if (groupId === "ungrouped") return notes.filter((n) => n.groupId === null);
  return notes.filter((n) => n.groupId === groupId);
}

function AccordionRow({
  activeMenuGroupId,
  activeNoteId,
  expanded,
  group,
  label,
  notes,
  onCloseGroupMenu,
  onDeleteGroup,
  onOpenGroupMenu,
  onRenameGroup,
  onSelectNote,
  onToggle,
  showMenu,
}: {
  activeMenuGroupId: string | null;
  activeNoteId: string;
  expanded: boolean;
  group?: GroupItem;
  label: string;
  notes: AccordionNote[];
  onCloseGroupMenu: () => void;
  onDeleteGroup: (group: GroupItem) => void;
  onOpenGroupMenu: (groupId: string) => void;
  onRenameGroup: (group: GroupItem) => void;
  onSelectNote: (noteId: string) => void;
  onToggle: () => void;
  showMenu: boolean;
}) {
  const groupId = group?.id ?? null;

  return (
    <>
      <div className="group-row-shell">
        <button
          aria-label={group ? group.name : label}
          className={`group-row${expanded ? " is-active" : ""}`}
          onClick={onToggle}
          type="button"
        >
          <span
            className={`group-accordion-toggle${expanded ? " is-expanded" : ""}`}
            aria-hidden="true"
          >
            <ChevronRight size={14} />
          </span>
          {groupId === null ? (
            <Folder size={15} aria-hidden="true" />
          ) : groupId === "ungrouped" ? (
            <Inbox size={15} aria-hidden="true" />
          ) : null}
          <span>{label}</span>
        </button>
        {showMenu ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={`管理分组 ${group!.name}`}
                className="group-row__menu-button icon-button"
                onClick={() => onOpenGroupMenu(group!.id)}
                type="button"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">管理分组</TooltipContent>
          </Tooltip>
        ) : null}
        {showMenu && activeMenuGroupId === group!.id ? (
          <GroupMenu
            group={group!}
            onClose={onCloseGroupMenu}
            onDelete={() => onDeleteGroup(group!)}
            onRename={() => onRenameGroup(group!)}
          />
        ) : null}
      </div>
      {expanded && notes.length > 0 ? (
        <div className="group-accordion-notes">
          {notes.map((note) => (
            <button
              aria-label={note.title}
              className={`note-list-item${note.id === activeNoteId ? " is-active" : ""}`}
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              type="button"
            >
              <strong>{note.title}</strong>
              <span>{note.time}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function AccordionGroup({
  activeMenuGroupId,
  activeNoteId,
  expandedGroupId,
  groups,
  notes,
  onCloseGroupMenu,
  onDeleteGroup,
  onOpenGroupMenu,
  onRenameGroup,
  onSelectNote,
  onToggleExpand,
}: AccordionGroupProps) {
  const allNotes = getNotesForGroup(notes, null);
  const ungroupedNotes = getNotesForGroup(notes, "ungrouped");

  return (
    <TooltipProvider>
      <div className="links-sidebar__groups">
        {/* 全部 */}
        <AccordionRow
          activeMenuGroupId={activeMenuGroupId}
          activeNoteId={activeNoteId}
          expanded={expandedGroupId === "__all__"}
          label="全部"
          notes={allNotes}
          onCloseGroupMenu={onCloseGroupMenu}
          onDeleteGroup={onDeleteGroup}
          onOpenGroupMenu={onOpenGroupMenu}
          onRenameGroup={onRenameGroup}
          onSelectNote={onSelectNote}
          onToggle={() => onToggleExpand("__all__")}
          showMenu={false}
        />

        {/* 用户分组 */}
        {groups.map((group) => (
          <AccordionRow
            key={group.id}
            activeMenuGroupId={activeMenuGroupId}
            activeNoteId={activeNoteId}
            expanded={expandedGroupId === group.id}
            group={group}
            label={group.name}
            notes={getNotesForGroup(notes, group.id)}
            onCloseGroupMenu={onCloseGroupMenu}
            onDeleteGroup={onDeleteGroup}
            onOpenGroupMenu={onOpenGroupMenu}
            onRenameGroup={onRenameGroup}
            onSelectNote={onSelectNote}
            onToggle={() => onToggleExpand(group.id)}
            showMenu
          />
        ))}

        {/* 未分组 */}
        <AccordionRow
          activeMenuGroupId={activeMenuGroupId}
          activeNoteId={activeNoteId}
          expanded={expandedGroupId === "ungrouped"}
          label="未分组"
          notes={ungroupedNotes}
          onCloseGroupMenu={onCloseGroupMenu}
          onDeleteGroup={onDeleteGroup}
          onOpenGroupMenu={onOpenGroupMenu}
          onRenameGroup={onRenameGroup}
          onSelectNote={onSelectNote}
          onToggle={() => onToggleExpand("ungrouped")}
          showMenu={false}
        />
      </div>
    </TooltipProvider>
  );
}
