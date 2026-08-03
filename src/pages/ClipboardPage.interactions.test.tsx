import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import App from "../App";
import {
  CLIPBOARD_MAX_ITEMS,
  CLIPBOARD_CHANGED_EVENT,
} from "../features/clipboard/types";
import { STORAGE_KEYS } from "../lib/storage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedListen = vi.mocked(listen);
const mockedInvoke = vi.mocked(invoke);

describe("ClipboardPage interactions", () => {
  /** 模拟 Rust 侧系统剪贴板监听推送 */
  let emitClipboard: (text: string) => void;

  beforeEach(() => {
    localStorage.clear();
    mockedInvoke.mockClear();
    window.history.replaceState({}, "", "/clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    mockedListen.mockImplementation((event, handler) => {
      if (event === CLIPBOARD_CHANGED_EVENT) {
        // 事件推送触发 setState，必须包在 act 内，否则 React 合成事件系统
        // 会忽略后续 user-event 派发的点击（React 19 + Testing Library 行为）
        emitClipboard = (text) =>
          act(() => handler({ event, id: 0, payload: text } as Event<string>));
      }
      return Promise.resolve(() => undefined as unknown as UnlistenFn);
    });
  });

  it("shows the empty state when there are no entries", () => {
    render(<App />);

    expect(screen.getByText("剪切板为空")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "清空全部" })).not.toBeInTheDocument();
  });

  it("adds an entry manually and persists it to localStorage", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "添加" }));
    await user.type(
      screen.getByRole("textbox", { name: "剪切板内容" }),
      "手动添加的内容",
    );
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("手动添加的内容")).toBeInTheDocument();

    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.clipboardItems) ?? "[]",
      );
      expect(
        saved.some(
          (entry: { text: string }) => entry.text === "手动添加的内容",
        ),
      ).toBe(true);
    });
  });

  it("adds entries pushed from the system clipboard watcher", async () => {
    render(<App />);

    emitClipboard("来自系统剪贴板");

    expect(await screen.findByText("来自系统剪贴板")).toBeInTheDocument();
  });

  it("deduplicates identical text pushed repeatedly", async () => {
    render(<App />);

    emitClipboard("同一段文本");
    await screen.findByText("同一段文本");
    emitClipboard("同一段文本");

    await waitFor(() => {
      expect(screen.getAllByText("同一段文本")).toHaveLength(1);
    });
  });

  it("opens the detail dialog and copies the full text from it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const user = userEvent.setup();
    render(<App />);

    emitClipboard("多行内容\n第二行\n第三行");
    await screen.findByText(/多行内容/);

    await user.click(screen.getByRole("button", { name: "查看详情" }));
    const dialog = screen.getByRole("dialog", { name: "剪切板详情" });
    expect(within(dialog).getByText(/多行内容/)).toBeInTheDocument();
    expect(within(dialog).getByText(/第二行/)).toBeInTheDocument();

    // user-event 的 click 会把 navigator.clipboard 替换为内部 stub，
    // 复制前重新定义恢复外部 mock
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    // 注：复制路径用 fireEvent（与链接页一致）——user-event 的 click 会
    // 把 navigator.clipboard 替换为内部 stub，导致外部 mock 失效
    fireEvent.click(within(dialog).getByRole("button", { name: "复制" }));
    await act(async () => Promise.resolve());

    expect(writeText).toHaveBeenCalledWith("多行内容\n第二行\n第三行");
    expect(
      within(dialog).getByRole("button", { name: "已复制" }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps only the latest 30 entries", async () => {
    render(<App />);

    for (let i = 0; i < CLIPBOARD_MAX_ITEMS + 5; i++) {
      emitClipboard(`内容 ${i}`);
    }

    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(CLIPBOARD_MAX_ITEMS);
    });
    expect(screen.getByText(`内容 ${CLIPBOARD_MAX_ITEMS + 4}`)).toBeInTheDocument();
    expect(screen.queryByText("内容 0")).not.toBeInTheDocument();
  });

  it("copies text back to the clipboard with feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    emitClipboard("可复制的内容");
    await screen.findByText("可复制的内容");

    // 注：复制路径用 fireEvent（与链接页一致）——user-event 的 click 会
    // 把 navigator.clipboard 替换为内部 stub，导致外部 mock 失效
    fireEvent.click(screen.getByRole("button", { name: "复制 可复制的内容" }));
    await act(async () => Promise.resolve());

    expect(writeText).toHaveBeenCalledWith("可复制的内容");
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
  });

  it("shows a failure alert when writing to the clipboard fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    emitClipboard("无法写入的内容");
    await screen.findByText("无法写入的内容");

    fireEvent.click(screen.getByRole("button", { name: "复制 无法写入的内容" }));
    await act(async () => Promise.resolve());

    expect(await screen.findByRole("alert")).toHaveTextContent("复制失败");
  });

  it("deletes an entry after confirmation", async () => {
    const user = userEvent.setup();
    render(<App />);

    emitClipboard("要删除的条目");
    await screen.findByText("要删除的条目");

    const item = screen
      .getByRole("button", { name: "复制 要删除的条目" })
      .closest("li");
    expect(item).not.toBeNull();
    await user.click(within(item as HTMLElement).getByRole("button", { name: "删除" }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(screen.queryByText("要删除的条目")).not.toBeInTheDocument();
    });
  });

  it("clears all entries after confirmation", async () => {
    const user = userEvent.setup();
    render(<App />);

    emitClipboard("条目甲");
    emitClipboard("条目乙");
    await screen.findByText("条目甲");

    await user.click(screen.getByRole("button", { name: "清空全部" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "清空" }));

    expect(screen.getByText("剪切板为空")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "清空全部" })).not.toBeInTheDocument();
  });

  it("filters entries through the global search box", async () => {
    const user = userEvent.setup();
    render(<App />);

    emitClipboard("设计规范文档");
    await screen.findByText("设计规范文档");
    emitClipboard("会议记录");
    await screen.findByText("会议记录");

    await user.type(screen.getByRole("searchbox", { name: "搜索剪切板" }), "设计");

    expect(screen.getByText("设计规范文档")).toBeInTheDocument();
    expect(screen.queryByText("会议记录")).not.toBeInTheDocument();
  });

  it("shows the no-match state when search finds nothing", async () => {
    const user = userEvent.setup();
    render(<App />);

    emitClipboard("设计规范文档");
    await screen.findByText("设计规范文档");

    await user.type(screen.getByRole("searchbox", { name: "搜索剪切板" }), "不存在的关键词");

    expect(screen.getByText("没有找到匹配的剪切板内容")).toBeInTheDocument();
  });

  it("restores persisted entries on reload", () => {
    localStorage.setItem(
      STORAGE_KEYS.clipboardItems,
      JSON.stringify([
        {
          id: "saved-1",
          text: "恢复的历史条目",
          createdAt: Date.now(),
        },
      ]),
    );

    render(<App />);

    expect(screen.getByText("恢复的历史条目")).toBeInTheDocument();
  });

  it("persists via per-item CRUD commands in the Tauri runtime", async () => {
    // 模拟 Tauri 运行时：get_all_data 返回空库，其余命令返回 undefined
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data") {
        return Promise.resolve({
          links: [],
          linkGroups: [],
          notes: [],
          noteGroups: [],
          clipboardItems: [],
        });
      }
      return Promise.resolve(undefined);
    });

    try {
      const user = userEvent.setup();
      render(<App />);

      // 等待首次加载（get_all_data 空库）完成，模拟真实时序：启动加载先于用户操作
      await screen.findByText("剪切板为空");

      // 监听推送新增 → upsert_clipboard_item
      emitClipboard("CRUD 条目");
      await screen.findByText("CRUD 条目");
      expect(mockedInvoke).toHaveBeenCalledWith(
        "upsert_clipboard_item",
        expect.objectContaining({
          item: expect.objectContaining({ text: "CRUD 条目" }),
        }),
      );

      // 去重置顶：被挤掉的旧条目逐条删除
      emitClipboard("另一条");
      await screen.findByText("另一条");
      emitClipboard("CRUD 条目");
      await waitFor(() => {
        expect(screen.getAllByText("CRUD 条目")).toHaveLength(1);
      });
      expect(mockedInvoke).toHaveBeenCalledWith(
        "delete_clipboard_item",
        expect.objectContaining({ id: expect.any(String) }),
      );

      // 单条删除 → delete_clipboard_item
      const item = screen
        .getByRole("button", { name: "复制 CRUD 条目" })
        .closest("li");
      expect(item).not.toBeNull();
      await user.click(within(item as HTMLElement).getByRole("button", { name: "删除" }));
      let dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "删除" }));
      await waitFor(() => {
        expect(screen.queryByText("CRUD 条目")).not.toBeInTheDocument();
      });

      // 清空全部 → clear_clipboard_items
      emitClipboard("待清空条目");
      await screen.findByText("待清空条目");
      await user.click(screen.getByRole("button", { name: "清空全部" }));
      dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "清空" }));
      expect(screen.getByText("剪切板为空")).toBeInTheDocument();
      expect(mockedInvoke).toHaveBeenCalledWith("clear_clipboard_items");
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });

  it("trims the oldest entries via per-item deletes in the Tauri runtime", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data") {
        return Promise.resolve({
          links: [],
          linkGroups: [],
          notes: [],
          noteGroups: [],
          clipboardItems: [],
        });
      }
      return Promise.resolve(undefined);
    });

    try {
      render(<App />);

      // 等待首次加载完成，再推送监听事件（真实时序：启动加载先于剪贴板写入）
      await screen.findByText("剪切板为空");

      for (let i = 0; i < CLIPBOARD_MAX_ITEMS + 5; i++) {
        emitClipboard(`裁剪内容 ${i}`);
      }

      await waitFor(() => {
        expect(screen.getAllByRole("listitem")).toHaveLength(CLIPBOARD_MAX_ITEMS);
      });
      expect(screen.getByText(`裁剪内容 ${CLIPBOARD_MAX_ITEMS + 4}`)).toBeInTheDocument();
      expect(screen.queryByText("裁剪内容 0")).not.toBeInTheDocument();

      // 新增 35 条 → 35 次 upsert；超出 30 条上限 → 5 次裁剪删除
      expect(
        mockedInvoke.mock.calls.filter(
          ([cmd]) => cmd === "upsert_clipboard_item",
        ),
      ).toHaveLength(CLIPBOARD_MAX_ITEMS + 5);
      expect(
        mockedInvoke.mock.calls.filter(
          ([cmd]) => cmd === "delete_clipboard_item",
        ),
      ).toHaveLength(5);
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    }
  });
});
