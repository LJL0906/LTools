import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import App from "../App";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedListen = vi.mocked(listen);
const mockedInvoke = vi.mocked(invoke);

const NOTES_DB = {
  links: [], linkGroups: [],
  notes: [
    { id: "meeting", title: "项目会议记录", content: "<p>会议内容</p>", groupId: "project-a", time: "今天 14:32" },
    { id: "release-check", title: "发布检查清单", content: "<p>发布项</p>", groupId: null, time: "7 月 28 日" },
  ],
  noteGroups: [{ id: "work", name: "工作" }, { id: "project-a", name: "项目 A" }],
  clipboardItems: [],
};

describe("main window open-note integration", () => {
  let emitOpenNote: (noteId: string) => void;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    window.history.replaceState({}, "", "/links");
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_all_data") return Promise.resolve(NOTES_DB);
      return Promise.resolve(undefined);
    });
    mockedListen.mockImplementation((event, handler) => {
      if (event === "open-note") {
        emitOpenNote = (noteId) =>
          handler({ event, id: 0, payload: noteId } as Event<string>);
      }
      return Promise.resolve(() => undefined as unknown as UnlistenFn);
    });
  });

  it("navigates to notes and selects the target note", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    render(<App />);
    await waitFor(() => expect(mockedListen).toHaveBeenCalled());

    await act(async () => {
      emitOpenNote("release-check");
      await new Promise((r) => setTimeout(r, 100));
    });
    await new Promise((r) => setTimeout(r, 500));
    console.log("[debug] pathname:", window.location.pathname);
    console.log("[debug] display-values:", screen.queryAllByDisplayValue(/./).map((el) => (el as HTMLInputElement).value));

    expect(await screen.findByDisplayValue("发布检查清单")).toBeInTheDocument();
  });
});
