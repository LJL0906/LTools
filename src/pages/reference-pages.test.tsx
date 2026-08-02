import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";

describe("V9 reference pages", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/links");
  });

  it("renders the two reference link cards and their actions", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "API 文档" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "测试后台" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制 API 文档" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 测试后台" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "管理链接 API 文档" }));
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "管理链接 测试后台" }));
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("renders the note list, toolbar, and reference content", () => {
    window.history.replaceState({}, "", "/notes");
    render(<App />);

    expect(screen.getByRole("button", { name: "新建笔记" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "富文本工具栏" })).toBeInTheDocument();
    expect(screen.getByText("本次会议确认首版功能范围。")).toBeInTheDocument();
  });
});
