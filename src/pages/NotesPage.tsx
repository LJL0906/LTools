import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { FileText, MoreHorizontal, Trash2 } from "lucide-react";
import { TooltipProvider } from "@/components/shadcn/ui/tooltip";
import type { AppOutletContext } from "../components/layout/AppShell";
import { ModuleLayout } from "../components/layout/ModuleLayout";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { IconButton } from "../components/ui/IconButton";
import { NoteEditor } from "../features/notes/NoteEditor";
import { NoteMenu } from "../features/notes/NoteMenu";
import { NoteRenameDialog } from "../features/notes/NoteRenameDialog";
import type { NoteItem } from "../features/notes/types";
import { useNoteTarget } from "../App";
import { loadState, STORAGE_KEYS } from "../lib/storage";
import { deleteNote, isTauriRuntime, loadNotesData, upsertNote } from "../lib/data";

const initialNotes: NoteItem[] = [
  {
    id: "meeting",
    title: "项目会议记录",
    content: "<p>本次会议确认首版功能范围。</p>",
    groupId: null,
    time: "今天 14:32",
  },
  {
    id: "api-debug",
    title: "接口排查记录",
    content: "<p>记录接口排查过程。</p>",
    groupId: null,
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

interface NotesSidebarProps {
  activeNoteId: string;
  menuNoteId: string | null;
  notes: NoteItem[];
  onCloseMenu: () => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: string) => void;
  onOpenMenu: (noteId: string) => void;
  onRenameNote: (noteId: string) => void;
  onSelectNote: (noteId: string) => void;
}

/** 笔记侧栏：扁平笔记列表（无分组层级），条目右侧操作菜单（重命名/删除） */
function NotesSidebar({
  activeNoteId,
  menuNoteId,
  notes,
  onCloseMenu,
  onCreateNote,
  onDeleteNote,
  onOpenMenu,
  onRenameNote,
  onSelectNote,
}: NotesSidebarProps) {
  return (
    <div className="notes-sidebar">
      <div className="notes-sidebar__heading">
        <FileText size={14} aria-hidden="true" />
        <span>笔记</span>
      </div>

      {notes.length > 0 ? (
        <ul className="notes-sidebar__list" role="list" aria-label="笔记列表">
          {notes.map((note) => (
            <li className="notes-sidebar__item" key={note.id}>
              <button
                aria-current={note.id === activeNoteId ? "true" : undefined}
                aria-label={note.title}
                className={`note-list-item${
                  note.id === activeNoteId ? " is-active" : ""
                }`}
                onClick={() => onSelectNote(note.id)}
                type="button"
              >
                <strong>{note.title}</strong>
              </button>
              <button
                aria-expanded={menuNoteId === note.id}
                aria-label={`操作 ${note.title}`}
                className="note-list-item__menu"
                onClick={() => onOpenMenu(note.id)}
                type="button"
              >
                <MoreHorizontal size={15} aria-hidden="true" />
              </button>
              {menuNoteId === note.id ? (
                <NoteMenu
                  noteTitle={note.title}
                  onClose={onCloseMenu}
                  onDelete={() => onDeleteNote(note.id)}
                  onRename={() => onRenameNote(note.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

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
  const [notes, setNotes] = useState(() => loadState(STORAGE_KEYS.notes, initialNotes));
  const [activeNoteId, setActiveNoteId] = useState(initialNotes[0].id);
  const [menuNoteId, setMenuNoteId] = useState<string | null>(null);
  const [renamingNote, setRenamingNote] = useState<NoteItem | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);

  // 快捷搜索选中的目标笔记（来自 open-note 事件）：选中并保证可见
  const { targetNoteId, consumeTarget } = useNoteTarget();
  useEffect(() => {
    if (!targetNoteId) return;
    setActiveNoteId(targetNoteId);
    consumeTarget();
  }, [consumeTarget, targetNoteId]);

  /** 仅按搜索词过滤（过滤结果即侧栏列表与编辑器候选集） */
  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return notes;
    return notes.filter((note) =>
      `${note.title} ${note.content.replace(/<[^>]*>/g, " ")}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [notes, searchQuery]);

  useEffect(() => {
    if (!filteredNotes.some((note) => note.id === activeNoteId)) {
      setActiveNoteId(filteredNotes[0]?.id ?? "");
    }
  }, [activeNoteId, filteredNotes]);

  const activeNote = filteredNotes.find((note) => note.id === activeNoteId) ?? null;

  const updateActiveNote = (changes: Partial<NoteItem>) => {
    if (!activeNote) return;
    const updated = { ...activeNote, ...changes };
    setNotes((currentNotes) =>
      currentNotes.map((note) =>
        note.id === activeNote.id ? updated : note,
      ),
    );
    upsertNote(updated);
  };

  const createNote = () => {
    const note: NoteItem = {
      id: crypto.randomUUID(),
      title: "未命名笔记",
      content: "",
      groupId: null,
      time: "刚刚",
    };
    setNotes((currentNotes) => [note, ...currentNotes]);
    setActiveNoteId(note.id);
    upsertNote(note);
  };

  /** 首次加载：Tauri 用 SQLite 数据覆盖初始值（含一次性迁移）；浏览器初始值即最终值 */
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    void loadNotesData().then(({ notes: dbNotes }) => {
      if (disposed) return;
      setNotes(dbNotes);
    });
    return () => {
      disposed = true;
    };
  }, []);

  return (
    <TooltipProvider>
      <ModuleLayout
        className="notes-layout"
        sidebar={
          <NotesSidebar
            activeNoteId={activeNote?.id ?? ""}
            menuNoteId={menuNoteId}
            notes={filteredNotes}
            onCloseMenu={() => setMenuNoteId(null)}
            onCreateNote={createNote}
            onDeleteNote={(noteId) => {
              const target = notes.find((n) => n.id === noteId);
              if (target) {
                setActiveNoteId(target.id);
                setIsDeletingNote(true);
              }
            }}
            onOpenMenu={(noteId) =>
              setMenuNoteId((current) => (current === noteId ? null : noteId))
            }
            onRenameNote={(noteId) => {
              const target = notes.find((n) => n.id === noteId);
              if (target) setRenamingNote(target);
            }}
            onSelectNote={(noteId) => {
              setActiveNoteId(noteId);
              setMenuNoteId(null);
            }}
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

      {/* ---- 笔记重命名弹窗 ---- */}
      {renamingNote ? (
        <NoteRenameDialog
          initialTitle={renamingNote.title}
          onCancel={() => setRenamingNote(null)}
          onSave={(title) => {
            const updated = { ...renamingNote, title };
            setNotes((currentNotes) =>
              currentNotes.map((note) =>
                note.id === renamingNote.id ? updated : note,
              ),
            );
            setRenamingNote(null);
            upsertNote(updated);
          }}
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
            deleteNote(activeNote.id);
          }}
          title="删除笔记"
        />
      ) : null}
    </TooltipProvider>
  );
}
