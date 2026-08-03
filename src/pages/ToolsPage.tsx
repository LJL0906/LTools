import { useEffect, useRef, useState } from "react";
import { ModuleLayout } from "../components/layout/ModuleLayout";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { JsonPanel, type JsonViewMode } from "../features/tools/JsonPanel";
import { deleteJsonTab, loadToolsData, upsertJsonTab } from "../lib/data";
import type { JsonTabItem } from "../lib/data";

/** 顶部工具 tab（当前仅 JSON 格式化，未来加工具时扩展数组） */
const TOOL_TABS = [{ id: "json", label: "JSON 格式化" }];

/** 输入变化后的持久化防抖（每次只落最后一次） */
const SAVE_DEBOUNCE_MS = 300;

/** 生成一个空的 JSON 格式化页签（标题随已有数量递增） */
function createTab(ordinal: number): JsonTabItem {
  return {
    id: crypto.randomUUID(),
    title: `JSON 格式化 ${ordinal + 1}`,
    input: "",
    mode: "format",
  };
}

/**
 * 工具模块：顶部为工具 tab（未来多工具），左侧为 JSON 格式化页签列表，
 * 右侧为当前页签的工作区（JSON 输入 → 格式化/压缩预览）。
 *
 * 数据流：页签列表从 loadToolsData() 异步加载；新建/删除/输入变更均持久化，
 * 输入变更走 300ms 防抖（组件卸载时清掉未落盘的定时器）。
 */
export function ToolsPage() {
  const [activeTool] = useState("json");
  const [tabs, setTabs] = useState<JsonTabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [loading, setLoading] = useState(true);

  /** 正在改名的页签 id 与草稿（null = 未在改名） */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  /** 待删除页签 id（非 null 时显示二次确认框） */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  /** 每个页签独立的防抖保存定时器（避免快速切换页签时互相覆盖） */
  const saveTimersRef = useRef<Map<string, number>>(new Map());

  // 首次加载：Tauri 用 SQLite 数据，浏览器降级读 localStorage
  useEffect(() => {
    let disposed = false;
    void loadToolsData().then((loaded) => {
      if (disposed) return;
      if (loaded.length === 0) {
        // 空列表自动补一个空页签（与删除清空后的行为一致）
        const tab = createTab(0);
        setTabs([tab]);
        setActiveTabId(tab.id);
        upsertJsonTab(tab);
      } else {
        setTabs(loaded);
        setActiveTabId(loaded[0].id);
      }
      setLoading(false);
    });
    return () => {
      disposed = true;
    };
  }, []);

  // 组件卸载：清掉未落盘的防抖保存定时器
  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  /** 待删除页签对象（确认框文案用；已被删/不存在时为 null） */
  const pendingDeleteTab =
    pendingDeleteId !== null
      ? (tabs.find((tab) => tab.id === pendingDeleteId) ?? null)
      : null;

  /** 300ms 防抖持久化：同一页签多次变更只落最后一次 */
  const scheduleSave = (tab: JsonTabItem) => {
    const timers = saveTimersRef.current;
    const existing = timers.get(tab.id);
    if (existing !== undefined) window.clearTimeout(existing);
    timers.set(
      tab.id,
      window.setTimeout(() => {
        timers.delete(tab.id);
        upsertJsonTab(tab);
      }, SAVE_DEBOUNCE_MS),
    );
  };

  /** 丢弃某个页签尚未落盘的保存（删除前调用，避免删除后又被写回） */
  const cancelPendingSave = (id: string) => {
    const timers = saveTimersRef.current;
    const existing = timers.get(id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      timers.delete(id);
    }
  };

  const updateActiveTab = (changes: Partial<JsonTabItem>) => {
    if (!activeTab) return;
    const updated = { ...activeTab, ...changes };
    setTabs((current) =>
      current.map((tab) => (tab.id === updated.id ? updated : tab)),
    );
    scheduleSave(updated);
  };

  const handleCreateTab = () => {
    const tab = createTab(tabs.length);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
    upsertJsonTab(tab);
  };

  /** 进入改名状态（双击页签标题触发）：回填当前标题并聚焦全选 */
  const startRename = (tab: JsonTabItem) => {
    setRenamingId(tab.id);
    setRenameDraft(tab.title);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  };

  /** 提交改名：空标题或未变化时回退原名；成功立即持久化 */
  const commitRename = () => {
    if (renamingId === null) return;
    const id = renamingId;
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    const tab = tabs.find((t) => t.id === id);
    if (!tab || tab.title === title) return;
    const updated = { ...tab, title };
    setTabs((current) =>
      current.map((t) => (t.id === updated.id ? updated : t)),
    );
    upsertJsonTab(updated);
  };

  /** 取消改名（Esc） */
  const cancelRename = () => {
    setRenamingId(null);
  };

  const handleDeleteTab = (id: string) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;
    // 删除中的页签若正在改名，一并退出改名状态
    if (renamingId === id) setRenamingId(null);
    cancelPendingSave(id);
    deleteJsonTab(id);
    const next = tabs.filter((tab) => tab.id !== id);
    if (next.length === 0) {
      // 删空后自动新建一个空页签
      const tab = createTab(0);
      setTabs([tab]);
      setActiveTabId(tab.id);
      upsertJsonTab(tab);
      return;
    }
    setTabs(next);
    // 仅当删除的是当前活动页签时才切换选中（优先下一个，其次上一个）
    if (id === activeTabId) {
      setActiveTabId(next[Math.min(index, next.length - 1)].id);
    }
  };

  return (
    <div className="tools-page">
      <div
        aria-label="工具"
        className="tools-page__toolbar"
        role="tablist"
      >
        {TOOL_TABS.map((tab) => (
          <button
            aria-selected={activeTool === tab.id}
            className="tools-page__tool-tab"
            key={tab.id}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <ModuleLayout
        maxSidebarWidth={220}
        minSidebarWidth={150}
        sidebar={
          <nav aria-label="JSON 格式化页签" className="tools-page__menu">
            <button
              className="tools-page__new-tab"
              onClick={handleCreateTab}
              type="button"
            >
              + 新建格式化
            </button>
            <div className="tools-page__tabs">
              {tabs.map((tab) => (
                <div
                  className={`tools-page__tab-item${
                    activeTabId === tab.id ? " is-active" : ""
                  }`}
                  key={tab.id}
                >
                  {renamingId === tab.id ? (
                    <input
                      aria-label="页签名称"
                      className="tools-page__tab-rename"
                      onBlur={commitRename}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                      ref={renameInputRef}
                      value={renameDraft}
                    />
                  ) : (
                    <button
                      aria-pressed={activeTabId === tab.id}
                      className="tools-page__tab-title"
                      onClick={() => setActiveTabId(tab.id)}
                      onDoubleClick={() => startRename(tab)}
                      type="button"
                    >
                      {tab.title}
                    </button>
                  )}
                  <button
                    aria-label={`删除 ${tab.title}`}
                    className="tools-page__tab-delete"
                    onClick={(event) => {
                      // 防止冒泡触发页签选中
                      event.stopPropagation();
                      // 二次确认后才会真正删除
                      setPendingDeleteId(tab.id);
                    }}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </nav>
        }
        sidebarStateKey="tools"
        sidebarWidth={180}
      >
        {loading ? (
          <div className="tools-page__loading">加载中…</div>
        ) : activeTab ? (
          // key 随页签变化：切换页签时强制重挂载，立即重置预览/折叠状态，
          // 避免 300ms 防抖窗口内闪现上一个页签的内容
          <JsonPanel
            input={activeTab.input}
            key={activeTab.id}
            mode={activeTab.mode}
            onClear={() => updateActiveTab({ input: "" })}
            onInputChange={(input) => updateActiveTab({ input })}
            onModeChange={(mode: JsonViewMode) => updateActiveTab({ mode })}
          />
        ) : null}
      </ModuleLayout>

      {/* 删除页签二次确认 */}
      {pendingDeleteTab ? (
        <ConfirmDialog
          confirmLabel="删除"
          message={`确定删除“${pendingDeleteTab.title}”？`}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            handleDeleteTab(pendingDeleteTab.id);
            setPendingDeleteId(null);
          }}
          title="删除页签"
        />
      ) : null}
    </div>
  );
}
