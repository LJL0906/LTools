import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

function setInput(label: string, value: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: label }), {
    target: { value },
  });
}

describe("ToolsPage JSON 工具", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("formats valid JSON with indentation (debounced)", async () => {
    render(<ToolsPage />);

    setInput("JSON 输入（格式化）", VALID_JSON);

    await waitFor(() => {
      expect(document.querySelector(".json-panel__output")?.textContent).toBe(
        PRETTY_JSON,
      );
    });
  });

  it("shows an error for invalid JSON without crashing", async () => {
    render(<ToolsPage />);

    setInput("JSON 输入（格式化）", '{"a": 1,}');

    await waitFor(() => {
      expect(document.querySelector(".json-panel__error")).not.toBeNull();
    });
    expect(document.querySelector(".json-panel__error")?.textContent).toMatch(
      /Unexpected|Expected|token/i,
    );
  });

  it("minifies JSON to a single line", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);

    await user.click(screen.getByRole("button", { name: /压缩/ }));
    setInput("JSON 输入（压缩）", PRETTY_JSON);

    await waitFor(() => {
      expect(document.querySelector(".json-panel__output")?.textContent).toBe(
        MINIFIED_JSON,
      );
    });
  });

  it("validates JSON and reports validity", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);

    await user.click(screen.getByRole("button", { name: /校验/ }));
    setInput("JSON 输入（校验）", VALID_JSON);

    await waitFor(() => {
      expect(
        document.querySelector(".json-panel__output")?.textContent,
      ).toContain("JSON 合法");
    });
  });

  it("copies the formatted output to the clipboard", async () => {
    mockClipboard();
    const user = userEvent.setup();
    render(<ToolsPage />);

    setInput("JSON 输入（格式化）", VALID_JSON);

    await waitFor(() => {
      expect(document.querySelector(".json-panel__output")).not.toBeNull();
    });
    await user.click(screen.getByRole("button", { name: "复制" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(PRETTY_JSON);
  });

  it("keeps each sub-tool's input when switching tabs", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);

    setInput("JSON 输入（格式化）", VALID_JSON);
    // 切到压缩再切回：格式化面板输入应保留
    await user.click(screen.getByRole("button", { name: /压缩/ }));
    await user.click(screen.getByRole("button", { name: /格式化/ }));

    expect(
      screen.getByRole("textbox", { name: "JSON 输入（格式化）" }),
    ).toHaveValue(VALID_JSON);
  });
});
