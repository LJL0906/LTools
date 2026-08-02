import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Eye, Inbox, Plus, SearchX, Trash2 } from "lucide-react";
import type { AppOutletContext } from "../components/layout/AppShell";
import { Button as CompatButton } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dialog } from "../components/ui/Dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/shadcn/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/ui/tooltip";
import {
  CLIPBOARD_CHANGED_EVENT,
  CLIPBOARD_MAX_ITEMS,
  truncateClipboardText,
  type ClipboardEntry,
} from "../features/clipboard/types";
import { loadState, STORAGE_KEYS } from "../lib/storage";
import { loadClipboardData, isTauriRuntime, persistClipboard } from "../lib/data";

export function ClipboardPage() {
  const { searchQuery } = useOutletContext<AppOutletContext>();
  const [entries, setEntries] = useState<ClipboardEntry[]>(() =>
    loadState(STORAGE_KEYS.clipboardItems, []),
  );
  const [isAdding, setIsAdding] = useState(false);
  const [addingText, setAddingText] = useState("");
  const [viewingEntry, setViewingEntry] = useState<ClipboardEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<ClipboardEntry | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);

  /** 首次加载：Tauri 用 SQLite 数据覆盖初始值（含一次性迁移）；浏览器初始值即最终值 */
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    void loadClipboardData().then((dbEntries) => {
      if (disposed) return;
      setEntries(dbEntries);
    });
    return () => {
      disposed = true;
    };
  }, []);

  /** 数据变更后持久化（Tauri → SQLite 快照写；浏览器 → localStorage 防抖） */
  useEffect(() => {
    persistClipboard(entries);
  }, [entries]);

  useEffect(() => {
    if (!copiedId) return;

    const timeoutId = window.setTimeout(() => setCopiedId(null), 1500);
    return () => window.clearTimeout(timeoutId);
  }, [copiedId]);

  useEffect(() => {
    if (!copyErrorId) return;

    const timeoutId = window.setTimeout(() => setCopyErrorId(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [copyErrorId]);

  /**
   * 新增一条剪贴板记录：
   * - 与最新一条相同则跳过（防监听循环与重复添加）
   * - 同文本已有条目则去重置顶
   * - 最多保留 CLIPBOARD_MAX_ITEMS 条，超出裁剪最旧
   */
  const addEntry = useCallback((rawText: string) => {
    const text = truncateClipboardText(rawText.trim());
    if (!text) return;

    setEntries((prev) => {
      if (prev.length > 0 && prev[0].text === text) return prev;

      const entry: ClipboardEntry = {
        id: crypto.randomUUID(),
        text,
        createdAt: Date.now(),
      };
      return [entry, ...prev.filter((e) => e.text !== text)].slice(
        0,
        CLIPBOARD_MAX_ITEMS,
      );
    });
  }, []);

  /** 接收 Rust 侧系统剪贴板监听推送（非 Tauri 环境静默） */
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    void listen<string>(CLIPBOARD_CHANGED_EVENT, (event) => {
      addEntry(event.payload);
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // 浏览器 dev 模式 / 测试环境无 Tauri 监听，静默降级为手动添加
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [addEntry]);

  const copyEntry = async (entry: ClipboardEntry) => {
    try {
      await navigator.clipboard.writeText(entry.text);
      setCopyErrorId(null);
      setCopiedId(entry.id);
    } catch {
      setCopiedId(null);
      setCopyErrorId(entry.id);
    }
  };

  const confirmDelete = () => {
    if (!deletingEntry) return;
    setEntries((currentEntries) =>
      currentEntries.filter((e) => e.id !== deletingEntry.id),
    );
    setDeletingEntry(null);
  };

  const confirmClear = () => {
    setEntries([]);
    setIsClearing(false);
  };

  const saveManualEntry = () => {
    addEntry(addingText);
    setAddingText("");
    setIsAdding(false);
  };

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return entries;
    return entries.filter((entry) =>
      entry.text.toLocaleLowerCase().includes(query),
    );
  }, [entries, searchQuery]);

  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <section className="clipboard-page">
      <div className="clipboard-toolbar">
        <CompatButton
          className="button button--primary"
          onClick={() => setIsAdding(true)}
        >
          <Plus size={15} aria-hidden="true" />
          添加
        </CompatButton>
        {entries.length > 0 ? (
          <button
            className="clipboard-toolbar__clear"
            onClick={() => setIsClearing(true)}
            type="button"
          >
            清空全部
          </button>
        ) : null}
      </div>

      {filteredEntries.length > 0 ? (
        <ul className="clipboard-list">
          {filteredEntries.map((entry) => {
            return (
              <li className="clipboard-item" key={entry.id}>
                <button
                  aria-label={`复制 ${entry.text.slice(0, 40)}`}
                  className="clipboard-item__copy"
                  onClick={() => void copyEntry(entry)}
                  type="button"
                >
                  <span className="clipboard-item__text">{entry.text}</span>
                </button>
                <div className="clipboard-item__footer">
                  <span className="clipboard-item__meta">
                    {copyErrorId === entry.id ? (
                      <span role="alert">复制失败</span>
                    ) : copiedId === entry.id ? (
                      <span role="status">已复制</span>
                    ) : (
                      formatRelativeTime(entry.createdAt)
                    )}
                  </span>
                  <div className="clipboard-item__actions">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          aria-label="查看详情"
                          className="icon-button"
                          onClick={() => setViewingEntry(entry)}
                          type="button"
                        >
                          <Eye size={14} aria-hidden="true" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>查看详情</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          aria-label="删除"
                          className="icon-button icon-button--danger"
                          onClick={() => setDeletingEntry(entry)}
                          type="button"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>删除</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty className="clipboard-empty-state" role="status">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {hasSearchQuery ? (
                <SearchX size={20} aria-hidden="true" />
              ) : (
                <Inbox size={20} aria-hidden="true" />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {hasSearchQuery ? "没有找到匹配的剪切板内容" : "剪切板为空"}
            </EmptyTitle>
            <EmptyDescription>
              {hasSearchQuery
                ? "尝试调整搜索关键词，或清空搜索后浏览全部内容。"
                : "复制内容会自动出现在这里，也可以手动添加。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {viewingEntry ? (
        <Dialog
          className="clipboard-dialog--detail"
          footer={
            <CompatButton
              onClick={() => void copyEntry(viewingEntry)}
              variant="primary"
            >
              {copyErrorId === viewingEntry.id
                ? "复制失败"
                : copiedId === viewingEntry.id
                  ? "已复制"
                  : "复制"}
            </CompatButton>
          }
          onClose={() => setViewingEntry(null)}
          title="剪切板详情"
        >
          <div className="clipboard-detail__text">{viewingEntry.text}</div>
        </Dialog>
      ) : null}

      {isAdding ? (
        <Dialog
          footer={
            <>
              <CompatButton
                onClick={() => {
                  setAddingText("");
                  setIsAdding(false);
                }}
              >
                取消
              </CompatButton>
              <CompatButton
                disabled={addingText.trim().length === 0}
                onClick={saveManualEntry}
                variant="primary"
              >
                保存
              </CompatButton>
            </>
          }
          onClose={() => {
            setAddingText("");
            setIsAdding(false);
          }}
          title="添加到剪切板"
        >
          <textarea
            aria-label="剪切板内容"
            className="clipboard-dialog__textarea"
            onChange={(event) => setAddingText(event.target.value)}
            placeholder="粘贴或输入要保存的文本内容"
            rows={6}
            value={addingText}
          />
        </Dialog>
      ) : null}

      {deletingEntry ? (
        <ConfirmDialog
          message="确定删除这条剪切板记录？"
          onCancel={() => setDeletingEntry(null)}
          onConfirm={confirmDelete}
          title="删除记录"
        />
      ) : null}

      {isClearing ? (
        <ConfirmDialog
          confirmLabel="清空"
          message="确定清空全部剪切板历史？此操作不可恢复。"
          onCancel={() => setIsClearing(false)}
          onConfirm={confirmClear}
          title="清空剪切板"
        />
      ) : null}
    </section>
  );
}

/** 相对时间显示：刚刚 / N 分钟前 / N 小时前 / M 月 D 日 */
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
