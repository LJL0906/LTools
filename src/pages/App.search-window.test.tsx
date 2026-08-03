import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, type WebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "../App";

// 模拟当前窗口为快捷搜索窗口（label="search"）
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    label: "search",
    onFocusChanged: () => Promise.resolve(() => undefined),
  })),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedGetWindow = vi.mocked(getCurrentWebviewWindow);

const EMPTY_DB = {
  links: [],
  linkGroups: [],
  notes: [],
  noteGroups: [],
  clipboardItems: [],
};

function mockSearchWindow(): void {
  mockedGetWindow.mockReturnValue({
    label: "search",
    onFocusChanged: () => Promise.resolve(() => undefined),
  } as unknown as WebviewWindow);
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

describe("快捷搜索窗口路由隔离", () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom 的 history 在测试间不重置，重置到根路径避免上一个用例的路由残留
    window.history.pushState({}, "", "/");
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data") return Promise.resolve(EMPTY_DB);
      return Promise.resolve(undefined);
    });
  });

  it("初始加载（pathname=/）直接渲染快捷搜索界面，而非主窗口内容", async () => {
    mockSearchWindow();

    render(<App />);

    // 快捷搜索界面出现
    expect(await screen.findByLabelText("快捷搜索")).toBeInTheDocument();
    // 主窗口内容（链接模块的导航与按钮）不应出现
    expect(screen.queryByRole("link", { name: "链接" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加链接" })).not.toBeInTheDocument();
  });

  it("搜索窗口不监听 open-note（点击笔记的全局广播不会污染其路由）", async () => {
    mockSearchWindow();

    render(<App />);
    await screen.findByLabelText("快捷搜索");

    // 搜索窗口不应注册 open-note 监听（该事件只对主窗口有意义）
    const openNoteCalls = vi
      .mocked(listen)
      .mock.calls.filter(([name]) => name === "open-note");
    expect(openNoteCalls).toHaveLength(0);

    // 界面稳定为快捷搜索
    expect(screen.getByLabelText("快捷搜索")).toBeInTheDocument();
  });

  it("主窗口正常监听 open-note 并跳转到笔记页", async () => {
    mockedGetWindow.mockReturnValue({
      label: "main",
      onFocusChanged: () => Promise.resolve(() => undefined),
    } as unknown as WebviewWindow);
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

    render(<App />);
    // 主窗口初始为链接模块
    expect(await screen.findByRole("button", { name: "添加链接" })).toBeInTheDocument();

    // 主窗口注册了 open-note 监听
    const handler = vi
      .mocked(listen)
      .mock.calls.find(([name]) => name === "open-note")?.[1];
    expect(handler).toBeDefined();

    // 模拟 Rust open_note_in_main 广播
    await act(async () => {
      handler?.({ payload: "n1", id: 1, event: "open-note" });
    });

    // 主窗口跳转到笔记页
    expect(window.location.pathname).toBe("/notes");
  });
});
