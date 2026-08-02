import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import { QuickSearchPage } from "./QuickSearchPage";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedOpenUrl = vi.mocked(openUrl);
const mockedListen = vi.mocked(listen);

function mockTauri(): void {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

const DB_DATA = {
  links: [
    {
      id: "l1",
      title: "API 文档",
      protocol: "https",
      address: "example.com/api",
      notes: "接口说明",
      groupId: null,
    },
  ],
  linkGroups: [],
  notes: [
    {
      id: "n1",
      title: "会议记录",
      content: "<p>讨论首版范围</p>",
      groupId: null,
      time: "",
    },
  ],
  noteGroups: [],
  clipboardItems: [],
};

describe("QuickSearchPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data") return Promise.resolve(DB_DATA);
      return Promise.resolve(undefined);
    });
  });

  it("searches links and notes from the data layer", async () => {
    mockTauri();
    const user = userEvent.setup();
    render(<QuickSearchPage />);

    await user.type(
      await screen.findByRole("textbox", { name: "快捷搜索" }),
      "API",
    );

    expect(await screen.findByText("API 文档")).toBeInTheDocument();
    expect(screen.queryByText("会议记录")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "快捷搜索" }));
    await user.type(screen.getByRole("textbox", { name: "快捷搜索" }), "范围");
    expect(await screen.findByText("会议记录")).toBeInTheDocument();
  });

  it("opens a link result in the system browser", async () => {
    mockTauri();
    const user = userEvent.setup();
    render(<QuickSearchPage />);

    await user.type(
      await screen.findByRole("textbox", { name: "快捷搜索" }),
      "API",
    );
    await user.click(await screen.findByText("API 文档"));

    expect(mockedOpenUrl).toHaveBeenCalledWith("https://example.com/api");
  });

  it("shows a placeholder when the query matches nothing", async () => {
    mockTauri();
    const user = userEvent.setup();
    render(<QuickSearchPage />);

    await user.type(
      await screen.findByRole("textbox", { name: "快捷搜索" }),
      "不存在的关键词",
    );

    expect(await screen.findByText("没有找到匹配内容")).toBeInTheDocument();
  });

  it("invokes open_note_in_main when a note result is clicked", async () => {
    mockTauri();
    const user = userEvent.setup();
    render(<QuickSearchPage />);

    await user.type(
      await screen.findByRole("textbox", { name: "快捷搜索" }),
      "范围",
    );
    await user.click(await screen.findByText("会议记录"));

    expect(mockedInvoke).toHaveBeenCalledWith("open_note_in_main", {
      noteId: "n1",
    });
  });

  it("focuses the input whenever the quick-search-shown event fires", async () => {
    mockTauri();
    let emitShown: () => void;
    mockedListen.mockImplementation((event, handler) => {
      if (event === "quick-search-shown") {
        emitShown = () =>
          act(() => handler({ event, id: 0, payload: null } as Event<null>));
      }
      return Promise.resolve(() => undefined as unknown as UnlistenFn);
    });

    render(<QuickSearchPage />);

    const input = (await screen.findByRole("textbox", {
      name: "快捷搜索",
    })) as HTMLInputElement;
    input.blur();
    expect(document.activeElement).not.toBe(input);

    // 模拟 Rust 侧每次显示窗口时推送的事件 → 输入框应重新聚焦
    act(() => emitShown());
    expect(document.activeElement).toBe(input);
  });
});
