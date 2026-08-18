mod clipboard;
mod db;
mod settings;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::set_settings,
            settings::restart_app,
            settings::export_backup,
            settings::import_backup,
            settings::open_note_in_main,
            settings::open_main_window,
            settings::hide_search_window,
            db::get_all_data,
            db::replace_all_data,
            // 逐条 CRUD（upsert = 新增或更新单条）
            db::upsert_link,
            db::delete_link,
            db::upsert_link_group,
            db::delete_link_group,
            db::upsert_note,
            db::delete_note,
            db::upsert_note_group,
            db::delete_note_group,
            db::upsert_clipboard_item,
            db::delete_clipboard_item,
            db::clear_clipboard_items,
            db::upsert_json_tab,
            db::delete_json_tab,
        ])
        .setup(|app| {
            // 初始化 SQLite 数据层：先打开默认引导库（设置存于其中）
            let db_state = db::init(app.handle())?;
            app.manage(db_state);

            // 读取并缓存设置（窗口尺寸 / 托盘 / 快捷键行为由设置驱动；
            // 若配置了自定义数据库路径则在此切换到目标库）
            let settings = settings::init(app.handle(), &app.state::<crate::db::DbState>())?;

            if let Some(window) = app.get_webview_window("main") {
                match settings.custom_window_size() {
                    // 设置中配置了自定义尺寸：按配置显示
                    Some((w, h)) => {
                        let _ = window.set_size(tauri::PhysicalSize::new(w, h));
                    }
                    // 未配置：沿用默认布局（主屏幕 50% × 55%，居中）
                    None => {
                        if let Ok(Some(monitor)) = window.primary_monitor() {
                            let size = monitor.size();
                            let w = (size.width as f64 * 0.5) as u32;
                            let h = (size.height as f64 * 0.55) as u32;
                            let _ = window.set_size(tauri::PhysicalSize::new(w, h));
                        }
                    }
                }
                let _ = window.center();
                // "启动最小化到托盘"开启时不显示主窗口
                if !settings.minimize_to_tray {
                    let _ = window.show();
                }
                // 置顶设置（始终显示在其他应用之上）在启动时应用
                if settings.always_on_top {
                    let _ = window.set_always_on_top(true);
                }
            }

            // 预创建快捷搜索窗口（隐藏）：后台完成前端加载，
            // 首次按快捷键唤起时直接显示已就绪的界面（避免白屏等待）。
            // 仅当设置中启用了快捷搜索快捷键时才常驻，避免无用开销。
            if settings.quick_search_shortcut.is_some() {
                if let Err(e) = settings::create_search_window(app.handle(), false) {
                    eprintln!("预创建快捷搜索窗口失败：{e}");
                }
            }

            // 系统托盘：显示主窗口 / 退出
            settings::setup_tray(app)?;
            // 全局快捷键：按设置注册（注册失败不阻止应用启动，仅告警）
            if let Err(e) = settings::apply_global_shortcut(app.handle(), &settings) {
                eprintln!("快捷键注册失败：{e}");
            }

            clipboard::start_watcher(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    if window.label() == "search" {
                        // 快捷搜索窗口：关闭即隐藏（驻留，快捷键可再次唤起）
                        api.prevent_close();
                        let _ = window.hide();
                        return;
                    }
                    // 主窗口："关闭到托盘"开启时拦截关闭，隐藏窗口而不是退出进程
                    let close_to_tray = window
                        .try_state::<settings::SettingsState>()
                        .is_some_and(|state| state.0.lock().unwrap().close_to_tray);
                    if close_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                WindowEvent::Focused(false) => {
                    // 快捷搜索窗口失焦（点击窗口外部区域）→ 立即隐藏
                    if window.label() == "search" {
                        let _ = window.hide();
                    }
                }
                // 主窗口任务栏按钮规则：显示期间不占任务栏（skipTaskbar），
                // 仅当用户主动最小化时出现在任务栏（保留恢复入口），恢复后再次隐藏。
                WindowEvent::Resized(_) => {
                    if window.label() == "main" {
                        // set_skip_taskbar 幂等，重复调用无副作用（无查询 API）
                        let _ = window.set_skip_taskbar(!window.is_minimized().unwrap_or(false));
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running LTools");
}
