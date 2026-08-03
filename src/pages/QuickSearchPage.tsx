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
import { loadState, saveState, STORAGE_KEYS } from "../lib/storage";

interface SearchResult {
  kind: "link" | "note";
  id: string;
  title: string;
  subtitle: string;
  /** 链接的完整 URL（仅 link 类型） */
  url?: string;
}

/** 最近打开的历史条目数量上限 */
const MAX_HISTORY = 5;

/** 无本地结果时用百度搜索关键词（打开系统默认浏览器） */
const BAIDU_SEARCH_URL = "https://www.baidu.com/s";

/**
 * 快捷搜索独立窗口：全局搜索链接与笔记。
 * 由设置中的「快捷搜索快捷键」唤起（Rust 侧创建窗口并聚焦）。
 */
export function QuickSearchPage() {
  const [query, setQuery] = useState("");
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 最近打开的历史条目（空输入时展示；持久化到 localStorage）
  const [history, setHistory] = useState<SearchResult[]>(() =>
    loadState<SearchResult[]>(STORAGE_KEYS.searchHistory, []),
  );
  // 键盘上下选择的条目索引（0 起；列表末尾为百度搜索兜底条目）
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 历史变更时持久化（打开条目是低频操作，直接同步写入）
  useEffect(() => {
    saveState(STORAGE_KEYS.searchHistory, history);
  }, [history]);

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
            // 每次唤起都视为全新搜索：清空输入，回到「最近使用」历史列表
            setQuery("");
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
      // 每次窗口显示都清空输入并聚焦，展示「最近使用」历史
      setQuery("");
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

  // 无本地结果时的百度搜索兜底条目（仅 query 非空且无结果时显示）
  const baiduQuery = query.trim();
  const showBaiduItem = baiduQuery !== "" && results.length === 0;
  // 展示列表：输入为空 → 最近历史；输入非空 → 搜索结果
  const isEmptyQuery = baiduQuery === "";
  const displayItems = isEmptyQuery ? history : results;
  // 键盘导航条目总数 = 展示列表 + 百度兜底
  const totalItems = displayItems.length + (showBaiduItem ? 1 : 0);

  // 输入变化时重置选中到第一项
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  /** 记录一条打开历史：去重置顶，只保留最新 MAX_HISTORY 条 */
  const recordHistory = (result: SearchResult) => {
    setHistory((prev) => [
      result,
      ...prev.filter((h) => !(h.kind === result.kind && h.id === result.id)),
    ].slice(0, MAX_HISTORY));
  };

  /** 打开本地结果（链接走系统浏览器 / 笔记唤起主窗口） */
  const openResult = (result: SearchResult) => {
    recordHistory(result);
    if (result.kind === "link" && result.url) {
      // 链接：直接用系统默认浏览器打开
      void openUrl(result.url).catch(() => undefined);
      return;
    }
    // 笔记：唤起主窗口并选中该笔记（Rust 侧隐藏搜索窗口）
    void invoke("open_note_in_main", { noteId: result.id }).catch(() => undefined);
  };

  /** 打开当前选中条目（本地结果或百度搜索） */
  const openActive = () => {
    if (totalItems === 0) return;
    const idx = Math.min(activeIndex, totalItems - 1);
    if (idx < displayItems.length) {
      openResult(displayItems[idx]);
    } else if (showBaiduItem) {
      const url = `${BAIDU_SEARCH_URL}?wd=${encodeURIComponent(baiduQuery)}`;
      void openUrl(url).catch(() => undefined);
    }
  };

  /**
   * 键盘导航核心逻辑（↑/↓ 循环移动选中，Enter 打开选中项）。
   * 同时服务于输入框 onKeyDown 与窗口级 keydown（输入框失焦后仍可用）。
   */
  const handleListKey = (key: string, preventDefault: () => void) => {
    if (key === "ArrowDown") {
      preventDefault();
      if (totalItems > 0) setActiveIndex((i) => (i + 1) % totalItems);
    } else if (key === "ArrowUp") {
      preventDefault();
      if (totalItems > 0) setActiveIndex((i) => (i - 1 + totalItems) % totalItems);
    } else if (key === "Enter") {
      preventDefault();
      openActive();
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) =>
    handleListKey(event.key, () => event.preventDefault());

  // 窗口级键盘监听：输入框失焦（点击结果/空白区域）后 ↑/↓/Enter 仍生效；
  // 焦点在输入框时由 onKeyDown 处理，避免重复触发。
  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.target === inputRef.current) return;
      handleListKey(event.key, () => event.preventDefault());
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [activeIndex, baiduQuery, displayItems, showBaiduItem, totalItems]);

  /** 渲染单个条目（历史与搜索结果共用，badge 区分链接/笔记） */
  const renderResultItem = (result: SearchResult, index: number) => (
    <li key={`${result.kind}-${result.id}`}>
      <button
        aria-selected={index === activeIndex}
        className={`quick-search__item${index === activeIndex ? " quick-search__item--active" : ""}`}
        onClick={() => openResult(result)}
        onMouseEnter={() => setActiveIndex(index)}
        role="option"
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
  );

  return (
    <div className="quick-search">
      <div className="quick-search__input-row">
        <Search aria-hidden="true" className="quick-search__icon" size={16} />
        <input
          aria-label="快捷搜索"
          autoFocus
          className="quick-search__input"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="搜索链接或笔记…"
          ref={inputRef}
          value={query}
        />
        <kbd className="quick-search__hint">Esc 关闭</kbd>
      </div>

      {isEmptyQuery ? (
        history.length > 0 ? (
          <>
            <div className="quick-search__section-title">最近使用</div>
            <ul className="quick-search__list" role="listbox" aria-label="最近使用">
              {history.map(renderResultItem)}
            </ul>
          </>
        ) : (
          <div className="quick-search__placeholder">输入关键词开始搜索链接与笔记</div>
        )
      ) : totalItems === 0 ? (
        <div className="quick-search__placeholder">
          <SearchX aria-hidden="true" size={18} />
          没有找到匹配内容
        </div>
      ) : (
        <ul className="quick-search__list" role="listbox" aria-label="搜索结果">
          {results.map(renderResultItem)}
          {showBaiduItem && (
            <li>
              <button
                aria-selected={results.length === activeIndex}
                className={`quick-search__item quick-search__item--web${
                  results.length === activeIndex ? " quick-search__item--active" : ""
                }`}
                onClick={() => {
                  const url = `${BAIDU_SEARCH_URL}?wd=${encodeURIComponent(baiduQuery)}`;
                  void openUrl(url).catch(() => undefined);
                }}
                onMouseEnter={() => setActiveIndex(results.length)}
                role="option"
                type="button"
              >
                <span className="quick-search__badge quick-search__badge--web">百度</span>
                <span className="quick-search__item-body">
                  <span className="quick-search__item-title">
                    在百度中搜索「{baiduQuery}」
                  </span>
                  <span className="quick-search__item-subtitle">
                    {BAIDU_SEARCH_URL}?wd={baiduQuery}
                  </span>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
