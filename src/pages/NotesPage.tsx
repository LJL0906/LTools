import { useEffect, useMemo, useRef, useState } from "react";
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
import type { GroupItem } from "../features/groups/types";
import { useNoteTarget } from "../App";
import { loadState, STORAGE_KEYS } from "../lib/storage";
import {
  deleteNote,
  isTauriRuntime,
  loadNotesData,
  persistNotes,
  upsertNote,
} from "../lib/data";

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
  draggingNoteId: string | null;
  menuNoteId: string | null;
  notes: NoteItem[];
  onCloseMenu: () => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: string) => void;
  onOpenMenu: (noteId: string) => void;
  onRenameNote: (noteId: string) => void;
  onRowPointerCancel: () => void;
  onRowPointerDown: (noteId: string) => (event: React.PointerEvent<HTMLButtonElement>) => void;
  onRowPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onRowPointerUp: () => void;
  onSelectNote: (noteId: string) => void;
  sidebarListRef: React.RefObject<HTMLUListElement | null>;
}

/** 笔记侧栏：扁平笔记列表（无分组层级），标题行按住拖动排序，条目右侧操作菜单 */
function NotesSidebar({
  activeNoteId,
  draggingNoteId,
  menuNoteId,
  notes,
  onCloseMenu,
  onCreateNote,
  onDeleteNote,
  onOpenMenu,
  onRenameNote,
  onRowPointerCancel,
  onRowPointerDown,
  onRowPointerMove,
  onRowPointerUp,
  onSelectNote,
  sidebarListRef,
}: NotesSidebarProps) {
  return (
    <div className="notes-sidebar">
      <div className="notes-sidebar__heading">
        <FileText size={14} aria-hidden="true" />
        <span>笔记</span>
      </div>

      {notes.length > 0 ? (
        <ul className="notes-sidebar__list" ref={sidebarListRef} role="list" aria-label="笔记列表">
          {notes.map((note) => (
            <li
              className={`notes-sidebar__item${draggingNoteId === note.id ? " is-dragging" : ""}`}
              data-note-id={note.id}
              key={note.id}
            >
              <button
                aria-current={note.id === activeNoteId ? "true" : undefined}
                aria-label={note.title}
                className={`note-list-item${
                  note.id === activeNoteId ? " is-active" : ""
                }`}
                onClick={() => onSelectNote(note.id)}
                onPointerCancel={onRowPointerCancel}
                onPointerDown={onRowPointerDown(note.id)}
                onPointerMove={onRowPointerMove}
                onPointerUp={onRowPointerUp}
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
  const [noteGroups, setNoteGroups] = useState<GroupItem[]>([]);
  const [activeNoteId, setActiveNoteId] = useState(initialNotes[0].id);
  const [menuNoteId, setMenuNoteId] = useState<string | null>(null);
  const [renamingNote, setRenamingNote] = useState<NoteItem | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  // 拖拽排序中被拖起的笔记 id（用于高亮；Pointer Events 自实现，不依赖原生 DnD）
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  // 拖拽过程状态（ref 避免高频 pointermove 触发渲染；active 区分「点击」与「拖拽」）
  const dragStateRef = useRef<{ id: string; active: boolean } | null>(null);
  // 笔记列表容器：拖拽时通过它遍历条目行做命中检测
  const sidebarListRef = useRef<HTMLUListElement>(null);
  // notes 镜像：pointerup 落定持久化时读取最新顺序（handler 闭包可能滞后）
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

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
    void loadNotesData().then(({ notes: dbNotes, noteGroups: dbGroups }) => {
      if (disposed) return;
      setNotes(dbNotes);
      setNoteGroups(dbGroups);
    });
    return () => {
      disposed = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // 拖拽排序（Pointer Events 自实现，替代原生 HTML5 DnD）：
  // 按下标题行开始候选拖拽，移动超过阈值激活拖拽，期间按指针位置实时重排，
  // 松手落定并持久化。完全自控光标样式（grab / grabbing），不会出现禁用光标。
  // -------------------------------------------------------------------------
  const handleRowPointerDown =
    (noteId: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return; // 仅左键
      if (menuNoteId) setMenuNoteId(null); // 收起可能打开的菜单
      dragStateRef.current = { id: noteId, active: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    };

  const handleRowPointerMove =
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      // 移动超过阈值才视为拖拽，避免与单击选中冲突
      if (!drag.active) {
        if (Math.abs(event.movementY) < 4 && Math.abs(event.movementX) < 4) return;
        drag.active = true;
        setDraggingNoteId(drag.id);
      }
      // 找指针当前所在的条目行，把被拖项移到该行之前
      const rows = Array.from(
        sidebarListRef.current?.querySelectorAll<HTMLLIElement>("[data-note-id]") ?? [],
      );
      let targetId: string | null = null;
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
          targetId = row.getAttribute("data-note-id");
          break;
        }
      }
      if (!targetId || targetId === drag.id) return;
      const from = notesRef.current.findIndex((n) => n.id === drag.id);
      const to = notesRef.current.findIndex((n) => n.id === targetId);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...notesRef.current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setNotes(next);
    };

  const finishDrag = () => {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    setDraggingNoteId(null);
    // 真实发生了拖拽（有重排）才持久化；单纯点击不触发
    if (drag?.active) {
      persistNotes(notesRef.current, noteGroups);
    }
  };

  return (
    <TooltipProvider>
      <ModuleLayout
        className="notes-layout"
        sidebar={
          <NotesSidebar
            activeNoteId={activeNote?.id ?? ""}
            draggingNoteId={draggingNoteId}
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
            onRowPointerCancel={finishDrag}
            onRowPointerDown={handleRowPointerDown}
            onRowPointerMove={handleRowPointerMove}
            onRowPointerUp={finishDrag}
            onSelectNote={(noteId) => {
              setActiveNoteId(noteId);
              setMenuNoteId(null);
            }}
            sidebarListRef={sidebarListRef}
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
