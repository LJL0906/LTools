import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../../App";

describe("shared group management", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/links");
  });

  it("opens an accessible create dialog and closes it with Escape", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "新建分组" }));

    expect(screen.getByRole("dialog", { name: "新建分组" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "名称" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "新建分组" })).not.toBeInTheDocument();
  });

  it("creates a group from the shared dialog", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "新建分组" }));
    await user.type(screen.getByRole("textbox", { name: "名称" }), "学习");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("button", { name: "学习" })).toBeInTheDocument();
  });

  it("renames and deletes a group through the shared menu", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "管理分组 项目 A" }));
    await user.click(screen.getByRole("button", { name: "重命名" }));

    const nameInput = screen.getByRole("textbox", { name: "名称" });
    await user.clear(nameInput);
    await user.type(nameInput, "项目 Alpha");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("button", { name: "项目 Alpha" })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "管理分组 项目 Alpha" }),
    );
    await user.click(screen.getByRole("button", { name: "删除分组" }));

    expect(screen.getByRole("dialog", { name: "删除分组" })).toHaveTextContent(
      "确定删除“项目 Alpha”？",
    );

    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(
      screen.queryByRole("button", { name: "项目 Alpha" }),
    ).not.toBeInTheDocument();
  });
});

