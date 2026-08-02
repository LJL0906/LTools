import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../../App";

describe("group accordion", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/notes");
  });

  it("shows note groups inline with accordion expand/collapse", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId("module-sidebar")).toHaveStyle({ width: "240px" });
    expect(screen.getByRole("searchbox", { name: "搜索笔记" })).toBeInTheDocument();

    // 所有笔记分组以扁平内联行展示
    expect(screen.getByRole("button", { name: "工作" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "项目 A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "产品设计" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "学习" })).toBeInTheDocument();

    // LinksPage 的分组不会出现在笔记侧栏中
    const allButtons = screen.getAllByRole("button", { name: "全部" });
    expect(allButtons).toHaveLength(1);

    // 初始状态："全部" 默认展开，所有笔记可见
    expect(screen.getByRole("button", { name: "项目会议记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "接口排查记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布检查清单" })).toBeInTheDocument();

    // 折叠"全部" — 笔记隐藏
    await user.click(screen.getByRole("button", { name: "全部" }));
    expect(screen.queryByRole("button", { name: "项目会议记录" })).not.toBeInTheDocument();

    // 展开"项目 A" — 手风琴：只显示该分组的笔记
    await user.click(screen.getByRole("button", { name: "项目 A" }));
    expect(screen.getByRole("button", { name: "项目会议记录" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "接口排查记录" })).not.toBeInTheDocument();

    // 展开"未分组" — 只显示无分组笔记
    await user.click(screen.getByRole("button", { name: "未分组" }));
    expect(screen.getByRole("button", { name: "发布检查清单" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "项目会议记录" })).not.toBeInTheDocument();

    // 再次点击"未分组" — 折叠
    await user.click(screen.getByRole("button", { name: "未分组" }));
    expect(screen.queryByRole("button", { name: "发布检查清单" })).not.toBeInTheDocument();
  });
});
