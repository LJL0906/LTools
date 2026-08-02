import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Folder, FolderPlus, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcn/ui/tooltip";
import type { AppOutletContext } from "../components/layout/AppShell";
import { ModuleLayout } from "../components/layout/ModuleLayout";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { IconButton } from "../components/ui/IconButton";
import { DeleteGroupDialog } from "../features/groups/DeleteGroupDialog";
import { GroupDialog } from "../features/groups/GroupDialog";
import { AccordionGroup } from "../features/groups/GroupTree";
import type { AccordionNote } from "../features/groups/GroupTree";
import type { GroupItem } from "../features/groups/types";
import { NoteEditor } from "../features/notes/NoteEditor";
import { loadState, saveState, STORAGE_KEYS } from "../lib/storage";

interface NoteItem {
  content: string;
  groupId: string | null;
  id: string;
  time: string;
  title: string;
}

const initialNoteGroups: GroupItem[] = [
  { id: "work", name: "工作" },
  { id: "project-a", name: "项目 A" },
  { id: "product-design", name: "产品设计" },
  { id: "learning", name: "学习" },
];

const initialNotes: NoteItem[] = [
  {
    id: "meeting",
    title: "项目会议记录",
    content: "<p>本次会议确认首版功能范围。</p>",
    groupId: "project-a",
    time: "今天 14:32",
  },
  {
    id: "api-debug",
    title: "接口排查记录",
    content: "<p>记录接口排查过程。</p>",
    groupId: "work",
    time: "昨天 18:10",
  },
  {
    id: "release-check",
    title: "发布检查清单",
    content: "<p>确认发布前检查项。</p>",
    groupId: null,
    time: "7 月 28 日",
  },
];

function toAccordionNotes(notes: NoteItem[]): AccordionNote[] {
  return notes.map((n) => ({
    id: n.id,
    title: n.title,
    time: n.time,
    groupId: n.groupId,
  }));
}

interface NotesSidebarProps {
  activeMenuGroupId: string | null;
  activeNoteId: string;
  expandedGroupId: string | null;
  groups: GroupItem[];
  notes: NoteItem[];
  onCreateGroup: () => void;
  onCreateNote: () => void;
  onDeleteGroup: (group: GroupItem) => void;
  onCloseGroupMenu: () => void;
  onOpenGroupMenu: (groupId: string) => void;
  onRenameGroup: (group: GroupItem) => void;
  onSelectNote: (noteId: string) => void;
  onToggleExpand: (groupId: string | null) => void;
}

function NotesSidebar({
  activeMenuGroupId,
  activeNoteId,
  expandedGroupId,
  groups,
  notes,
  onCreateGroup,
  onCreateNote,
  onDeleteGroup,
  onCloseGroupMenu,
  onOpenGroupMenu,
  onRenameGroup,
  onSelectNote,
  onToggleExpand,
}: NotesSidebarProps) {
  const accordionNotes = useMemo(() => toAccordionNotes(notes), [notes]);

  return (
    <div className="notes-sidebar">
      {/* ---- 分组 heading：与 LinksSidebar 一致 ---- */}
      <div className="links-sidebar__heading">
        <div className="links-sidebar__title">
          <Folder size={14} aria-hidden="true" />
          <span>分组</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="新建分组"
              className="icon-button"
              onClick={onCreateGroup}
              type="button"
            >
              <FolderPlus size={16} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">新建分组</TooltipContent>
        </Tooltip>
      </div>

      {/* ---- 手风琴分组 + 内嵌笔记 ---- */}
      <AccordionGroup
        activeMenuGroupId={activeMenuGroupId}
        activeNoteId={activeNoteId}
        expandedGroupId={expandedGroupId}
        groups={groups}
        notes={accordionNotes}
        onCloseGroupMenu={onCloseGroupMenu}
        onDeleteGroup={onDeleteGroup}
        onOpenGroupMenu={onOpenGroupMenu}
        onRenameGroup={onRenameGroup}
        onSelectNote={onSelectNote}
        onToggleExpand={onToggleExpand}
      />

      {/* ---- 底部新建笔记 ---- */}
      <div className="notes-sidebar__footer">
        <Button aria-label="新建笔记" onClick={onCreateNote} variant="primary">
          ＋ 新建笔记
        </Button>
      </div>
    </div>
  );
}

export function NotesPage() {
  const { searchQuery } = useOutletContext<AppOutletContext>();
  const [groups, setGroups] = useState(() =>
    loadState(STORAGE_KEYS.noteGroups, initialNoteGroups),
  );
  const [notes, setNotes] = useState(() => loadState(STORAGE_KEYS.notes, initialNotes));
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>("__all__");
  const [activeNoteId, setActiveNoteId] = useState(initialNotes[0].id);
  const [activeMenuGroupId, setActiveMenuGroupId] = useState<string | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<GroupItem | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);

  /** 仅按搜索词过滤（不按分组过滤，分组过滤由 AccordionGroup 内部处理） */
  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return notes;
    return notes.filter((note) =>
      `${note.title} ${note.content.replace(/<[^>]*>/g, " ")}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [notes, searchQuery]);

  /** AccordionGroup 展开的当前分组中的所有笔记（用于编辑器显示） */
  const visibleNotesInGroup = useMemo(() => {
    if (expandedGroupId === null) return [];
    if (expandedGroupId === "__all__") return filteredNotes;
    if (expandedGroupId === "ungrouped")
      return filteredNotes.filter((n) => n.groupId === null);
    return filteredNotes.filter((n) => n.groupId === expandedGroupId);
  }, [filteredNotes, expandedGroupId]);

  useEffect(() => {
    if (!visibleNotesInGroup.some((note) => note.id === activeNoteId)) {
      setActiveNoteId(visibleNotesInGroup[0]?.id ?? "");
    }
  }, [activeNoteId, visibleNotesInGroup]);

  const activeNote = visibleNotesInGroup.find((note) => note.id === activeNoteId) ?? null;

  const updateActiveNote = (changes: Partial<NoteItem>) => {
    if (!activeNote) return;
    setNotes((currentNotes) =>
      currentNotes.map((note) =>
        note.id === activeNote.id ? { ...note, ...changes } : note,
      ),
    );
  };

  const createNote = () => {
    const groupId =
      expandedGroupId && expandedGroupId !== "ungrouped" && expandedGroupId !== "__all__"
        ? expandedGroupId
        : null;
    const note: NoteItem = {
      id: crypto.randomUUID(),
      title: "未命名笔记",
      content: "",
      groupId,
      time: "刚刚",
    };
    setNotes((currentNotes) => [note, ...currentNotes]);
    setActiveNoteId(note.id);
  };

  /** 数据变更后实时写入 localStorage（无保存按钮的自动持久化） */
  useEffect(() => {
    saveState(STORAGE_KEYS.notes, notes);
  }, [notes]);

  useEffect(() => {
    saveState(STORAGE_KEYS.noteGroups, groups);
  }, [groups]);

  const handleToggleExpand = (groupId: string | null) => {
    setExpandedGroupId((prev) => (prev === groupId ? null : groupId));
  };

  const handleDeleteGroup = (group: GroupItem) => {
    setGroups((currentGroups) =>
      currentGroups.filter((g) => g.id !== group.id),
    );
    setNotes((currentNotes) =>
      currentNotes.map((note) =>
        note.groupId === group.id ? { ...note, groupId: null } : note,
      ),
    );
    if (expandedGroupId === group.id) {
      setExpandedGroupId(null);
    }
    setDeletingGroup(null);
    setActiveMenuGroupId(null);
  };

  return (
    <TooltipProvider>
      <ModuleLayout
        className="notes-layout"
        sidebar={
          <NotesSidebar
            activeMenuGroupId={activeMenuGroupId}
            activeNoteId={activeNote?.id ?? ""}
            expandedGroupId={expandedGroupId}
            groups={groups}
            notes={filteredNotes}
            onCreateGroup={() => setIsCreatingGroup(true)}
            onCreateNote={createNote}
            onDeleteGroup={(group) => {
              setActiveMenuGroupId(null);
              setDeletingGroup(group);
            }}
            onCloseGroupMenu={() => setActiveMenuGroupId(null)}
            onOpenGroupMenu={(groupId) =>
              setActiveMenuGroupId((currentId) =>
                currentId === groupId ? null : groupId,
              )
            }
            onRenameGroup={(group) => {
              setActiveMenuGroupId(null);
              setEditingGroup(group);
            }}
            onSelectNote={(noteId) => {
              setActiveNoteId(noteId);
            }}
            onToggleExpand={handleToggleExpand}
          />
        }
        maxSidebarWidth={420}
        minSidebarWidth={240}
        resizeHandleLabel="调整笔记侧栏宽度"
        sidebarStateKey="notes"
        sidebarWidth={240}
      >
        {activeNote ? (
          <article className="note-editor" aria-labelledby="note-title-heading">
            <div className="note-editor__title-row">
              <h2 className="sr-only" id="note-title-heading">
                {activeNote.title}
              </h2>
              <input
                aria-label="笔记标题"
                className="note-title-input"
                onChange={(event) => updateActiveNote({ title: event.target.value })}
                value={activeNote.title}
              />
              <IconButton aria-label="删除笔记" onClick={() => setIsDeletingNote(true)}>
                <Trash2 aria-hidden="true" size={16} />
              </IconButton>
            </div>
            <NoteEditor
              content={activeNote.content}
              onChange={(html) => updateActiveNote({ content: html })}
            />
          </article>
        ) : (
          <section className="note-empty-state">暂无笔记</section>
        )}
      </ModuleLayout>

      {/* ---- 分组操作弹窗 ---- */}
      {isCreatingGroup ? (
        <GroupDialog
          mode="create"
          onCancel={() => setIsCreatingGroup(false)}
          onSave={(name) => {
            setGroups((currentGroups) => [
              ...currentGroups,
              { id: crypto.randomUUID(), name },
            ]);
            setIsCreatingGroup(false);
          }}
          scope="notes"
        />
      ) : null}
      {editingGroup ? (
        <GroupDialog
          initialName={editingGroup.name}
          mode="rename"
          onCancel={() => setEditingGroup(null)}
          onSave={(name) => {
            setGroups((currentGroups) =>
              currentGroups.map((g) =>
                g.id === editingGroup.id ? { ...g, name } : g,
              ),
            );
            setEditingGroup(null);
          }}
          scope="notes"
        />
      ) : null}
      {deletingGroup ? (
        <DeleteGroupDialog
          group={deletingGroup}
          onCancel={() => setDeletingGroup(null)}
          onConfirm={() => handleDeleteGroup(deletingGroup)}
          scope="notes"
        />
      ) : null}

      {/* ---- 笔记删除确认 ---- */}
      {isDeletingNote && activeNote ? (
        <ConfirmDialog
          message={`确定删除"${activeNote.title}"？`}
          onCancel={() => setIsDeletingNote(false)}
          onConfirm={() => {
            setNotes((currentNotes) =>
              currentNotes.filter((note) => note.id !== activeNote.id),
            );
            setIsDeletingNote(false);
          }}
          title="删除笔记"
        />
      ) : null}
    </TooltipProvider>
  );
}
