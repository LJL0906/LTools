import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";

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

    const bold = screen.getByRole("button", { name: "粗体" });
    await user.click(bold);
    expect(bold).toHaveAttribute("aria-pressed", "true");

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
});
