//! 应用设置：持久化于 SQLite `app_settings` 表（与业务数据同库）。
//!
//! 系统级设置（窗口尺寸、托盘行为、全局快捷键、备份/数据库路径）需要 Rust
//! 在启动早期读取并应用，因此存 Rust 侧数据库而非 localStorage。启动时先打开
//! 默认引导库（`app_data_dir/ltools.db`）读取设置；若配置了自定义数据库路径则
//! 切换到目标库并重新读取。设置写入时同步写到「当前库 + 默认引导库」两份，
//! 保证引导库中的 `db_path` 指针始终最新。读取失败回退默认值，向前兼容由
//! `#[serde(default)]` 保证：新增字段不会破坏旧数据。

use std::fs::File;
use std::io::{Read, Write};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

/// 应用设置结构。所有字段带默认值：新字段加入不影响旧数据读取。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    /// 启动时最小化到托盘（不显示主窗口）
    pub minimize_to_tray: bool,
    /// 点击窗口关闭按钮时最小化到托盘（而非退出进程）
    pub close_to_tray: bool,
    /// 自定义窗口宽度（0 = 使用默认尺寸）
    pub window_width: u32,
    /// 自定义窗口高度（0 = 使用默认尺寸）
    pub window_height: u32,
    /// 全局快捷键（如 "CommandOrControl+Shift+L"），None 表示未启用
    pub global_shortcut: Option<String>,
    /// 快捷搜索窗口快捷键（如 "CommandOrControl+Shift+Space"），None 表示停用
    pub quick_search_shortcut: Option<String>,
    /// 备份目录
    pub backup_dir: Option<String>,
    /// 数据库存储目录（数据库文件为 `目录/ltools.db`），None 表示默认目录
    pub db_path: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            minimize_to_tray: false,
            close_to_tray: false,
            window_width: 0,
            window_height: 0,
            global_shortcut: None,
            quick_search_shortcut: None,
            backup_dir: None,
            db_path: None,
        }
    }
}

impl AppSettings {
    /// 自定义窗口尺寸：宽高均达到最小窗口约束时才生效，否则返回 None（用默认）。
    pub fn custom_window_size(&self) -> Option<(u32, u32)> {
        if self.window_width >= 640 && self.window_height >= 400 {
            Some((self.window_width, self.window_height))
        } else {
            None
        }
    }
}

/// 进程内设置状态：内存缓存，command 通过 State 读写。
pub struct SettingsState(pub Mutex<AppSettings>);

/// 旧版（v0.1.0 前）设置文件：`app_config_dir/settings.json`。读取失败返回 None。
fn load_legacy_file_settings(app: &AppHandle) -> Option<AppSettings> {
    let path = app.path().app_config_dir().ok()?.join("settings.json");
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// 初始化设置：从当前库读取并缓存；若配置了自定义数据库路径则切换主库后重新读取。
/// 首次（数据库无设置行）时把旧版 settings.json 一次性迁移进库。
pub fn init(app: &AppHandle, db: &crate::db::DbState) -> Result<AppSettings, String> {
    let stored = crate::db::read_settings(&db.conn.lock().unwrap())?;
    let mut settings = match stored {
        Some(s) => s,
        // 首次启动：尝试迁移旧版文件设置
        None => {
            let legacy = load_legacy_file_settings(app).unwrap_or_default();
            crate::db::write_settings(&db.conn.lock().unwrap(), &legacy)?;
            legacy
        }
    };

    let default_path = crate::db::default_db_path(app)?;
    let resolved = crate::db::resolve_db_path(app, &settings)?;
    if resolved != default_path {
        crate::db::switch_db(app, db, &resolved)?;
        if let Some(s) = crate::db::read_settings(&db.conn.lock().unwrap())? {
            settings = s;
        }
    }

    app.manage(SettingsState(Mutex::new(settings.clone())));
    Ok(settings)
}

/// 把当前设置应用到主窗口尺寸（仅当配置了合法的自定义尺寸）。
fn apply_window_size(app: &AppHandle, settings: &AppSettings) {
    if let Some((w, h)) = settings.custom_window_size() {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_size(tauri::PhysicalSize::new(w, h));
        }
    }
}

/// 规范化快捷键字符串：去掉所有空白字符，兼容旧版手动输入的 "Alt + t" 格式。
/// Tauri 的 `Shortcut::from_str` 不接受空白（"Alt + t" 会解析失败导致注册静默无效）。
fn normalize_shortcut(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

/// 应用全局快捷键：先注销全部，再按配置注册。
/// - `global_shortcut`：切换主窗口显示 / 隐藏（toggle）；
/// - `quick_search_shortcut`：唤起快捷搜索窗口。
/// 注册失败（格式非法 / 被其他应用占用）返回错误信息。
pub fn apply_global_shortcut(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();

    if let Some(shortcut) = &settings.global_shortcut {
        let shortcut = normalize_shortcut(shortcut);
        shortcuts
            .on_shortcut(shortcut.as_str(), |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    toggle_main_window(app);
                }
            })
            .map_err(|e| format!("全局快捷键 {shortcut} 注册失败：{e}"))?;
    }

    if let Some(shortcut) = &settings.quick_search_shortcut {
        let shortcut = normalize_shortcut(shortcut);
        shortcuts
            .on_shortcut(shortcut.as_str(), |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    toggle_quick_search(app);
                }
            })
            .map_err(|e| format!("快捷搜索快捷键 {shortcut} 注册失败：{e}"))?;
    }
    Ok(())
}

/// 显示 / 隐藏快捷搜索窗口（快捷键显隐循环）。
/// 窗口存在且可见 → 隐藏；不存在或已隐藏 → 显示（无则创建）并聚焦，
/// 并通知前端聚焦输入框（每次显示都主动聚焦一次）。
pub fn toggle_quick_search(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("search") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = app.emit("quick-search-shown", ());
        }
        return;
    }
    let builder = tauri::WebviewWindowBuilder::new(
        app,
        "search",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("LTools 快捷搜索")
    .inner_size(560.0, 440.0)
    .min_inner_size(560.0, 400.0)
    .resizable(false)
    .center();
    if let Err(e) = builder.build() {
        eprintln!("创建快捷搜索窗口失败：{e}");
    }
}

/// 从快捷搜索窗口打开一条笔记：唤起主窗口并通知选中该笔记，同时隐藏搜索窗口。
#[tauri::command]
pub fn open_note_in_main(app: AppHandle, note_id: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    // 通知主窗口前端跳转到笔记页并选中目标笔记
    let _ = app.emit("open-note", note_id.clone());
    if let Some(window) = app.get_webview_window("search") {
        let _ = window.hide();
    }
    Ok(())
}

/// 显示主窗口（取消最小化 → 显示 → 聚焦）。
fn show_main_window<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 切换主窗口显示 / 隐藏（全局快捷键使用，显隐循环）：
/// 窗口可见且未最小化 → 隐藏到托盘；隐藏/最小化 → 显示并聚焦。
/// 注意：托盘图标与菜单仍用 `show_main_window`（只显示），避免误触隐藏。
fn toggle_main_window<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let shown = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
        if shown {
            let _ = window.hide();
        } else {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// 创建系统托盘图标与菜单（显示主窗口 / 退出）。
/// 左键单击托盘图标同样显示主窗口。
pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("LTools 缺少默认窗口图标（打包资源缺失）");

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("LTools")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands（前端通过 invoke 调用）
// ---------------------------------------------------------------------------

/// 读取当前设置。
#[tauri::command]
pub fn get_settings(state: State<'_, SettingsState>) -> AppSettings {
    state.0.lock().unwrap().clone()
}

/// 保存设置：写入 SQLite（当前库 + 默认引导库）+ 更新内存 + 即时应用窗口尺寸与全局快捷键；
/// 若数据库路径发生变化则迁移数据并切换到新库。
#[tauri::command]
pub fn set_settings(
    app: AppHandle,
    state: State<'_, SettingsState>,
    db_state: State<'_, crate::db::DbState>,
    settings: AppSettings,
) -> Result<(), String> {
    let db_path_changed = {
        let current = state.0.lock().unwrap();
        current.db_path != settings.db_path
    };

    // 0. 先验证并应用快捷键（失败则提示，不保存设置）
    apply_global_shortcut(&app, &settings)?;

    // 1. 写入当前库
    crate::db::write_settings(&db_state.conn.lock().unwrap(), &settings)?;

    // 2. 同步写入默认引导库（保证 db_path 指针与设置始终最新）；
    //    当前库即默认库时跳过（避免重复写同一文件）。
    {
        let current_path = db_state.path.lock().unwrap().clone();
        let default_path = crate::db::default_db_path(&app)?;
        if current_path != default_path {
            if let Ok(conn) = crate::db::open_bootstrap(&default_path) {
                let _ = crate::db::write_settings(&conn, &settings);
            }
        }
    }

    // 3. 更新内存并应用即时行为（快捷键已在第 0 步应用）
    *state.0.lock().unwrap() = settings.clone();
    apply_window_size(&app, &settings);

    // 4. 数据库路径变更 → 迁移数据与设置到新库
    if db_path_changed {
        let new_path = crate::db::resolve_db_path(&app, &settings)?;
        crate::db::switch_db(&app, &db_state, &new_path)?;
    }
    Ok(())
}

/// 重新启动应用（`AppHandle::restart`，发散类型，永不正常返回）。
#[tauri::command]
pub fn restart_app(app: AppHandle) -> Result<(), String> {
    app.restart();
}

// ---------------------------------------------------------------------------
// 备份 / 导入导出
// ---------------------------------------------------------------------------

/// 备份 zip 内的清单文件名。
const BACKUP_MANIFEST: &str = "manifest.json";
/// 备份格式标识（用于导入时校验文件有效性）。
const BACKUP_FORMAT: &str = "ltools-backup";
/// 备份格式版本。
const BACKUP_VERSION: u32 = 1;

/// 导出备份：把前端收集的各模块数据打包为 zip 写到指定路径。
///
/// zip 内只含一个 `manifest.json`：
/// `{ "format": "ltools-backup", "version": 1, "exported_at": <unix秒>, "data": <前端数据> }`
#[tauri::command]
pub fn export_backup(path: String, data: serde_json::Value) -> Result<(), String> {
    let exported_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let manifest = serde_json::json!({
        "format": BACKUP_FORMAT,
        "version": BACKUP_VERSION,
        "exported_at": exported_at,
        "data": data,
    });
    let json =
        serde_json::to_string_pretty(&manifest).map_err(|e| format!("序列化备份失败：{e}"))?;

    let file = File::create(&path).map_err(|e| format!("无法创建备份文件：{e}"))?;
    let mut zip = ZipWriter::new(file);
    zip.start_file(BACKUP_MANIFEST, SimpleFileOptions::default())
        .map_err(|e| format!("写入备份失败：{e}"))?;
    zip.write_all(json.as_bytes())
        .map_err(|e| format!("写入备份失败：{e}"))?;
    zip.finish().map_err(|e| format!("完成备份失败：{e}"))?;
    Ok(())
}

/// 导入备份：读取 zip 中的 manifest.json，校验格式后返回 `data` 部分，
/// 由前端写回各模块的 localStorage 并刷新。
#[tauri::command]
pub fn import_backup(path: String) -> Result<serde_json::Value, String> {
    let file = File::open(&path).map_err(|e| format!("无法打开备份文件：{e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("读取备份失败：{e}"))?;
    let mut entry = archive
        .by_name(BACKUP_MANIFEST)
        .map_err(|_| "备份文件缺少 manifest.json".to_string())?;
    let mut json = String::new();
    entry
        .read_to_string(&mut json)
        .map_err(|e| format!("读取备份清单失败：{e}"))?;

    let manifest: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("备份清单损坏：{e}"))?;
    if manifest.get("format").and_then(|v| v.as_str()) != Some(BACKUP_FORMAT) {
        return Err("不是有效的 LTools 备份文件".into());
    }
    manifest
        .get("data")
        .cloned()
        .ok_or_else(|| "备份文件缺少数据".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_backup_path(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("ltools-backup-tests");
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    /// 导出 → 导入往返：数据应完整一致（含中文、嵌套结构、设置）。
    #[test]
    fn backup_export_import_roundtrip_preserves_data() {
        let path = temp_backup_path("roundtrip.zip");
        let data = serde_json::json!({
            "links": [{
                "id": "l1", "title": "API 文档", "protocol": "https",
                "address": "example.com", "notes": "接口说明", "groupId": "g1"
            }],
            "linkGroups": [{"id": "g1", "name": "工作"}],
            "notes": [{
                "id": "n1", "title": "会议记录", "content": "<p>中文内容</p>",
                "groupId": null, "time": "刚刚"
            }],
            "noteGroups": [],
            "clipboardItems": [{"id": "c1", "text": "剪贴板内容", "createdAt": 1700000000}],
            "settings": {"windowWidth": 960, "windowHeight": 680, "minimize_to_tray": true}
        });

        export_backup(path.to_str().unwrap().to_string(), data.clone()).unwrap();

        let got = import_backup(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(got, data, "导出导入往返后数据应逐字段一致");
        std::fs::remove_file(&path).ok();
    }

    /// 非 zip 文件、以及缺 manifest.json 的 zip 都应被拒绝。
    #[test]
    fn import_rejects_invalid_archive() {
        let bad = temp_backup_path("not-a-zip.txt");
        std::fs::write(&bad, "this is not a zip").unwrap();
        assert!(import_backup(bad.to_str().unwrap().to_string()).is_err());

        let zip_path = temp_backup_path("no-manifest.zip");
        {
            let f = std::fs::File::create(&zip_path).unwrap();
            let mut zw = ZipWriter::new(f);
            zw.start_file("other.txt", SimpleFileOptions::default()).unwrap();
            std::io::Write::write_all(&mut zw, b"x").unwrap();
            zw.finish().unwrap();
        }
        assert!(
            import_backup(zip_path.to_str().unwrap().to_string()).is_err(),
            "缺少 manifest.json 的 zip 应被拒绝"
        );
        std::fs::remove_file(&bad).ok();
        std::fs::remove_file(&zip_path).ok();
    }

    /// manifest 中 format 标识不是 ltools-backup 时拒绝导入。
    #[test]
    fn import_rejects_wrong_format() {
        let zip_path = temp_backup_path("wrong-format.zip");
        {
            let f = std::fs::File::create(&zip_path).unwrap();
            let mut zw = ZipWriter::new(f);
            zw.start_file(BACKUP_MANIFEST, SimpleFileOptions::default())
                .unwrap();
            let manifest = serde_json::json!({ "format": "other-app", "version": 1, "data": {} });
            let raw = serde_json::to_string(&manifest).unwrap();
            std::io::Write::write_all(&mut zw, raw.as_bytes()).unwrap();
            zw.finish().unwrap();
        }
        assert!(
            import_backup(zip_path.to_str().unwrap().to_string()).is_err(),
            "format 标识不匹配的备份应被拒绝"
        );
        std::fs::remove_file(&zip_path).ok();
    }
}
