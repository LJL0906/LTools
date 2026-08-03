/**
 * 设置模块类型定义。
 * 字段名与 Rust 侧 `AppSettings`（serde 默认 snake_case）保持一致，
 * 通过 `invoke("get_settings" / "set_settings")` 读写 SQLite `app_settings` 表。
 */

export interface AppSettings {
  /** 启动时最小化到托盘（不显示主窗口） */
  minimize_to_tray: boolean;
  /** 点击窗口关闭按钮时最小化到托盘（而非退出进程） */
  close_to_tray: boolean;
  /** 自定义窗口宽度（0 = 使用默认尺寸） */
  window_width: number;
  /** 自定义窗口高度（0 = 使用默认尺寸） */
  window_height: number;
  /** 全局快捷键（如 "CommandOrControl+Shift+L"），null 表示未启用 */
  global_shortcut: string | null;
  /** 快捷搜索窗口快捷键（如 "CommandOrControl+Shift+Space"），null 表示停用 */
  quick_search_shortcut: string | null;
  /** 备份目录 */
  backup_dir: string | null;
  /** 数据库存储路径（SQLite 数据层迁移后生效） */
  db_path: string | null;
  /** 更新代理地址（如 http://127.0.0.1:7892），null 表示不配置（走系统代理/直连） */
  update_proxy: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  minimize_to_tray: false,
  close_to_tray: false,
  window_width: 0,
  window_height: 0,
  global_shortcut: null,
  quick_search_shortcut: null,
  backup_dir: null,
  db_path: null,
  update_proxy: null,
};

/** 前端调用的 Tauri command 名 */
export const SETTINGS_COMMANDS = {
  get: "get_settings",
  set: "set_settings",
  restart: "restart_app",
  exportBackup: "export_backup",
  importBackup: "import_backup",
} as const;

/** 备份数据负载：各模块数据快照（与 AllData 字段一致） */
export interface BackupData {
  links?: import("../links/types").LinkItem[];
  linkGroups?: import("../groups/types").GroupItem[];
  notes?: import("../notes/types").NoteItem[];
  noteGroups?: import("../groups/types").GroupItem[];
  clipboardItems?: import("../clipboard/types").ClipboardEntry[];
  jsonTabs?: import("../../lib/data").JsonTabItem[];
  settings?: unknown;
}

/** 最小可用窗口尺寸（与 tauri.conf.json 的 minWidth/minHeight 一致） */
export const MIN_WINDOW_WIDTH = 640;
export const MIN_WINDOW_HEIGHT = 400;
