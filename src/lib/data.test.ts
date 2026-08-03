import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  isTauriRuntime,
  loadLinksData,
  loadNotesData,
  persistLinks,
  persistNotes,
  upsertLink,
  deleteLink,
  deleteLinkGroup,
  upsertNote,
  deleteNote,
  upsertClipboardItem,
  deleteClipboardItem,
  clearClipboardItems,
  upsertJsonTab,
  deleteJsonTab,
} from "./data";
import { STORAGE_KEYS, loadState } from "./storage";
import type { LinkItem } from "../features/links/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

function mockTauri(): void {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

const EMPTY_DB = {
  links: [],
  linkGroups: [],
  notes: [],
  noteGroups: [],
  clipboardItems: [],
  jsonTabs: [],
};

function makeLink(overrides: Partial<LinkItem> = {}): LinkItem {
  return {
    id: "x",
    title: "t",
    protocol: "https",
    address: "a.com",
    notes: "",
    groupId: null,
    ...overrides,
  };
}

describe("data layer (Tauri runtime)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("detects the Tauri runtime flag", () => {
    expect(isTauriRuntime()).toBe(false);
    mockTauri();
    expect(isTauriRuntime()).toBe(true);
  });

  it("migrates localStorage data into SQLite when the DB is empty", async () => {
    mockTauri();
    localStorage.setItem(
      STORAGE_KEYS.links,
      JSON.stringify([{ id: "l1", title: "旧链接" }]),
    );
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data") return Promise.resolve({ ...EMPTY_DB });
      return Promise.resolve(undefined);
    });

    const { links } = await loadLinksData();

    // 迁移数据并返回给调用方
    expect(links).toEqual([{ id: "l1", title: "旧链接" }]);
    expect(mockedInvoke).toHaveBeenCalledWith(
      "replace_all_data",
      expect.objectContaining({
        data: expect.objectContaining({ links: [{ id: "l1", title: "旧链接" }] }),
      }),
    );
  });

  it("loads from SQLite directly when data already exists", async () => {
    mockTauri();
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data")
        return Promise.resolve({
          ...EMPTY_DB,
          links: [{ id: "db1", title: "DB 链接" }],
        });
      return Promise.resolve(undefined);
    });

    const { links } = await loadLinksData();

    expect(links).toEqual([{ id: "db1", title: "DB 链接" }]);
    // 库非空：不触发迁移
    expect(mockedInvoke).not.toHaveBeenCalledWith("replace_all_data", expect.anything());
  });

  it("persists module changes to SQLite as a debounced snapshot", async () => {
    vi.useFakeTimers();
    mockTauri();
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data")
        return Promise.resolve({
          ...EMPTY_DB,
          links: [{ id: "old" }],
        });
      return Promise.resolve(undefined);
    });

    persistLinks([makeLink({ id: "new", title: "新链接" })], []);
    await vi.advanceTimersByTimeAsync(250);

    expect(mockedInvoke).toHaveBeenCalledWith(
      "replace_all_data",
      expect.objectContaining({
        data: expect.objectContaining({
          links: [expect.objectContaining({ id: "new", title: "新链接" })],
        }),
      }),
    );
    vi.useRealTimers();
  });

  it("persists notes to SQLite", async () => {
    vi.useFakeTimers();
    mockTauri();
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data") return Promise.resolve({ ...EMPTY_DB });
      return Promise.resolve(undefined);
    });

    persistNotes([{ id: "n1", title: "笔记", content: "", groupId: null, time: "" }], []);
    await vi.advanceTimersByTimeAsync(250);

    expect(mockedInvoke).toHaveBeenCalledWith(
      "replace_all_data",
      expect.objectContaining({
        data: expect.objectContaining({
          notes: [{ id: "n1", title: "笔记", content: "", groupId: null, time: "" }],
        }),
      }),
    );
    vi.useRealTimers();
  });

  it("loads from localStorage without touching the DB outside Tauri", async () => {
    localStorage.setItem(
      STORAGE_KEYS.links,
      JSON.stringify([{ id: "ls1", title: "本地" }]),
    );
    const { links } = await loadLinksData();
    expect(links).toEqual([{ id: "ls1", title: "本地" }]);
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("loads notes from localStorage outside Tauri", async () => {
    localStorage.setItem(
      STORAGE_KEYS.notes,
      JSON.stringify([{ id: "n1", title: "本地笔记" }]),
    );
    const { notes } = await loadNotesData();
    expect(notes).toEqual([{ id: "n1", title: "本地笔记" }]);
  });
});

describe("per-item CRUD", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("upserts and deletes a link in localStorage (browser fallback)", () => {
    vi.useFakeTimers();
    upsertLink(makeLink({ id: "l1", title: "新链接" }));
    vi.advanceTimersByTime(250);
    expect(loadState(STORAGE_KEYS.links, [])).toEqual([
      expect.objectContaining({ id: "l1", title: "新链接" }),
    ]);

    // 同 id 覆盖更新
    upsertLink(makeLink({ id: "l1", title: "改名" }));
    vi.advanceTimersByTime(250);
    expect(loadState(STORAGE_KEYS.links, [])).toEqual([
      expect.objectContaining({ id: "l1", title: "改名" }),
    ]);

    // 删除
    deleteLink("l1");
    vi.advanceTimersByTime(250);
    expect(loadState(STORAGE_KEYS.links, [])).toEqual([]);
    vi.useRealTimers();
  });

  it("moves group links to ungrouped when deleting a link group (browser fallback)", () => {
    localStorage.setItem(
      STORAGE_KEYS.links,
      JSON.stringify([
        { id: "l1", groupId: "g1" },
        { id: "l2", groupId: null },
      ]),
    );
    localStorage.setItem(STORAGE_KEYS.linkGroups, JSON.stringify([{ id: "g1", name: "组" }]));

    vi.useFakeTimers();
    deleteLinkGroup("g1");
    vi.advanceTimersByTime(250);

    expect(loadState(STORAGE_KEYS.linkGroups, [])).toEqual([]);
    const links = loadState(STORAGE_KEYS.links, []);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ id: "l1", groupId: null });
    expect(links[1]).toEqual({ id: "l2", groupId: null });
    vi.useRealTimers();
  });

  it("clears clipboard items in localStorage (browser fallback)", () => {
    localStorage.setItem(
      STORAGE_KEYS.clipboardItems,
      JSON.stringify([{ id: "c1", text: "x" }]),
    );
    vi.useFakeTimers();
    clearClipboardItems();
    vi.advanceTimersByTime(250);
    expect(loadState(STORAGE_KEYS.clipboardItems, [])).toEqual([]);
    vi.useRealTimers();
  });

  it("upserts and deletes a JSON tab in localStorage (browser fallback)", () => {
    vi.useFakeTimers();
    upsertJsonTab({ id: "j1", title: "页签", input: "{}", mode: "format" });
    vi.advanceTimersByTime(250);
    expect(loadState(STORAGE_KEYS.jsonTabs, [])).toEqual([
      expect.objectContaining({ id: "j1", title: "页签", mode: "format" }),
    ]);

    // 同 id 覆盖更新
    upsertJsonTab({ id: "j1", title: "改名", input: "[]", mode: "minify" });
    vi.advanceTimersByTime(250);
    expect(loadState(STORAGE_KEYS.jsonTabs, [])).toEqual([
      expect.objectContaining({ id: "j1", title: "改名", mode: "minify" }),
    ]);

    // 删除
    deleteJsonTab("j1");
    vi.advanceTimersByTime(250);
    expect(loadState(STORAGE_KEYS.jsonTabs, [])).toEqual([]);
    vi.useRealTimers();
  });

  it("dispatches per-item commands to SQLite in the Tauri runtime", () => {
    mockTauri();
    const link = makeLink({ id: "l1", title: "A" });
    upsertLink(link);
    deleteLink("l1");
    upsertNote({ id: "n1", title: "笔记", content: "", groupId: null, time: "" });
    deleteNote("n1");
    upsertClipboardItem({ id: "c1", text: "x", createdAt: 1 });
    deleteClipboardItem("c1");
    clearClipboardItems();
    upsertJsonTab({ id: "j1", title: "格式化", input: "{}", mode: "format" });
    deleteJsonTab("j1");

    expect(mockedInvoke).toHaveBeenCalledWith("upsert_link", { link });
    expect(mockedInvoke).toHaveBeenCalledWith("delete_link", { id: "l1" });
    expect(mockedInvoke).toHaveBeenCalledWith("upsert_note", {
      note: { id: "n1", title: "笔记", content: "", groupId: null, time: "" },
    });
    expect(mockedInvoke).toHaveBeenCalledWith("delete_note", { id: "n1" });
    expect(mockedInvoke).toHaveBeenCalledWith("upsert_clipboard_item", {
      item: { id: "c1", text: "x", createdAt: 1 },
    });
    expect(mockedInvoke).toHaveBeenCalledWith("delete_clipboard_item", { id: "c1" });
    expect(mockedInvoke).toHaveBeenCalledWith("clear_clipboard_items");
    expect(mockedInvoke).toHaveBeenCalledWith("upsert_json_tab", {
      tab: { id: "j1", title: "格式化", input: "{}", mode: "format" },
    });
    expect(mockedInvoke).toHaveBeenCalledWith("delete_json_tab", { id: "j1" });
  });
});
