import { describe, expect, it } from "vitest";
import { eventToShortcut } from "./ShortcutRecorder";

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("eventToShortcut", () => {
  it("converts Ctrl+Shift+L to Tauri format", () => {
    expect(
      eventToShortcut(keyEvent({ key: "l", ctrlKey: true, shiftKey: true })),
    ).toBe("Ctrl+Shift+L");
  });

  it("converts Ctrl+Space", () => {
    expect(eventToShortcut(keyEvent({ key: " ", ctrlKey: true }))).toBe(
      "Ctrl+Space",
    );
  });

  it("converts Alt+F4", () => {
    expect(eventToShortcut(keyEvent({ key: "F4", altKey: true }))).toBe(
      "Alt+F4",
    );
  });

  it("rejects a bare letter key without modifiers", () => {
    expect(eventToShortcut(keyEvent({ key: "a" }))).toBeNull();
  });

  it("returns null for a bare modifier press (stays recording)", () => {
    expect(eventToShortcut(keyEvent({ key: "Control", ctrlKey: true }))).toBeNull();
    expect(eventToShortcut(keyEvent({ key: "Shift", shiftKey: true }))).toBeNull();
  });

  it("returns null for Escape (cancel capture)", () => {
    expect(eventToShortcut(keyEvent({ key: "Escape" }))).toBeNull();
  });

  it("handles arrow keys", () => {
    expect(
      eventToShortcut(keyEvent({ key: "ArrowUp", ctrlKey: true })),
    ).toBe("Ctrl+Up");
  });
});
