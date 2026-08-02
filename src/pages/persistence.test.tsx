import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { STORAGE_KEYS } from "../lib/storage";

describe("localStorage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/notes");
  });

  it("persists note edits to localStorage in real time", async () => {
    const user = userEvent.setup();
    render(<App />);

    const title = screen.getByRole("textbox", { name: "笔记标题" });
    await user.clear(title);
    await user.type(title, "持久化测试标题");

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.notes) ?? "[]");
      expect(saved.some((note: { title: string }) => note.title === "持久化测试标题")).toBe(true);
    });
  });

  it("restores persisted notes on reload", async () => {
    const customNotes = [
      {
        id: "persisted-1",
        title: "已保存的笔记",
        content: "<p>恢复的内容</p>",
        groupId: null,
        time: "刚刚",
      },
    ];
    localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(customNotes));

    render(<App />);

    expect(await screen.findByRole("button", { name: "已保存的笔记" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "笔记标题" })).toHaveValue("已保存的笔记");
  });

  it("persists link deletions to localStorage", async () => {
    window.history.replaceState({}, "", "/links");
    const user = userEvent.setup();
    render(<App />);

    // 删除第一张链接卡片：打开菜单 → 删除 → 确认
    await user.click(screen.getByRole("button", { name: "管理链接 API 文档" }));
    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.links) ?? "[]");
      expect(saved.length).toBe(1);
    });
  });
});
