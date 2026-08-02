import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { Download, FolderOpen, RotateCcw, Upload } from "lucide-react";
import { Switch } from "@/components/shadcn/ui/switch";
import { Button } from "../components/ui/Button";
import {
  DEFAULT_SETTINGS,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  SETTINGS_COMMANDS,
  type AppSettings,
  type BackupData,
} from "../features/settings/types";
import { loadState, saveState, STORAGE_KEYS } from "../lib/storage";
import { getAllData, isTauriRuntime, saveAllData } from "../lib/data";
import { ShortcutRecorder } from "../components/ui/ShortcutRecorder";

/** 设置行：label + 说明 + 控件 */
function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  description?: string;
  htmlFor?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__meta">
        <label className="settings-row__label" htmlFor={htmlFor}>
          {label}
        </label>
        {description ? (
          <p className="settings-row__description">{description}</p>
        ) : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(null);
  const [widthValue, setWidthValue] = useState("");
  const [heightValue, setHeightValue] = useState("");
  const [shortcutValue, setShortcutValue] = useState<string | null>(null);
  const [searchShortcutValue, setSearchShortcutValue] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 初始加载：设置 + 开机自启状态 + 版本号（非 Tauri 环境逐项降级） */
  useEffect(() => {
    let disposed = false;

    const load = async () => {
      let loaded: AppSettings | null = null;
      if (isTauriRuntime()) {
        try {
          loaded = await invoke<AppSettings>(SETTINGS_COMMANDS.get);
        } catch {
          loaded = null;
        }
      }
      if (disposed) return;
      const resolved = loaded ?? loadState(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
      setSettings(resolved);
      setWidthValue(resolved.window_width > 0 ? String(resolved.window_width) : "");
      setHeightValue(resolved.window_height > 0 ? String(resolved.window_height) : "");
      setShortcutValue(resolved.global_shortcut);
      setSearchShortcutValue(resolved.quick_search_shortcut);

      try {
        const auto = await isAutostartEnabled();
        if (!disposed) setAutostartEnabled(auto);
      } catch {
        if (!disposed) setAutostartEnabled(false);
      }

      try {
        const version = await getVersion();
        if (!disposed) setAppVersion(version);
      } catch {
        // 非 Tauri 环境：保留默认版本
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, []);

  /** 反馈提示自动消失 */
  useEffect(() => {
    if (!notice && !error) return;
    const timer = window.setTimeout(() => {
      setNotice(null);
      setError(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [notice, error]);

  /** 持久化设置：Tauri 环境写 settings.json（Rust 同时应用窗口尺寸/快捷键），否则 localStorage */
  const persist = async (next: AppSettings): Promise<boolean> => {
    setSettings(next);
    if (isTauriRuntime()) {
      try {
        await invoke(SETTINGS_COMMANDS.set, { settings: next });
        setNotice("已保存");
        return true;
      } catch (e) {
        setError(`保存失败：${String(e)}`);
        return false;
      }
    }
    saveState(STORAGE_KEYS.settings, next);
    setNotice("已保存");
    return true;
  };

  /** 开关类设置：切换后立即保存 */
  const toggleSetting = (key: keyof AppSettings, checked: boolean) => {
    if (!settings) return;
    void persist({ ...settings, [key]: checked });
  };

  /** 开机自启：调 autostart 插件（失败回滚并提示） */
  const toggleAutostart = async (checked: boolean) => {
    setAutostartEnabled(checked);
    try {
      if (checked) await enableAutostart();
      else await disableAutostart();
    } catch {
      setAutostartEnabled(!checked);
      setError("开机自启设置失败（开发模式下可能不可用）");
    }
  };

  /** 应用窗口尺寸：校验后保存（Rust 侧 set_settings 会即时调整窗口） */
  const applyWindowSize = async () => {
    if (!settings) return;
    const width = Number(widthValue);
    const height = Number(heightValue);
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < MIN_WINDOW_WIDTH ||
      height < MIN_WINDOW_HEIGHT
    ) {
      setError(`窗口尺寸需为整数，且不小于 ${MIN_WINDOW_WIDTH}×${MIN_WINDOW_HEIGHT}`);
      return;
    }
    await persist({ ...settings, window_width: width, window_height: height });
  };

  /** 保存全局快捷键（null = 停用） */
  const saveShortcut = async () => {
    if (!settings) return;
    await persist({ ...settings, global_shortcut: shortcutValue });
  };

  /** 保存快捷搜索快捷键（null = 停用） */
  const saveSearchShortcut = async () => {
    if (!settings) return;
    await persist({ ...settings, quick_search_shortcut: searchShortcutValue });
  };

  /** 选择数据库存储目录并保存（SQLite 数据层迁移后生效） */
  const chooseDbPath = async () => {
    if (!settings || !isTauriRuntime()) return;
    try {
      const selected = await open({
        directory: true,
        title: "选择数据库存储目录",
      });
      if (typeof selected === "string") {
        await persist({ ...settings, db_path: selected });
      }
    } catch {
      // 用户取消 / 非 Tauri 环境
    }
  };

  /** 选择备份目录并保存 */
  const chooseBackupDir = async () => {
    if (!settings || !isTauriRuntime()) return;
    try {
      const selected = await open({
        directory: true,
        title: "选择备份目录",
      });
      if (typeof selected === "string") {
        await persist({ ...settings, backup_dir: selected });
      }
    } catch {
      // 用户取消 / 非 Tauri 环境
    }
  };

  /** 收集各模块数据快照用于导出备份（Tauri 从 SQLite 读，浏览器从 localStorage 读） */
  const collectBackupData = async (): Promise<BackupData> => {
    const all = await getAllData();
    return {
      links: all.links,
      linkGroups: all.linkGroups,
      notes: all.notes,
      noteGroups: all.noteGroups,
      clipboardItems: all.clipboardItems,
      settings,
    };
  };

  /** 导出备份：选择保存位置 → Rust 打包 zip */
  const exportBackup = async () => {
    if (!settings || !isTauriRuntime()) return;
    try {
      const defaultPath = settings.backup_dir
        ? `${settings.backup_dir.replace(/[\\/]+$/, "")}/ltools-backup-${new Date().toISOString().slice(0, 10)}.zip`
        : `ltools-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      const path = await save({
        title: "导出备份",
        defaultPath,
        filters: [{ name: "LTools 备份", extensions: ["zip"] }],
      });
      if (typeof path !== "string") return; // 用户取消
      await invoke(SETTINGS_COMMANDS.exportBackup, {
        path,
        data: await collectBackupData(),
      });
      setNotice("备份已导出");
    } catch (e) {
      setError(`导出失败：${String(e)}`);
    }
  };

  /** 导入备份：选择 zip → Rust 解压校验 → 写回 localStorage → 刷新页面 */
  const importBackup = async () => {
    if (!isTauriRuntime()) return;
    try {
      const path = await open({
        title: "选择备份文件",
        multiple: false,
        filters: [{ name: "LTools 备份", extensions: ["zip"] }],
      });
      if (typeof path !== "string") return; // 用户取消
      const data = await invoke<BackupData>(SETTINGS_COMMANDS.importBackup, {
        path,
      });
      saveAllData({
        links: Array.isArray(data.links) ? data.links : [],
        linkGroups: Array.isArray(data.linkGroups) ? data.linkGroups : [],
        notes: Array.isArray(data.notes) ? data.notes : [],
        noteGroups: Array.isArray(data.noteGroups) ? data.noteGroups : [],
        clipboardItems: Array.isArray(data.clipboardItems)
          ? data.clipboardItems
          : [],
      });
      // 设置一并写回（Tauri 走 set_settings，浏览器写 localStorage）
      if (data.settings && typeof data.settings === "object") {
        if (isTauriRuntime()) {
          await invoke(SETTINGS_COMMANDS.set, { settings: data.settings }).catch(
            () => undefined,
          );
        } else {
          saveState(STORAGE_KEYS.settings, data.settings);
        }
      }
      setNotice("备份已导入，正在刷新…");
      window.setTimeout(() => {
        try {
          window.location.reload();
        } catch {
          // 测试 / 受限环境（如 jsdom）不支持导航，忽略
        }
      }, 300);
    } catch (e) {
      setError(`导入失败：${String(e)}`);
    }
  };

  /** 重启应用（仅 Tauri 环境可用） */
  const restartApp = () => {
    if (!isTauriRuntime()) return;
    void invoke(SETTINGS_COMMANDS.restart).catch(() => setError("重启失败"));
  };

  /** 检查更新：查询 GitHub Releases 端点，有新版则下载安装并重启 */
  const checkForUpdates = async () => {
    if (!isTauriRuntime()) {
      setError("检查更新仅在桌面应用中可用");
      return;
    }
    setCheckingUpdate(true);
    setError(null);
    try {
      const update = await check();
      if (!update) {
        setNotice(`已是最新版本（${appVersion}）`);
        return;
      }
      setNotice(`发现新版本 ${update.version}，正在下载并安装…`);
      await update.downloadAndInstall();
      setNotice("更新完成，正在重启…");
      window.setTimeout(() => {
        try {
          void invoke(SETTINGS_COMMANDS.restart);
        } catch {
          // 更新进程已退出则由系统接管
        }
      }, 500);
    } catch (e) {
      setError(`检查更新失败：${String(e)}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const tauriAvailable = isTauriRuntime();

  return (
    <section className="settings-page" aria-label="设置">
      {(notice || error) ? (
        <div aria-live="polite" className="settings-notice" role="status">
          {error ?? notice}
        </div>
      ) : null}

      <section aria-labelledby="settings-general" className="settings-section">
        <h2 className="settings-section__title" id="settings-general">
          常规
        </h2>
        <SettingsRow
          description="登录 Windows 后自动启动 LTools。"
          label="开机自启动"
        >
          <Switch
            aria-label="开机自启动"
            checked={autostartEnabled ?? false}
            disabled={autostartEnabled === null}
            data-testid="autostart-switch"
            onCheckedChange={(checked) => void toggleAutostart(checked)}
          />
        </SettingsRow>
        <SettingsRow
          description="启动 LTools 时不显示主窗口，仅驻留系统托盘。"
          label="启动时最小化到托盘"
        >
          <Switch
            aria-label="启动时最小化到托盘"
            checked={settings?.minimize_to_tray ?? false}
            disabled={settings === null}
            onCheckedChange={(checked) => toggleSetting("minimize_to_tray", checked)}
          />
        </SettingsRow>
        <SettingsRow
          description="点击窗口关闭按钮时隐藏到托盘而非退出进程。"
          label="关闭窗口时最小化到托盘"
        >
          <Switch
            aria-label="关闭窗口时最小化到托盘"
            checked={settings?.close_to_tray ?? false}
            disabled={settings === null}
            onCheckedChange={(checked) => toggleSetting("close_to_tray", checked)}
          />
        </SettingsRow>
      </section>

      <section aria-labelledby="settings-window" className="settings-section">
        <h2 className="settings-section__title" id="settings-window">
          窗口
        </h2>
        <SettingsRow
          description={`自定义主窗口尺寸（px），最小值 ${MIN_WINDOW_WIDTH}×${MIN_WINDOW_HEIGHT}。`}
          label="窗口尺寸"
        >
          <div className="settings-window-size">
            <input
              aria-label="窗口宽度"
              className="settings-window-size__input"
              inputMode="numeric"
              min={MIN_WINDOW_WIDTH}
              onChange={(event) => setWidthValue(event.target.value)}
              placeholder="宽度"
              type="number"
              value={widthValue}
            />
            <span aria-hidden="true">×</span>
            <input
              aria-label="窗口高度"
              className="settings-window-size__input"
              inputMode="numeric"
              min={MIN_WINDOW_HEIGHT}
              onChange={(event) => setHeightValue(event.target.value)}
              placeholder="高度"
              type="number"
              value={heightValue}
            />
            <Button
              disabled={settings === null}
              onClick={() => void applyWindowSize()}
              variant="primary"
            >
              应用
            </Button>
          </div>
        </SettingsRow>
      </section>

      <section aria-labelledby="settings-shortcut" className="settings-section">
        <h2 className="settings-section__title" id="settings-shortcut">
          快捷键
        </h2>
        <SettingsRow
          description="点击录入框后按下组合键即可绑定，用于全局唤起主窗口。"
          label="全局快捷键"
        >
          <div className="settings-shortcut">
            <ShortcutRecorder onChange={setShortcutValue} value={shortcutValue} />
            <Button
              disabled={settings === null}
              onClick={() => void saveShortcut()}
              variant="primary"
            >
              保存
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow
          description="点击录入框后按下组合键即可绑定，用于唤起快捷搜索窗口。"
          label="快捷搜索快捷键"
        >
          <div className="settings-shortcut">
            <ShortcutRecorder
              onChange={setSearchShortcutValue}
              value={searchShortcutValue}
            />
            <Button
              disabled={settings === null}
              onClick={() => void saveSearchShortcut()}
              variant="primary"
            >
              保存
            </Button>
          </div>
        </SettingsRow>
      </section>

      <section aria-labelledby="settings-data" className="settings-section">
        <h2 className="settings-section__title" id="settings-data">
          数据
        </h2>
        <SettingsRow
          description="LTools 数据的存储位置（SQLite 数据库文件，重启后生效）。"
          label="数据库存储路径"
        >
          <div className="settings-path">
            <span className="settings-path__value" title={settings?.db_path ?? undefined}>
              {settings?.db_path ?? "未设置"}
            </span>
            <Button
              disabled={!tauriAvailable}
              onClick={() => void chooseDbPath()}
              title={tauriAvailable ? undefined : "仅在桌面应用中可用"}
            >
              <FolderOpen aria-hidden="true" size={14} />
              选择
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow
          description="导出备份时默认保存到该目录。"
          label="备份目录"
        >
          <div className="settings-path">
            <span
              className="settings-path__value"
              title={settings?.backup_dir ?? undefined}
            >
              {settings?.backup_dir ?? "未设置"}
            </span>
            <Button
              disabled={!tauriAvailable}
              onClick={() => void chooseBackupDir()}
              title={tauriAvailable ? undefined : "仅在桌面应用中可用"}
            >
              <FolderOpen aria-hidden="true" size={14} />
              选择
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow
          description="把链接、笔记、剪切板与设置打包为 zip 文件；导入后恢复数据。"
          label="导入导出备份"
        >
          <div className="settings-about__actions">
            <Button
              disabled={!tauriAvailable}
              onClick={() => void exportBackup()}
              title={tauriAvailable ? undefined : "仅在桌面应用中可用"}
            >
              <Download aria-hidden="true" size={14} />
              导出备份
            </Button>
            <Button
              disabled={!tauriAvailable}
              onClick={() => void importBackup()}
              title={tauriAvailable ? undefined : "仅在桌面应用中可用"}
            >
              <Upload aria-hidden="true" size={14} />
              导入恢复
            </Button>
          </div>
        </SettingsRow>
      </section>

      <section aria-labelledby="settings-about" className="settings-section">
        <h2 className="settings-section__title" id="settings-about">
          关于
        </h2>
        <SettingsRow description={`LTools ${appVersion}`} label="版本">
          <div className="settings-about__actions">
            <Button
              disabled={!tauriAvailable}
              onClick={restartApp}
              title={tauriAvailable ? undefined : "仅在桌面应用中可用"}
            >
              <RotateCcw aria-hidden="true" size={14} />
              重启应用
            </Button>
            <Button
              disabled={checkingUpdate || !tauriAvailable}
              onClick={() => void checkForUpdates()}
              title={tauriAvailable ? undefined : "仅在桌面应用中可用"}
            >
              <Download aria-hidden="true" size={14} />
              {checkingUpdate ? "检查中…" : "检查更新"}
            </Button>
          </div>
        </SettingsRow>
      </section>
    </section>
  );
}
