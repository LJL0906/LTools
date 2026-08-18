import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import App, { NoteTargetContext } from "../App";
import { NotesPage } from "./NotesPage";
import type { AppOutletContext } from "../components/layout/AppShell";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

/** 模拟主窗口壳：为 NotesPage 提供 useOutletContext 的 searchQuery */
function NotesShell() {
  return <Outlet context={{ searchQuery: "" } satisfies AppOutletContext} />;
}

describe("notes static interactions", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/notes");
  });

  it("filters the note list from the module search field", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("searchbox", { name: "搜索笔记" }), "接口");

    expect(screen.getByRole("button", { name: "接口排查记录" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "项目会议记录" }),
    ).not.toBeInTheDocument();
  });

  it("creates, edits, formats, and deletes an in-memory note", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "新建笔记" }));

    const title = screen.getByRole("textbox", { name: "笔记标题" });
    expect(title).toHaveValue("未命名笔记");

    await user.clear(title);
    await user.type(title, "临时记录");
    expect(screen.getByRole("button", { name: "临时记录" })).toBeInTheDocument();

    // 先聚焦编辑器建立选区，再验证格式化状态真实生效
    const noteContent = screen.getByRole("textbox", { name: "笔记内容" });
    await user.click(noteContent);

    const bold = screen.getByRole("button", { name: "粗体" });
    await user.click(bold);
    expect(bold).toHaveAttribute("aria-pressed", "true");
    // 再点一次应真实关闭格式（由编辑器内部状态驱动）
    await user.click(bold);
    expect(bold).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "删除笔记" }));
    expect(screen.getByRole("dialog", { name: "删除笔记" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(screen.queryByRole("button", { name: "临时记录" })).not.toBeInTheDocument();
  });
  it("shows all notes flat and keeps the editor aligned with the selected note", async () => {
    const user = userEvent.setup();
    render(<App />);

    // 侧栏平铺展示全部笔记，默认选中第一项
    expect(screen.getByRole("button", { name: "项目会议记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "接口排查记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布检查清单" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "笔记标题" })).toHaveValue(
      "项目会议记录",
    );

    // 点击另一条 → 编辑器跟随
    await user.click(screen.getByRole("button", { name: "发布检查清单" }));
    expect(screen.getByRole("textbox", { name: "笔记标题" })).toHaveValue(
      "发布检查清单",
    );
  });

  it("keeps the notes shell available after deleting every note", async () => {
    const user = userEvent.setup();
    render(<App />);

    for (let index = 0; index < 3; index += 1) {
      await user.click(screen.getByRole("button", { name: "删除笔记" }));
      await user.click(screen.getByRole("button", { name: "删除" }));
    }

    expect(screen.getByRole("button", { name: "新建笔记" })).toBeInTheDocument();
    expect(screen.getByText("暂无笔记")).toBeInTheDocument();
  });

  it("inserts a link with the toolbar link button", async () => {
    vi.stubGlobal("prompt", () => "https://example.com");
    const user = userEvent.setup();
    render(<App />);

    const noteContent = screen.getByRole("textbox", { name: "笔记内容" });
    await user.click(noteContent);

    const linkButton = screen.getByRole("button", { name: "插入链接" });
    await user.click(linkButton);

    // 链接 mark 已应用到当前选区，按钮状态由编辑器内部驱动
    expect(linkButton).toHaveAttribute("aria-pressed", "true");
    vi.unstubAllGlobals();
  });

  it("syncs the rich text editor when switching notes", async () => {
    const user = userEvent.setup();
    render(<App />);

    const mirror = document.querySelector(".ProseMirror");
    expect(mirror?.textContent).toContain("本次会议确认首版功能范围");

    await user.click(screen.getByRole("button", { name: "接口排查记录" }));

    expect(document.querySelector(".ProseMirror")?.textContent).toContain(
      "记录接口排查过程",
    );
  });
});

describe("notes CRUD persistence (Tauri per-record commands)", () => {
  /** SQLite 首次加载的返回数据（保持 get_all_data 全量读不变） */
  const NOTES_DB = {
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
      {
        id: "api-debug",
        title: "接口排查记录",
        content: "<p>记录接口排查过程。</p>",
        groupId: "work",
        time: "昨天 18:10",
      },
      {
        id: "release-check",
        title: "发布检查清单",
        content: "<p>确认发布前检查项。</p>",
        groupId: null,
        time: "7 月 28 日",
      },
    ],
    noteGroups: [
      { id: "work", name: "工作" },
      { id: "project-a", name: "项目 A" },
    ],
    clipboardItems: [],
    jsonTabs: [],
  };

  function renderNotesPage() {
    return render(
      <MemoryRouter>
        <Routes>
          <Route element={<NotesShell />}>
            <Route path="/" element={<NotesPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    window.history.replaceState({}, "", "/notes");
    vi.clearAllMocks();
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data") return Promise.resolve(NOTES_DB);
      return Promise.resolve(undefined);
    });
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("persists a new note via upsert_note", async () => {
    const user = userEvent.setup();
    renderNotesPage();

    await screen.findByRole("button", { name: "项目会议记录" });
    mockedInvoke.mockClear();

    await user.click(screen.getByRole("button", { name: "新建笔记" }));

    expect(mockedInvoke).toHaveBeenCalledWith(
      "upsert_note",
      expect.objectContaining({
        note: expect.objectContaining({ id: expect.any(String), title: "未命名笔记" }),
      }),
    );
  });

  it("persists note edits via upsert_note", async () => {
    const user = userEvent.setup();
    renderNotesPage();

    await screen.findByRole("button", { name: "项目会议记录" });
    mockedInvoke.mockClear();

    const title = screen.getByRole("textbox", { name: "笔记标题" });
    await user.clear(title);
    await user.type(title, "重构后的标题");

    expect(mockedInvoke).toHaveBeenCalledWith(
      "upsert_note",
      expect.objectContaining({
        note: expect.objectContaining({ id: "meeting", title: "重构后的标题" }),
      }),
    );
  });

  it("persists note deletion via delete_note", async () => {
    const user = userEvent.setup();
    renderNotesPage();

    await screen.findByRole("button", { name: "项目会议记录" });
    mockedInvoke.mockClear();

    await user.click(screen.getByRole("button", { name: "删除笔记" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(mockedInvoke).toHaveBeenCalledWith("delete_note", { id: "meeting" });
  });

  it("renames a note via the item menu and persists it", async () => {
    const user = userEvent.setup();
    renderNotesPage();

    await screen.findByRole("button", { name: "项目会议记录" });
    mockedInvoke.mockClear();

    await user.click(screen.getByRole("button", { name: "操作 项目会议记录" }));
    await user.click(screen.getByRole("button", { name: "重命名" }));

    const nameInput = screen.getByRole("textbox", { name: "标题" });
    await user.clear(nameInput);
    await user.type(nameInput, "改名后的会议记录");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(mockedInvoke).toHaveBeenCalledWith(
      "upsert_note",
      expect.objectContaining({
        note: expect.objectContaining({ id: "meeting", title: "改名后的会议记录" }),
      }),
    );
    // 侧栏与编辑器同步更新
    expect(
      screen.getByRole("button", { name: "改名后的会议记录" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "笔记标题" })).toHaveValue(
      "改名后的会议记录",
    );
  });

  it("deletes a note through the item menu", async () => {
    const user = userEvent.setup();
    renderNotesPage();

    await screen.findByRole("button", { name: "接口排查记录" });
    mockedInvoke.mockClear();

    await user.click(screen.getByRole("button", { name: "操作 接口排查记录" }));
    // 菜单内选择「删除笔记」（编辑器右上角有同名按钮，需限定作用域；
    // 侧栏标题与菜单标题都含「接口排查记录」，用 getAllByText 定位菜单容器）
    const menu = screen
      .getAllByText("接口排查记录")
      .map((el) => el.closest(".group-menu"))
      .find((el) => el !== null);
    expect(menu).not.toBeNull();
    await user.click(within(menu as HTMLElement).getByRole("button", { name: "删除笔记" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(mockedInvoke).toHaveBeenCalledWith("delete_note", { id: "api-debug" });
    expect(
      screen.queryByRole("button", { name: "接口排查记录" }),
    ).not.toBeInTheDocument();
  });

  it("reorders notes by dragging onto another item", async () => {
    renderNotesPage();
    await screen.findByRole("button", { name: "项目会议记录" });

    const firstLi = screen.getByRole("button", { name: "项目会议记录" }).closest("li") as HTMLElement;
    const third = screen.getByRole("button", { name: "发布检查清单" }).closest("li") as HTMLElement;

    fireEvent.dragStart(firstLi, {
      dataTransfer: { setData: () => undefined, effectAllowed: "" },
    });
    fireEvent.dragOver(third, {
      dataTransfer: { dropEffect: "" },
    });
    fireEvent.drop(third, {
      dataTransfer: { getData: () => "meeting" },
    });
    fireEvent.dragEnd(firstLi);

    // 把第一项拖到第三项上方 → 插到第三项之前，顺序为 接口排查记录 / 发布检查清单 / 项目会议记录
    await waitFor(() => {
      const items = screen
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label"))
        .filter((label): label is string => !!label && !label.startsWith("操作"));
      expect(items[0]).toBe("接口排查记录");
      expect(items[1]).toBe("发布检查清单");
      expect(items[2]).toBe("项目会议记录");
    });
  });
});

describe("notes quick-search target selection", () => {
  it("selects the target note from quick search", async () => {
    const consumeTarget = vi.fn();
    render(
      <MemoryRouter>
        <NoteTargetContext.Provider
          value={{ targetNoteId: "release-check", consumeTarget }}
        >
          <Routes>
            <Route element={<NotesShell />}>
              <Route path="/" element={<NotesPage />} />
            </Route>
          </Routes>
        </NoteTargetContext.Provider>
      </MemoryRouter>,
    );

    // 目标笔记（"发布检查清单"）被选中，编辑器标题显示它
    expect(await screen.findByDisplayValue("发布检查清单")).toBeInTheDocument();
    expect(consumeTarget).toHaveBeenCalledTimes(1);
  });
});
