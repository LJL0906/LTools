import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { LinksPage } from "./LinksPage";

function expectHTMLElement(element: Element | null): asserts element is HTMLElement {
  expect(element).toBeInstanceOf(HTMLElement);
}

describe("links static interactions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a link from the shared link form dialog", async () => {
    const user = userEvent.setup();
    render(<LinksPage />);

    await user.click(screen.getByRole("button", { name: "添加链接" }));

    expect(screen.getByRole("dialog", { name: "添加链接" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "标题" }), "设计系统");
    await user.click(screen.getByRole("combobox", { name: "协议" }));
    await user.click(screen.getByRole("option", { name: "http" }));
    await user.type(
      screen.getByRole("textbox", { name: "地址" }),
      "design.example.com/docs",
    );
    await user.type(screen.getByRole("textbox", { name: "备注" }), "组件规范");
    await user.click(screen.getByRole("combobox", { name: "分组" }));
    await user.click(screen.getByRole("option", { name: "项目 A" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.queryByRole("dialog", { name: "添加链接" })).not.toBeInTheDocument();
    const newCard = screen
      .getByRole("heading", { name: "设计系统" })
      .closest('[data-slot="card"]');
    expectHTMLElement(newCard);
    expect(within(newCard).getByText("http://design.example.com/docs")).toBeInTheDocument();
    expect(within(newCard).getByText("项目 A")).toBeInTheDocument();
  });

  it("prefills and saves edits to an existing link", async () => {
    const user = userEvent.setup();
    render(<LinksPage />);

    await user.click(screen.getByRole("button", { name: "管理链接 API 文档" }));
    await user.click(screen.getByRole("button", { name: "编辑" }));

    expect(screen.getByRole("dialog", { name: "编辑链接" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "标题" })).toHaveValue("API 文档");
    expect(screen.getByRole("combobox", { name: "协议" })).toHaveTextContent("https");
    expect(screen.getByRole("textbox", { name: "地址" })).toHaveValue("example.com/api");
    expect(screen.getByRole("textbox", { name: "备注" })).toHaveValue("接口说明");
    expect(screen.getByRole("combobox", { name: "分组" })).toHaveTextContent("工作");

    const title = screen.getByRole("textbox", { name: "标题" });
    await user.clear(title);
    await user.type(title, "新版 API 文档");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("heading", { name: "新版 API 文档" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "API 文档" })).not.toBeInTheDocument();
  });

  it("requires confirmation before deleting a link", async () => {
    const user = userEvent.setup();
    render(<LinksPage />);

    await user.click(screen.getByRole("button", { name: "管理链接 测试后台" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(screen.getByRole("dialog", { name: "删除链接" })).toBeInTheDocument();
    expect(screen.getByText("确定删除“测试后台”？")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("heading", { name: "测试后台" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "管理链接 测试后台" }));
    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(screen.queryByRole("heading", { name: "测试后台" })).not.toBeInTheDocument();
  });

  it("copies the full URL and shows temporary visible feedback", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<LinksPage />);

    fireEvent.click(screen.getByRole("button", { name: "复制 API 文档" }));
    await act(async () => Promise.resolve());

    expect(writeText).toHaveBeenCalledWith("https://example.com/api");

    act(() => {
      vi.advanceTimersByTime(1600);
    });
  });

  it("filters cards when a group is selected", async () => {
    const user = userEvent.setup();
    render(<LinksPage />);

    await user.click(screen.getByRole("button", { name: "工作" }));

    expect(screen.getByRole("heading", { name: "API 文档" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "测试后台" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "全部" }));
    expect(screen.getByRole("heading", { name: "测试后台" })).toBeInTheDocument();
  });
  it("shows an accessible empty state for unmatched searches and restores cards when cleared", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    render(<App />);

    const searchbox = screen.getByRole("searchbox", { name: "搜索" });
    await user.type(searchbox, "不存在的链接");

    expect(screen.getByRole("status")).toHaveTextContent("没有找到匹配的链接");
    expect(screen.queryByRole("heading", { name: "API 文档" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "测试后台" })).not.toBeInTheDocument();

    await user.clear(searchbox);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "API 文档" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "测试后台" })).toBeInTheDocument();
  });

  it("exposes each link card's group and keeps edit and delete actions accessible", async () => {
    render(<LinksPage />);

    const apiCard = screen
      .getByRole("heading", { name: "API 文档" })
      .closest('[data-slot="card"]');
    expectHTMLElement(apiCard);
    expect(within(apiCard).getByText("工作")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(
      within(apiCard).getByRole("button", { name: "管理链接 API 文档" }),
    );
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("shows visible feedback when copying a link fails", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<LinksPage />);

    await user.click(screen.getByRole("button", { name: "复制 API 文档" }));

    expect(writeText).toHaveBeenCalledWith("https://example.com/api");
    expect(await screen.findByRole("alert")).toHaveTextContent("复制失败");
  });
});


