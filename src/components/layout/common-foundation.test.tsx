import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../../App";
import { ModuleLayout } from "./ModuleLayout";

const createPointerEvent = (type: string, clientX: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
};

describe("common module foundation", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/links");
  });

  it("provides the links module with a reusable sidebar and primary action", () => {
    render(<App />);

    expect(screen.getByTestId("module-sidebar")).toHaveStyle({ width: "216px" });
    expect(
      screen.getByRole("separator", { name: "调整链接侧栏宽度" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加链接" })).toHaveClass(
      "button--primary",
    );
    expect(screen.getByRole("button", { name: "新建分组" })).toBeInTheDocument();
  });

  it("resizes the sidebar with pointer movement", () => {
    render(
      <ModuleLayout
        maxSidebarWidth={320}
        minSidebarWidth={160}
        resizeHandleLabel="调整测试侧栏宽度"
        sidebar={<div>侧栏</div>}
        sidebarWidth={216}
      >
        <div>内容</div>
      </ModuleLayout>,
    );

    const separator = screen.getByRole("separator", {
      name: "调整测试侧栏宽度",
    });

    fireEvent(separator, createPointerEvent("pointerdown", 216));
    fireEvent(separator, createPointerEvent("pointermove", 260));
    fireEvent(separator, createPointerEvent("pointerup", 260));

    expect(screen.getByTestId("module-sidebar")).toHaveStyle({ width: "260px" });
  });

  it("supports compact keyboard resizing and clamps to configured bounds", () => {
    render(
      <ModuleLayout
        maxSidebarWidth={224}
        minSidebarWidth={208}
        resizeHandleLabel="调整测试侧栏宽度"
        sidebar={<div>侧栏</div>}
        sidebarWidth={216}
      >
        <div>内容</div>
      </ModuleLayout>,
    );

    const separator = screen.getByRole("separator", {
      name: "调整测试侧栏宽度",
    });

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(screen.getByTestId("module-sidebar")).toHaveStyle({ width: "224px" });

    fireEvent.keyDown(separator, { key: "ArrowRight", shiftKey: true });
    expect(screen.getByTestId("module-sidebar")).toHaveStyle({ width: "224px" });

    fireEvent.keyDown(separator, { key: "ArrowLeft", shiftKey: true });
    expect(screen.getByTestId("module-sidebar")).toHaveStyle({ width: "208px" });
  });

  it("keeps module widths independent during the current runtime", () => {
    const first = render(
      <ModuleLayout
        resizeHandleLabel="first runtime sidebar"
        sidebar={<div>first sidebar</div>}
        sidebarStateKey="test-runtime-first"
        sidebarWidth={216}
      >
        <div>first content</div>
      </ModuleLayout>,
    );

    fireEvent.keyDown(
      screen.getByRole("separator", { name: "first runtime sidebar" }),
      { key: "ArrowRight" },
    );
    expect(screen.getByTestId("module-sidebar")).toHaveStyle({ width: "224px" });
    first.unmount();

    const second = render(
      <ModuleLayout
        resizeHandleLabel="second runtime sidebar"
        sidebar={<div>second sidebar</div>}
        sidebarStateKey="test-runtime-second"
        sidebarWidth={304}
      >
        <div>second content</div>
      </ModuleLayout>,
    );
    expect(screen.getByTestId("module-sidebar")).toHaveStyle({ width: "304px" });
    second.unmount();

    render(
      <ModuleLayout
        resizeHandleLabel="first runtime sidebar"
        sidebar={<div>first sidebar</div>}
        sidebarStateKey="test-runtime-first"
        sidebarWidth={216}
      >
        <div>first content</div>
      </ModuleLayout>,
    );
    expect(screen.getByTestId("module-sidebar")).toHaveStyle({ width: "224px" });
  });

  it("limits resizing to forty percent of the available layout width", () => {
    render(
      <ModuleLayout
        maxSidebarWidth={420}
        resizeHandleLabel="ratio limited sidebar"
        sidebar={<div>sidebar</div>}
        sidebarWidth={216}
      >
        <div>content</div>
      </ModuleLayout>,
    );

    const separator = screen.getByRole("separator", {
      name: "ratio limited sidebar",
    });
    const layout = separator.closest(".module-layout");
    if (!layout) {
      throw new Error("module layout missing");
    }
    layout.getBoundingClientRect = () =>
      ({ width: 600 }) as DOMRect;

    fireEvent(separator, createPointerEvent("pointerdown", 216));
    fireEvent(separator, createPointerEvent("pointermove", 300));
    fireEvent(separator, createPointerEvent("pointerup", 300));

    expect(screen.getByTestId("module-sidebar")).toHaveStyle({ width: "240px" });
  });
});
