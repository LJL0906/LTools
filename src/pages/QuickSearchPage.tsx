import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Search, SearchX } from "lucide-react";
import { getAllData } from "../lib/data";
import { isTauriRuntime } from "../lib/data";
import type { LinkItem } from "../features/links/types";
import type { NoteItem } from "../features/notes/types";
import { getLinkUrl } from "../features/links/types";

interface SearchResult {
  kind: "link" | "note";
  id: string;
  title: string;
  subtitle: string;
  /** 链接的完整 URL（仅 link 类型） */
  url?: string;
}

/**
 * 快捷搜索独立窗口：全局搜索链接与笔记。
 * 由设置中的「快捷搜索快捷键」唤起（Rust 侧创建窗口并聚焦）。
 */
export function QuickSearchPage() {
  const [query, setQuery] = useState("");
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    void getAllData().then((all) => {
      if (disposed) return;
      setLinks(all.links);
      setNotes(all.notes);
      setLoaded(true);
    });
    return () => {
      disposed = true;
    };
  }, []);

  // 每次窗口获得焦点（快捷键唤起 / 任务栏点击 / 程序化显示）都聚焦输入框
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    try {
      void getCurrentWebviewWindow()
        .onFocusChanged(({ payload: focused }) => {
          if (focused) {
            inputRef.current?.focus();
          }
        })
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        })
        .catch(() => {
          // 非 Tauri / 受限环境静默降级
        });
    } catch {
      // 无 Tauri 运行时（浏览器 dev / 测试）忽略
    }
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Rust 侧 toggle 显示时主动通知聚焦（不依赖窗口系统 focus 事件）
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<null>("quick-search-shown", () => {
      inputRef.current?.focus();
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // 非 Tauri 环境静默降级
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // 打开窗口时自动聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, [loaded]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return [];
    const out: SearchResult[] = [];
    for (const link of links) {
      const haystack = `${link.title} ${getLinkUrl(link)} ${link.notes}`.toLocaleLowerCase();
      if (haystack.includes(q)) {
        out.push({
          kind: "link",
          id: link.id,
          title: link.title,
          subtitle: getLinkUrl(link),
          url: getLinkUrl(link),
        });
      }
    }
    for (const note of notes) {
      const text = note.content.replace(/<[^>]*>/g, " ").toLocaleLowerCase();
      const haystack = `${note.title} ${text}`;
      if (haystack.toLocaleLowerCase().includes(q)) {
        out.push({
          kind: "note",
          id: note.id,
          title: note.title,
          subtitle: note.content.replace(/<[^>]*>/g, " ").slice(0, 80),
        });
      }
    }
    return out.slice(0, 12);
  }, [links, notes, query]);

  const openResult = (result: SearchResult) => {
    if (result.kind === "link" && result.url) {
      // 链接：直接用系统默认浏览器打开
      void openUrl(result.url).catch(() => undefined);
      return;
    }
    // 笔记：唤起主窗口并选中该笔记（Rust 侧隐藏搜索窗口）
    void invoke("open_note_in_main", { noteId: result.id }).catch(() => undefined);
  };

  return (
    <div className="quick-search">
      <div className="quick-search__input-row">
        <Search aria-hidden="true" className="quick-search__icon" size={16} />
        <input
          aria-label="快捷搜索"
          autoFocus
          className="quick-search__input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索链接或笔记…"
          ref={inputRef}
          value={query}
        />
        <kbd className="quick-search__hint">Esc 关闭</kbd>
      </div>

      {query.trim() === "" ? (
        <div className="quick-search__placeholder">输入关键词开始搜索链接与笔记</div>
      ) : results.length === 0 ? (
        <div className="quick-search__placeholder">
          <SearchX aria-hidden="true" size={18} />
          没有找到匹配内容
        </div>
      ) : (
        <ul className="quick-search__list">
          {results.map((result) => (
            <li key={`${result.kind}-${result.id}`}>
              <button
                className="quick-search__item"
                onClick={() => openResult(result)}
                type="button"
              >
                <span className={`quick-search__badge quick-search__badge--${result.kind}`}>
                  {result.kind === "link" ? "链接" : "笔记"}
                </span>
                <span className="quick-search__item-body">
                  <span className="quick-search__item-title">{result.title}</span>
                  <span className="quick-search__item-subtitle">{result.subtitle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
