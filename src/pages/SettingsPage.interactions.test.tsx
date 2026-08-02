import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  disable,
  enable,
  isEnabled,
} from "@tauri-apps/plugin-autostart";
import App from "../App";
import {
  DEFAULT_SETTINGS,
  SETTINGS_COMMANDS,
  type AppSettings,
} from "../features/settings/types";
import { STORAGE_KEYS } from "../lib/storage";

// 非 Tauri 测试环境：mock 开机自启插件（页面在浏览器 dev 模式下静默降级）
vi.mock("@tauri-apps/plugin-autostart", () => ({
  isEnabled: vi.fn().mockResolvedValue(false),
  enable: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedEnable = vi.mocked(enable);
const mockedDisable = vi.mocked(disable);
const mockedIsEnabled = vi.mocked(isEnabled);
const mockedOpen = vi.mocked(open);
const mockedSave = vi.mocked(save);
const mockedInvoke = vi.mocked(invoke);

/** 模拟 Tauri 运行时：注入 __TAURI_INTERNALS__ 并让 invoke 按命令分发 */
function mockTauriRuntime(settingsOverrides: Partial<AppSettings> = {}) {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  mockedInvoke.mockImplementation((cmd: string) => {
    if (cmd === SETTINGS_COMMANDS.get)
      return Promise.resolve({ ...DEFAULT_SETTINGS, ...settingsOverrides });
    if (cmd === "plugin:app|version") return Promise.resolve("0.1.0");
    return Promise.resolve(undefined);
  });
}

function readSavedSettings(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) ?? "{}");
}

describe("SettingsPage interactions", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/settings");
    vi.clearAllMocks();
    mockedIsEnabled.mockResolvedValue(false);
    mockedOpen.mockResolvedValue(null);
    mockedSave.mockResolvedValue(null);
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("renders all settings sections", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "常规" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "窗口" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "快捷键" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "关于" })).toBeInTheDocument();
  });

  it("toggles a switch and persists to localStorage", async () => {
    const user = userEvent.setup();
    render(<App />);

    const closeToTray = await screen.findByRole("switch", {
      name: "关闭窗口时最小化到托盘",
    });
    await user.click(closeToTray);

    await waitFor(() => {
      expect(readSavedSettings().close_to_tray).toBe(true);
    });
    expect(await screen.findByText("已保存")).toBeInTheDocument();
  });

  it("restores previously saved settings from localStorage", async () => {
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        close_to_tray: true,
        window_width: 900,
        global_shortcut: "Ctrl+Shift+L",
      }),
    );
    render(<App />);

    const closeToTray = await screen.findByRole("switch", {
      name: "关闭窗口时最小化到托盘",
    });
    expect(closeToTray).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("spinbutton", { name: "窗口宽度" })).toHaveValue(900);
    expect(
      screen.getAllByRole("button", { name: /绑定快捷键/ })[0],
    ).toHaveTextContent("Ctrl+Shift+L");
  });

  it("applies valid window size and persists it", async () => {
    const user = userEvent.setup();
    render(<App />);

    const widthInput = await screen.findByRole("spinbutton", { name: "窗口宽度" });
    const heightInput = screen.getByRole("spinbutton", { name: "窗口高度" });
    await user.clear(widthInput);
    await user.type(widthInput, "960");
    await user.clear(heightInput);
    await user.type(heightInput, "680");
    await user.click(screen.getByRole("button", { name: "应用" }));

    await waitFor(() => {
      expect(readSavedSettings().window_width).toBe(960);
      expect(readSavedSettings().window_height).toBe(680);
    });
  });

  it("rejects window sizes below the minimum without persisting", async () => {
    const user = userEvent.setup();
    render(<App />);

    const widthInput = await screen.findByRole("spinbutton", { name: "窗口宽度" });
    const heightInput = screen.getByRole("spinbutton", { name: "窗口高度" });
    await user.clear(widthInput);
    await user.type(widthInput, "100");
    await user.clear(heightInput);
    await user.type(heightInput, "100");
    await user.click(screen.getByRole("button", { name: "应用" }));

    expect(await screen.findByText(/不小于 640×400/)).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toBeNull();
  });

  it("captures a global shortcut by pressing the combo and persists it", async () => {
    const user = userEvent.setup();
    render(<App />);

    // 点击第一个快捷键录入器进入捕获模式，按下 Ctrl+Shift+L
    await user.click(
      (await screen.findAllByRole("button", { name: /绑定快捷键/ }))[0],
    );
    await user.keyboard("{Control>}{Shift>}l{/Shift}{/Control}");
    await user.click(screen.getAllByRole("button", { name: "保存" })[0]);

    await waitFor(() => {
      expect(readSavedSettings().global_shortcut).toBe("Ctrl+Shift+L");
    });

    // 点击清除按钮再保存 = 停用快捷键
    await user.click(screen.getAllByRole("button", { name: "清除快捷键" })[0]);
    await user.click(screen.getAllByRole("button", { name: "保存" })[0]);
    await waitFor(() => {
      expect(readSavedSettings().global_shortcut).toBeNull();
    });
  });

  it("calls the autostart plugin when the switch is toggled", async () => {
    const user = userEvent.setup();
    render(<App />);

    const autostartSwitch = await screen.findByRole("switch", {
      name: "开机自启动",
    });
    await user.click(autostartSwitch);
    expect(mockedEnable).toHaveBeenCalledTimes(1);

    await user.click(autostartSwitch);
    expect(mockedDisable).toHaveBeenCalledTimes(1);
  });

  it("disables restart and update buttons outside the Tauri runtime", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "关于" });
    expect(screen.getByRole("button", { name: /重启应用/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /检查更新/ })).toBeDisabled();
  });

  it("disables data actions outside the Tauri runtime", async () => {
    render(<App />);

    const dataHeading = await screen.findByRole("heading", { name: "数据" });
    expect(dataHeading).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /选择/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /导出备份/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /导入恢复/ })).toBeDisabled();
  });
});

describe("SettingsPage data settings (Tauri runtime)", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/settings");
    vi.clearAllMocks();
    mockedIsEnabled.mockResolvedValue(false);
    mockedOpen.mockResolvedValue(null);
    mockedSave.mockResolvedValue(null);
  });

  it("saves a chosen database path via set_settings", async () => {
    const user = userEvent.setup();
    mockTauriRuntime();
    mockedOpen.mockResolvedValue("D:/ltools-data");

    render(<App />);
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith(SETTINGS_COMMANDS.get),
    );

    await user.click((await screen.findAllByRole("button", { name: "选择" }))[0]);
    expect(mockedOpen).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true }),
    );
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        SETTINGS_COMMANDS.set,
        expect.objectContaining({
          settings: expect.objectContaining({ db_path: "D:/ltools-data" }),
        }),
      );
    });
  });

  it("exports a backup with collected module data", async () => {
    const user = userEvent.setup();
    mockTauriRuntime({ backup_dir: "D:/backups" });
    const backupName = `ltools-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    const backupPath = `D:/backups/${backupName}`;
    mockedSave.mockResolvedValue(backupPath);
    localStorage.setItem(
      STORAGE_KEYS.links,
      JSON.stringify([{ id: "l1", title: "链接 A" }]),
    );

    render(<App />);
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith(SETTINGS_COMMANDS.get),
    );
    // 等待设置真正渲染完成（备份目录值出现）
    await screen.findByText("D:/backups");

    await user.click(await screen.findByRole("button", { name: /导出备份/ }));

    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: backupPath,
        }),
      );
      expect(mockedInvoke).toHaveBeenCalledWith(
        SETTINGS_COMMANDS.exportBackup,
        expect.objectContaining({
          path: backupPath,
          data: expect.objectContaining({
            links: [{ id: "l1", title: "链接 A" }],
          }),
        }),
      );
    });
    expect(await screen.findByText("备份已导出")).toBeInTheDocument();
  });

  it("imports a backup and restores module data", async () => {
    const user = userEvent.setup();
    mockTauriRuntime();
    mockedOpen.mockResolvedValue("D:/backups/old.zip");
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === SETTINGS_COMMANDS.get)
        return Promise.resolve({ ...DEFAULT_SETTINGS });
      if (cmd === "plugin:app|version") return Promise.resolve("0.1.0");
      if (cmd === SETTINGS_COMMANDS.importBackup)
        return Promise.resolve({
          links: [{ id: "restored" }],
          notes: [],
          clipboardItems: [],
        });
      return Promise.resolve(undefined);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /导入恢复/ }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        SETTINGS_COMMANDS.importBackup,
        expect.objectContaining({ path: "D:/backups/old.zip" }),
      );
    });
    // Tauri 模式下导入数据经 replace_all_data 写入 SQLite
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        "replace_all_data",
        expect.objectContaining({
          data: expect.objectContaining({
            links: [{ id: "restored" }],
          }),
        }),
      );
    });
    expect(await screen.findByText(/备份已导入/)).toBeInTheDocument();
  });

  it("captures the quick search shortcut via the recorder", async () => {
    const user = userEvent.setup();
    mockTauriRuntime();
    render(<App />);
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith(SETTINGS_COMMANDS.get),
    );

    // 第二个录入器 = 快捷搜索快捷键，按下 Ctrl+Shift+Space
    await user.click(screen.getAllByRole("button", { name: /绑定快捷键/ })[1]);
    await user.keyboard("{Control>}{Shift>} {/Shift}{/Control}");
    await user.click(screen.getAllByRole("button", { name: "保存" })[1]);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        SETTINGS_COMMANDS.set,
        expect.objectContaining({
          settings: expect.objectContaining({
            quick_search_shortcut: "Ctrl+Shift+Space",
          }),
        }),
      );
    });
  });
});
