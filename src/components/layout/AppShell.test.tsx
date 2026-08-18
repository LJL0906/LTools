import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TooltipProvider } from "../shadcn/ui/tooltip";
import { AppShell } from "./AppShell";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedGetWindow = vi.mocked(getCurrentWindow);

function renderShell() {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={["/links"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/links" element={<div>links content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

describe("AppShell 置顶按钮", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    mockedGetWindow.mockReturnValue({
      isAlwaysOnTop: vi.fn().mockResolvedValue(false),
      setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
      isMaximized: vi.fn().mockResolvedValue(false),
      onResized: vi.fn().mockResolvedValue(() => undefined),
    } as unknown as ReturnType<typeof getCurrentWindow>);
  });

  it("非 Tauri 环境：置顶按钮存在但禁用", () => {
    renderShell();

    const pin = screen.getByRole("button", { name: "置顶主窗口" });
    expect(pin).toBeDisabled();
    expect(pin).toHaveAttribute("aria-pressed", "false");
  });

  it("Tauri 环境：点击置顶按钮应用窗口置顶并持久化设置", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    mockedInvoke.mockResolvedValue({ always_on_top: false });

    const user = userEvent.setup();
    renderShell();
    const pin = await screen.findByRole("button", { name: "置顶主窗口" });
    expect(pin).not.toBeDisabled();

    await user.click(pin);

    expect(mockedGetWindow().setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(mockedInvoke).toHaveBeenCalledWith("set_settings", {
      settings: expect.objectContaining({ always_on_top: true }),
    });
    // 激活后按钮变为「取消置顶」且 aria-pressed=true
    expect(
      screen.getByRole("button", { name: "取消置顶" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
