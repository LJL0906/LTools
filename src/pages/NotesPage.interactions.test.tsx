import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import App, { NoteTargetContext } from "../App";
import { NotesPage } from "./NotesPage";
import type { AppOutletContext } from "../components/layout/AppShell";

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
