import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteEditor } from "./NoteEditor";

describe("NoteEditor Tab 键行为", () => {
  it("普通段落按 Tab 插入两个空格并触发 onChange，而非跳转焦点", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditor content="<p>abc</p>" onChange={onChange} />,
    );
    const pm = container.querySelector(".ProseMirror") as HTMLElement;
    expect(pm).not.toBeNull();

    // 浏览器默认行为会把焦点移到下一个可聚焦控件；Tiptap 拦截后应插入空格
    fireEvent.keyDown(pm, { key: "Tab" });

    expect(pm.innerHTML).toBe("<p>  abc</p>");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toContain("  abc");
  });

  it("普通段落按 Shift+Tab 不插入内容，也不改变文档", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditor content="<p>abc</p>" onChange={onChange} />,
    );
    const pm = container.querySelector(".ProseMirror") as HTMLElement;

    fireEvent.keyDown(pm, { key: "Tab", shiftKey: true });

    expect(pm.innerHTML).toBe("<p>abc</p>");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Ctrl+] 在普通段落行首插入两个空格", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditor content="<p>abc</p>" onChange={onChange} />,
    );
    const pm = container.querySelector(".ProseMirror") as HTMLElement;

    fireEvent.keyDown(pm, { key: "]", ctrlKey: true });

    expect(pm.innerHTML).toBe("<p>  abc</p>");
    expect(onChange).toHaveBeenCalled();
  });

  it("Ctrl+[ 移除行首缩进（至多两个空格）", () => {
    const { container } = render(
      <NoteEditor content="<p>  abc</p>" onChange={() => undefined} />,
    );
    const pm = container.querySelector(".ProseMirror") as HTMLElement;

    fireEvent.keyDown(pm, { key: "[", ctrlKey: true });

    expect(pm.innerHTML).toBe("<p>abc</p>");
  });

  it("Ctrl+[ 在无缩进时不改变文档", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditor content="<p>abc</p>" onChange={onChange} />,
    );
    const pm = container.querySelector(".ProseMirror") as HTMLElement;

    fireEvent.keyDown(pm, { key: "[", ctrlKey: true });

    expect(pm.innerHTML).toBe("<p>abc</p>");
    expect(onChange).not.toHaveBeenCalled();
  });
});
