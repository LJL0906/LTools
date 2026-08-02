import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  isTauriRuntime,
  loadLinksData,
  loadNotesData,
  persistLinks,
  persistNotes,
} from "./data";
import { STORAGE_KEYS } from "./storage";
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
