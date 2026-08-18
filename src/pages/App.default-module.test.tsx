import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import App from "../App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

const mockedInvoke = vi.mocked(invoke);

const DB_WITH_NOTE = {
  links: [],
  linkGroups: [],
  notes: [
    {
      id: "meeting",
      title: "项目会议记录",
      content: "<p>本次会议确认首版功能范围。</p>",
      groupId: "project-a",
      time: "今天 14:32",
    },
  ],
  noteGroups: [{ id: "project-a", name: "项目 A" }],
  clipboardItems: [],
  jsonTabs: [],
};

describe("主窗口默认显示模块", () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom 的 history 在测试间不重置，重置到根路径避免上一个用例的路由残留
    window.history.pushState({}, "", "/");
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data") return Promise.resolve(DB_WITH_NOTE);
      if (cmd === "get_settings") {
        return Promise.resolve({ default_module: "notes" });
      }
      return Promise.resolve(undefined);
    });
  });

  it("Tauri 环境：设置 default_module=notes 时启动默认进入笔记模块", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

    render(<App />);

    // 等待异步设置加载 + 跳转到笔记模块
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "笔记" })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
    expect(screen.getByRole("heading", { name: "项目会议记录" })).toBeInTheDocument();
  });

  it("浏览器降级：localStorage 配置 default_module=clipboard 时默认进入剪切板模块", async () => {
    localStorage.setItem(
      "ltools.settings",
      JSON.stringify({ default_module: "clipboard" }),
    );

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "剪切板" })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
  });

  it("未配置默认模块时回退到链接模块", async () => {
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data") return Promise.resolve(DB_WITH_NOTE);
      if (cmd === "get_settings") {
        return Promise.resolve({ default_module: "非法值" });
      }
      return Promise.resolve(undefined);
    });
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "链接" })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
  });
});
