import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../lib/storage";
import { ToolsPage } from "./ToolsPage";

const VALID_JSON = '{"a":1,"b":[1,2]}';
const PRETTY_JSON = '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}';
const MINIFIED_JSON = '{"a":1,"b":[1,2]}';

function mockClipboard(): void {
  // jsdom 26 原生实现了 navigator.clipboard.writeText：优先 spy 替换，不可用时回退 defineProperty
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    return;
  }
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
}

function setInput(value: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: "JSON 输入" }), {
    target: { value },
  });
}

/** 等待异步数据加载完成（loadToolsData 为 async，首屏有 loading 态） */
async function waitForReady(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: "JSON 输入" })).toBeInTheDocument();
  });
}

describe("ToolsPage JSON 工具", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders a collapsible tree view by default (debounced)", async () => {
    render(<ToolsPage />);
    await waitForReady();

    setInput(VALID_JSON);

    await waitFor(() => {
      // @uiw/react-json-view 树视图渲染成功
      expect(
        document.querySelector(".json-panel__output .w-rjv-inner"),
      ).not.toBeNull();
    });
    const text = document.querySelector(".json-panel__output")?.textContent ?? "";
    expect(text).toContain("a");
    expect(text).toContain("b");
    expect(text).toContain("1");
  });

  it("shows an error for invalid JSON without crashing", async () => {
    render(<ToolsPage />);
    await waitForReady();

    setInput('{"a": 1,}');

    await waitFor(() => {
      expect(document.querySelector(".json-panel__error")?.textContent).toMatch(
        /Unexpected|Expected|token/i,
      );
    });
  });

  it("switches the preview to minified JSON via the compress button", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    setInput(PRETTY_JSON);
    await waitFor(() => {
      expect(
        document.querySelector(".json-panel__output .w-rjv-inner"),
      ).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "压缩" }));

    await waitFor(() => {
      expect(document.querySelector(".json-panel__output")?.textContent).toBe(
        MINIFIED_JSON,
      );
    });
  });

  it("copies the current preview to the clipboard", async () => {
    mockClipboard();
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    setInput(VALID_JSON);
    // 等待防抖处理完成（复制按钮随 result 就绪），再点击复制
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "一键复制" }),
      ).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "一键复制" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(PRETTY_JSON);
  });

  it("clears input and preview via the clear button in the top action row", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    setInput(VALID_JSON);
    await waitFor(() => {
      expect(
        document.querySelector(".json-panel__output .w-rjv-inner"),
      ).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "一键清空" }));

    // 输入立即清空（受控）；预览结果经 300ms 防抖后重置为占位（容器保留）
    expect(screen.getByRole("textbox", { name: "JSON 输入" })).toHaveValue("");
    await waitFor(() => {
      expect(document.querySelector(".json-panel__output .w-rjv-inner")).toBeNull();
      expect(screen.getByText("等待输入…")).toBeInTheDocument();
    });
  });

  it("creates new tabs with incremented titles and switches selection", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    // 初始一个空页签
    expect(
      screen.getByRole("button", { name: "JSON 格式化 1" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "+ 新建格式化" }));
    expect(
      screen.getByRole("button", { name: "JSON 格式化 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "JSON 格式化 1" }),
    ).toHaveAttribute("aria-pressed", "false");
    // 新页签输入为空 → 显示占位
    expect(screen.getByRole("textbox", { name: "JSON 输入" })).toHaveValue("");
    expect(screen.getByText("等待输入…")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ 新建格式化" }));
    expect(
      screen.getByRole("button", { name: "JSON 格式化 3" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("selects a neighboring tab after deletion and auto-creates when emptied", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    await user.click(screen.getByRole("button", { name: "+ 新建格式化" }));
    await user.click(screen.getByRole("button", { name: "+ 新建格式化" }));

    // 选中中间页签后删除（二次确认）→ 优先选中下一个
    await user.click(screen.getByRole("button", { name: "JSON 格式化 2" }));
    await user.click(screen.getByRole("button", { name: "删除 JSON 格式化 2" }));
    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(
      screen.getByRole("button", { name: "JSON 格式化 3" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "删除 JSON 格式化 2" })).toBeNull();

    // 删除末尾页签 → 选中上一个
    await user.click(screen.getByRole("button", { name: "删除 JSON 格式化 3" }));
    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(
      screen.getByRole("button", { name: "JSON 格式化 1" }),
    ).toHaveAttribute("aria-pressed", "true");

    // 删除最后一个 → 自动新建空页签
    await user.click(screen.getByRole("button", { name: "删除 JSON 格式化 1" }));
    await user.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "JSON 格式化 1" }),
      ).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.getByRole("textbox", { name: "JSON 输入" })).toHaveValue("");
  });

  it("keeps the active tab selected when deleting a different tab", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    await user.click(screen.getByRole("button", { name: "+ 新建格式化" }));
    await user.click(screen.getByRole("button", { name: "+ 新建格式化" }));

    // 激活页签 2，然后删除非活动的页签 1（二次确认）→ 选中不应被切走
    await user.click(screen.getByRole("button", { name: "JSON 格式化 2" }));
    await user.click(screen.getByRole("button", { name: "删除 JSON 格式化 1" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(
      screen.getByRole("button", { name: "JSON 格式化 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "删除 JSON 格式化 1" })).toBeNull();
  });

  it("cancels tab deletion without removing the tab", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    await user.click(screen.getByRole("button", { name: "删除 JSON 格式化 1" }));
    // 确认框已出现
    expect(
      screen.getByRole("dialog", { name: "删除页签" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消" }));

    // 页签仍在、确认框关闭
    expect(
      screen.getByRole("button", { name: "JSON 格式化 1" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("persists typed input to localStorage on the browser fallback path", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    setInput(VALID_JSON);

    // 组件 300ms 防抖 + storage 200ms 防抖后落盘 ltools.jsonTabs
    await waitFor(
      () => {
        const raw = localStorage.getItem(STORAGE_KEYS.jsonTabs);
        expect(raw).not.toBeNull();
        const tabs = JSON.parse(raw ?? "[]") as Array<{
          id: string;
          input: string;
          mode: string;
        }>;
        expect(tabs).toHaveLength(1);
        expect(tabs[0].input).toBe(VALID_JSON);
      },
      { timeout: 2000 },
    );

    // 模式切换同样持久化
    await user.click(screen.getByRole("button", { name: "压缩" }));
    await waitFor(
      () => {
        const raw = localStorage.getItem(STORAGE_KEYS.jsonTabs);
        const tabs = JSON.parse(raw ?? "[]") as Array<{ mode: string }>;
        expect(tabs[0]?.mode).toBe("minify");
      },
      { timeout: 2000 },
    );
  });

  it("renames a tab by double-clicking its title and confirms with Enter", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    await user.dblClick(screen.getByRole("button", { name: "JSON 格式化 1" }));

    const renameInput = screen.getByRole("textbox", { name: "页签名称" });
    await user.clear(renameInput);
    await user.type(renameInput, "接口数据{Enter}");

    // 标题更新、仍为选中态，删除按钮 aria-label 同步
    expect(
      screen.getByRole("button", { name: "接口数据" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "删除 接口数据" })).toBeInTheDocument();

    // 改名立即持久化（upsert 不走防抖）
    await waitFor(
      () => {
        const raw = localStorage.getItem(STORAGE_KEYS.jsonTabs);
        const tabs = JSON.parse(raw ?? "[]") as Array<{ title: string }>;
        expect(tabs[0]?.title).toBe("接口数据");
      },
      { timeout: 2000 },
    );
  });

  it("cancels renaming with Escape and keeps the original title", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    await user.dblClick(screen.getByRole("button", { name: "JSON 格式化 1" }));
    const renameInput = screen.getByRole("textbox", { name: "页签名称" });
    await user.clear(renameInput);
    await user.type(renameInput, "临时名字{Escape}");

    expect(
      screen.getByRole("button", { name: "JSON 格式化 1" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "页签名称" })).toBeNull();
  });

  it("highlights JSON values with type tokens in the preview output", async () => {
    render(<ToolsPage />);
    await waitForReady();

    // 含 string / int / bool / null 全部值类型
    setInput('{"name":"ltools","count":2,"active":true,"extra":null}');

    await waitFor(() => {
      const output = document.querySelector(".json-panel__output");
      expect(output).not.toBeNull();
      expect(
        output?.querySelector('.w-rjv-value[data-type="string"]'),
      ).not.toBeNull();
      expect(output?.querySelector('.w-rjv-value[data-type="int"]')).not.toBeNull();
      expect(output?.querySelector('.w-rjv-value[data-type="bool"]')).not.toBeNull();
      expect(output?.querySelector('.w-rjv-value[data-type="null"]')).not.toBeNull();
    });
    // 高亮不改变可见文本：键名与值均可见
    const text = document.querySelector(".json-panel__output")?.textContent ?? "";
    expect(text).toContain("name");
    expect(text).toContain("ltools");
  });

  it("renders nested containers in the tree view", async () => {
    render(<ToolsPage />);
    await waitForReady();

    // 嵌套容器（对象/数组）逐层渲染，键名与值可见
    setInput('{"user":{"name":"a"},"list":[1,2]}');

    await waitFor(() => {
      expect(
        document.querySelector(".json-panel__output .w-rjv-inner"),
      ).not.toBeNull();
    });
    const text = document.querySelector(".json-panel__output")?.textContent ?? "";
    expect(text).toContain("user");
    expect(text).toContain("name");
    expect(text).toContain("list");
  });

  it("collapses and expands a single container by clicking its key", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    setInput('{"user":{"name":"a"},"list":[1,2]}');
    await waitFor(() => {
      expect(
        document.querySelector(".json-panel__output .w-rjv-inner"),
      ).not.toBeNull();
    });
    const output = document.querySelector(".json-panel__output");
    expect(output).not.toBeNull();

    // 点击 user 容器行 → 子节点隐藏，容器行仍在
    await user.click(screen.getByText("user"));
    expect(output?.textContent).not.toContain("name");
    expect(output?.textContent).toContain("user");

    // 再次点击 → 内容恢复
    await user.click(screen.getByText("user"));
    expect(output?.textContent).toContain("name");
  });

  it("collapses and expands all containers with the action buttons", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    setInput('{"user":{"name":"a"},"list":[1,2]}');
    await waitFor(() => {
      expect(
        document.querySelector(".json-panel__output .w-rjv-inner"),
      ).not.toBeNull();
    });
    const output = document.querySelector(".json-panel__output");
    expect(output).not.toBeNull();

    // 一键折叠全部：根容器折叠，所有子节点隐藏
    // （按钮触发树重挂载，DOM 引用会变化，需每次重新查询）
    await user.click(screen.getByRole("button", { name: "折叠全部" }));
    await waitFor(() => {
      const text = document.querySelector(".json-panel__output")?.textContent ?? "";
      expect(text).not.toContain("name");
      expect(text).not.toContain("user");
    });

    // 一键展开全部：内容全部恢复
    await user.click(screen.getByRole("button", { name: "展开全部" }));
    await waitFor(() => {
      const text = document.querySelector(".json-panel__output")?.textContent ?? "";
      expect(text).toContain("name");
      expect(text).toContain("1");
    });
  });

  it("copies the full formatted JSON even when parts are collapsed", async () => {
    mockClipboard();
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    setInput('{"user":{"name":"a"},"list":[1,2]}');
    await waitFor(() => {
      expect(
        document.querySelector(".json-panel__output .w-rjv-inner"),
      ).not.toBeNull();
    });

    // 折叠若干节点后复制：内容仍是完整格式化 JSON
    await user.click(screen.getByText("user"));
    await user.click(screen.getByRole("button", { name: "一键复制" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '{\n  "user": {\n    "name": "a"\n  },\n  "list": [\n    1,\n    2\n  ]\n}',
    );
  });

  it("copies clean formatted JSON when selecting the tree preview", async () => {
    render(<ToolsPage />);
    await waitForReady();

    setInput(VALID_JSON);
    await waitFor(() => {
      expect(
        document.querySelector(".json-panel__output .w-rjv-inner"),
      ).not.toBeNull();
    });

    // 框选/全选预览区 Ctrl+C 走 onCopy 拦截：写入干净的格式化文本而非 DOM 碎片
    const output = document.querySelector(".json-panel__output");
    expect(output).not.toBeNull();
    const clipboardData = { setData: vi.fn() };
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboardData });
    fireEvent(output as Element, event);

    expect(clipboardData.setData).toHaveBeenCalledWith("text/plain", PRETTY_JSON);
  });

  it("searches keys and values and expands matching paths", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    setInput('{"user":{"name":"a"},"list":[1,2]}');
    await waitFor(() => {
      expect(
        document.querySelector(".json-panel__output .w-rjv-inner"),
      ).not.toBeNull();
    });

    // 搜索 "name"：匹配 1 处；匹配路径展开、未匹配的 list 折叠
    await user.type(screen.getByRole("textbox", { name: "JSON 搜索" }), "name");
    await waitFor(() => {
      expect(screen.getByText("匹配 1 处")).toBeInTheDocument();
    });
    const text = document.querySelector(".json-panel__output")?.textContent ?? "";
    expect(text).toContain("name");
    expect(text).not.toContain("1");

    // 无匹配关键词：提示无匹配，内容折叠
    await user.clear(screen.getByRole("textbox", { name: "JSON 搜索" }));
    await user.type(screen.getByRole("textbox", { name: "JSON 搜索" }), "zzz");
    await waitFor(() => {
      expect(screen.getByText("无匹配")).toBeInTheDocument();
    });
    expect(
      document.querySelector(".json-panel__output")?.textContent,
    ).not.toContain("user");
  });

  it("switches the tree theme via the theme buttons", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);
    await waitForReady();

    setInput(VALID_JSON);
    await waitFor(() => {
      expect(
        document.querySelector(".json-panel__output .w-rjv-inner"),
      ).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "暗色" }));
    expect(screen.getByRole("button", { name: "暗色" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "亮色" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "VSCode" }));
    expect(screen.getByRole("button", { name: "VSCode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
