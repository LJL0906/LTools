import { render, screen } from "@testing-library/react";
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
  it("shows ungrouped notes and keeps the editor aligned with the filter", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "未分组" }));

    expect(screen.getByRole("button", { name: "发布检查清单" })).toBeInTheDocument();
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

  it("persists a new group via upsert_note_group", async () => {
    const user = userEvent.setup();
    renderNotesPage();

    await screen.findByRole("button", { name: "项目会议记录" });
    mockedInvoke.mockClear();

    await user.click(screen.getByRole("button", { name: "新建分组" }));
    await user.type(screen.getByRole("textbox", { name: "名称" }), "新分组");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(mockedInvoke).toHaveBeenCalledWith(
      "upsert_note_group",
      expect.objectContaining({
        group: expect.objectContaining({ id: expect.any(String), name: "新分组" }),
      }),
    );
  });

  it("persists group rename via upsert_note_group", async () => {
    const user = userEvent.setup();
    renderNotesPage();

    await screen.findByRole("button", { name: "项目会议记录" });
    mockedInvoke.mockClear();

    await user.click(screen.getByRole("button", { name: "管理分组 工作" }));
    await user.click(screen.getByRole("button", { name: "重命名" }));

    const nameInput = screen.getByRole("textbox", { name: "名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "研发");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(mockedInvoke).toHaveBeenCalledWith(
      "upsert_note_group",
      expect.objectContaining({
        group: expect.objectContaining({ id: "work", name: "研发" }),
      }),
    );
  });

  it("persists group deletion via delete_note_group and ungroups its notes", async () => {
    const user = userEvent.setup();
    renderNotesPage();

    await screen.findByRole("button", { name: "项目会议记录" });
    mockedInvoke.mockClear();

    await user.click(screen.getByRole("button", { name: "管理分组 项目 A" }));
    await user.click(screen.getByRole("button", { name: "删除分组" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(mockedInvoke).toHaveBeenCalledWith("delete_note_group", {
      id: "project-a",
    });

    // 内存 state 同步：组内笔记 groupId 置 null，出现在「未分组」
    await user.click(screen.getByRole("button", { name: "未分组" }));
    expect(screen.getByRole("button", { name: "项目会议记录" })).toBeInTheDocument();
  });
});

describe("notes quick-search target selection", () => {
  it("selects the target note and expands all groups", async () => {
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
