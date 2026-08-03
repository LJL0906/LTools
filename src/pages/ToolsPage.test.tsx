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

function setInput(value: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: "JSON 输入" }), {
    target: { value },
  });
}

describe("ToolsPage JSON 工具", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("formats valid JSON with indentation by default (debounced)", async () => {
    render(<ToolsPage />);

    setInput(VALID_JSON);

    await waitFor(() => {
      expect(document.querySelector(".json-panel__output")?.textContent).toBe(
        PRETTY_JSON,
      );
    });
  });

  it("shows an error for invalid JSON without crashing", async () => {
    render(<ToolsPage />);

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

    setInput(PRETTY_JSON);
    await waitFor(() => {
      expect(document.querySelector(".json-panel__output")?.textContent).toBe(
        PRETTY_JSON,
      );
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

    setInput(VALID_JSON);
    await waitFor(() => {
      expect(document.querySelector(".json-panel__output")).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "一键复制" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(PRETTY_JSON);
  });

  it("clears input and preview via the clear button", async () => {
    const user = userEvent.setup();
    render(<ToolsPage />);

    setInput(VALID_JSON);
    await waitFor(() => {
      expect(document.querySelector(".json-panel__output")).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "一键清空" }));

    expect(screen.getByRole("textbox", { name: "JSON 输入" })).toHaveValue("");
    expect(document.querySelector(".json-panel__output")).toBeNull();
    expect(screen.getByText("等待输入…")).toBeInTheDocument();
  });
});
