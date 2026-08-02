use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

/// 剪贴板轮询间隔：600ms 内可感知新复制内容，CPU 开销可忽略。
const POLL_INTERVAL: Duration = Duration::from_millis(600);

/// 启动系统剪贴板文本监听。
///
/// 后台线程轮询剪贴板纯文本，与上次读取值不同时通过
/// `clipboard-changed` 事件（payload 为文本字符串）推送给前端。
/// 首次读取仅作为基线不推送，避免应用启动时把当前剪贴板内容
/// 误当作"新复制"；应用退出时线程随进程终止，无需优雅关闭。
pub fn start_watcher(app: AppHandle) {
    thread::spawn(move || {
        let mut last: Option<String> = None;
        let mut is_first_read = true;
        loop {
            let current = read_text();
            if !is_first_read {
                let changed = last.as_ref() != current.as_ref();
                if let Some(text) = &current {
                    if changed {
                        let _ = app.emit("clipboard-changed", text.clone());
                    }
                }
            }
            is_first_read = false;
            last = current;
            thread::sleep(POLL_INTERVAL);
        }
    });
}

/// 读取剪贴板纯文本；剪贴板被其他进程锁定、内容为空或非文本时返回 None。
fn read_text() -> Option<String> {
    let mut clipboard = arboard::Clipboard::new().ok()?;
    match clipboard.get_text() {
        Ok(text) if !text.trim().is_empty() => Some(text),
        _ => None,
    }
}
