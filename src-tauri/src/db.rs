//! SQLite 数据层：应用业务数据（链接 / 笔记 / 分组 / 剪切板）的真实持久化。
//!
//! 采用「全量快照」写模式：前端每次数据变更后把整个模块的数据通过
//! `replace_all_data` 在单事务内替换。个人工具数据量小，全量写性能可忽略，
//! 且避免了逐条 CRUD 的一致性边界；数据库文件位置由设置的 `db_path`（目录）
//! 决定，未配置时默认 `app_data_dir/ltools.db`——「数据库存储路径」设置由此真实生效。
//!
//! 迁移：localStorage → SQLite 由前端发起（localStorage 在 WebView 侧），
//! 首次 `get_all_data` 为空且本地有旧数据时前端调用 `replace_all_data` 导入，
//! 成功后标记 `ltools.migrated`，之后所有读写走 SQLite。

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::settings::AppSettings;

/// 数据库文件名（置于 db_path 目录或默认 app_data_dir 下）。
pub const DB_FILE: &str = "ltools.db";

// ---------------------------------------------------------------------------
// 数据模型（字段名与前端 / localStorage 数据形状一致）
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkItem {
    pub id: String,
    pub title: String,
    pub protocol: String,
    pub address: String,
    pub notes: String,
    #[serde(rename = "groupId")]
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupItem {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteItem {
    pub id: String,
    pub title: String,
    pub content: String,
    #[serde(rename = "groupId")]
    pub group_id: Option<String>,
    pub time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    pub text: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonTabItem {
    pub id: String,
    pub title: String,
    pub input: String,
    pub mode: String,
}

/// 全量数据快照（前端 ↔ Rust 传输）。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AllData {
    pub links: Vec<LinkItem>,
    #[serde(rename = "linkGroups")]
    pub link_groups: Vec<GroupItem>,
    pub notes: Vec<NoteItem>,
    #[serde(rename = "noteGroups")]
    pub note_groups: Vec<GroupItem>,
    #[serde(rename = "clipboardItems")]
    pub clipboard_items: Vec<ClipboardItem>,
    #[serde(rename = "jsonTabs")]
    pub json_tabs: Vec<JsonTabItem>,
}

// ---------------------------------------------------------------------------
// 连接管理
// ---------------------------------------------------------------------------

/// 进程内 SQLite 连接（数据库文件路径由设置决定）与当前路径。
pub struct DbState {
    pub conn: Mutex<Connection>,
    pub path: Mutex<PathBuf>,
}

/// 默认（引导）数据库路径：`app_data_dir/ltools.db`。
pub fn default_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法解析应用数据目录：{e}"))?;
    Ok(dir.join(DB_FILE))
}

/// 解析数据库文件路径：设置配置了目录则用 `目录/ltools.db`，否则默认路径。
pub fn resolve_db_path(app: &AppHandle, settings: &AppSettings) -> Result<PathBuf, String> {
    if let Some(dir) = &settings.db_path {
        if !dir.trim().is_empty() {
            return Ok(PathBuf::from(dir).join(DB_FILE));
        }
    }
    default_db_path(app)
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS link_groups (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  protocol TEXT NOT NULL,
  address  TEXT NOT NULL,
  notes    TEXT NOT NULL DEFAULT '',
  group_id TEXT
);
CREATE TABLE IF NOT EXISTS note_groups (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  content  TEXT NOT NULL DEFAULT '',
  group_id TEXT,
  time     TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS clipboard_items (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS json_tabs (
  id    TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  mode  TEXT NOT NULL DEFAULT 'format'
);
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

fn open_connection(path: &PathBuf) -> Result<Connection, String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("无法创建数据目录：{e}"))?;
    }
    let conn = Connection::open(path).map_err(|e| format!("无法打开数据库：{e}"))?;
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("初始化数据库表失败：{e}"))?;
    Ok(conn)
}

/// 打开（或创建）默认引导库，用于同步写设置指针；失败返回 None 由调用方忽略。
pub fn open_bootstrap(path: &PathBuf) -> Result<Connection, String> {
    open_connection(path)
}

/// 在 setup 阶段初始化数据库连接（默认引导路径并建表）。
pub fn init(app: &AppHandle) -> Result<DbState, String> {
    let path = default_db_path(app)?;
    let conn = open_connection(&path)?;
    Ok(DbState {
        conn: Mutex::new(conn),
        path: Mutex::new(path),
    })
}

// ---------------------------------------------------------------------------
// 设置存储（`app_settings` 表，键值行）
// ---------------------------------------------------------------------------

/// app_settings 表中存放完整 AppSettings JSON 的键名。
const SETTINGS_ROW_KEY: &str = "app_settings";

/// 从数据库读取完整设置；不存在（首次启动）时返回 None。
pub fn read_settings(conn: &Connection) -> Result<Option<AppSettings>, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM app_settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![SETTINGS_ROW_KEY]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let raw: String = row.get(0).map_err(|e| e.to_string())?;
        return serde_json::from_str(&raw).map(Some).map_err(|e| e.to_string());
    }
    Ok(None)
}

/// 把完整设置写入数据库（单行 JSON，整体替换）。
pub fn write_settings(conn: &Connection, settings: &AppSettings) -> Result<(), String> {
    let raw = serde_json::to_string(settings).map_err(|e| format!("序列化设置失败：{e}"))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
        params![SETTINGS_ROW_KEY, raw],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 读取 / 写入（全量快照）
// ---------------------------------------------------------------------------

fn read_all(tx: &Transaction) -> Result<AllData, String> {
    let mut stmt = tx
        .prepare("SELECT id, name FROM link_groups ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let link_groups = stmt
        .query_map([], |row| {
            Ok(GroupItem {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut stmt = tx
        .prepare("SELECT id, title, protocol, address, notes, group_id FROM links ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let links = stmt
        .query_map([], |row| {
            Ok(LinkItem {
                id: row.get(0)?,
                title: row.get(1)?,
                protocol: row.get(2)?,
                address: row.get(3)?,
                notes: row.get(4)?,
                group_id: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut stmt = tx
        .prepare("SELECT id, name FROM note_groups ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let note_groups = stmt
        .query_map([], |row| {
            Ok(GroupItem {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut stmt = tx
        .prepare("SELECT id, title, content, group_id, time FROM notes ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let notes = stmt
        .query_map([], |row| {
            Ok(NoteItem {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                group_id: row.get(3)?,
                time: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let mut stmt = tx
        .prepare("SELECT id, text, created_at FROM clipboard_items ORDER BY created_at DESC, rowid DESC")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut clipboard: Vec<ClipboardItem> = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        clipboard.push(ClipboardItem {
            id: row.get(0).map_err(|e| e.to_string())?,
            text: row.get(1).map_err(|e| e.to_string())?,
            created_at: row.get(2).map_err(|e| e.to_string())?,
        });
    }

    let mut stmt = tx
        .prepare("SELECT id, title, input, mode FROM json_tabs ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let json_tabs = stmt
        .query_map([], |row| {
            Ok(JsonTabItem {
                id: row.get(0)?,
                title: row.get(1)?,
                input: row.get(2)?,
                mode: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    Ok(AllData {
        links,
        link_groups,
        notes,
        note_groups,
        clipboard_items: clipboard,
        json_tabs,
    })
}

fn write_all(tx: &Transaction, data: &AllData) -> Result<(), String> {
    tx.execute("DELETE FROM links", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM link_groups", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM notes", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM note_groups", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM clipboard_items", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM json_tabs", []).map_err(|e| e.to_string())?;

    for g in &data.link_groups {
        tx.execute("INSERT OR REPLACE INTO link_groups (id, name) VALUES (?1, ?2)", params![g.id, g.name])
            .map_err(|e| e.to_string())?;
    }
    for l in &data.links {
        tx.execute(
            "INSERT OR REPLACE INTO links (id, title, protocol, address, notes, group_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![l.id, l.title, l.protocol, l.address, l.notes, l.group_id],
        )
        .map_err(|e| e.to_string())?;
    }
    for g in &data.note_groups {
        tx.execute("INSERT OR REPLACE INTO note_groups (id, name) VALUES (?1, ?2)", params![g.id, g.name])
            .map_err(|e| e.to_string())?;
    }
    for n in &data.notes {
        tx.execute(
            "INSERT OR REPLACE INTO notes (id, title, content, group_id, time) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![n.id, n.title, n.content, n.group_id, n.time],
        )
        .map_err(|e| e.to_string())?;
    }
    for c in &data.clipboard_items {
        tx.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, text, created_at) VALUES (?1, ?2, ?3)",
            params![c.id, c.text, c.created_at],
        )
        .map_err(|e| e.to_string())?;
    }
    for j in &data.json_tabs {
        tx.execute(
            "INSERT OR REPLACE INTO json_tabs (id, title, input, mode) VALUES (?1, ?2, ?3, ?4)",
            params![j.id, j.title, j.input, j.mode],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 读取全部业务数据（前端初始化 / 迁移用）。
#[tauri::command]
pub fn get_all_data(state: State<'_, DbState>) -> Result<AllData, String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let data = read_all(&tx)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(data)
}

/// 全量替换业务数据（单事务：清空 + 插入）。
#[tauri::command]
pub fn replace_all_data(state: State<'_, DbState>, data: AllData) -> Result<(), String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    write_all(&tx, &data)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 逐条 CRUD（upsert = INSERT OR REPLACE，按主键 id 新增或更新单条）
// 实现拆为内部函数（可单测）与 Tauri command 薄包装两层。
// ---------------------------------------------------------------------------

fn upsert_link_row(conn: &Connection, link: &LinkItem) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO links (id, title, protocol, address, notes, group_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![link.id, link.title, link.protocol, link.address, link.notes, link.group_id],
    )
    .map_err(|e| format!("写入链接失败：{e}"))?;
    Ok(())
}

fn delete_link_row(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM links WHERE id = ?1", params![id])
        .map_err(|e| format!("删除链接失败：{e}"))?;
    Ok(())
}

fn upsert_link_group_row(conn: &Connection, group: &GroupItem) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO link_groups (id, name) VALUES (?1, ?2)",
        params![group.id, group.name],
    )
    .map_err(|e| format!("写入链接分组失败：{e}"))?;
    Ok(())
}

/// 删除链接分组：事务内先把组内链接移到未分组（group_id → NULL），再删组。
fn delete_link_group_tx(conn: &mut Connection, id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE links SET group_id = NULL WHERE group_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM link_groups WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn upsert_note_row(conn: &Connection, note: &NoteItem) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO notes (id, title, content, group_id, time)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![note.id, note.title, note.content, note.group_id, note.time],
    )
    .map_err(|e| format!("写入笔记失败：{e}"))?;
    Ok(())
}

fn delete_note_row(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])
        .map_err(|e| format!("删除笔记失败：{e}"))?;
    Ok(())
}

fn upsert_note_group_row(conn: &Connection, group: &GroupItem) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO note_groups (id, name) VALUES (?1, ?2)",
        params![group.id, group.name],
    )
    .map_err(|e| format!("写入笔记分组失败：{e}"))?;
    Ok(())
}

/// 删除笔记分组：事务内先把组内笔记移到未分组（group_id → NULL），再删组。
fn delete_note_group_tx(conn: &mut Connection, id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE notes SET group_id = NULL WHERE group_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM note_groups WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn upsert_clipboard_item_row(conn: &Connection, item: &ClipboardItem) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO clipboard_items (id, text, created_at) VALUES (?1, ?2, ?3)",
        params![item.id, item.text, item.created_at],
    )
    .map_err(|e| format!("写入剪切板条目失败：{e}"))?;
    Ok(())
}

fn delete_clipboard_item_row(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])
        .map_err(|e| format!("删除剪切板条目失败：{e}"))?;
    Ok(())
}

fn clear_clipboard_items_row(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM clipboard_items", [])
        .map_err(|e| format!("清空剪切板失败：{e}"))?;
    Ok(())
}

fn upsert_json_tab_row(conn: &Connection, tab: &JsonTabItem) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO json_tabs (id, title, input, mode) VALUES (?1, ?2, ?3, ?4)",
        params![tab.id, tab.title, tab.input, tab.mode],
    )
    .map_err(|e| format!("写入 JSON 页签失败：{e}"))?;
    Ok(())
}

fn delete_json_tab_row(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM json_tabs WHERE id = ?1", params![id])
        .map_err(|e| format!("删除 JSON 页签失败：{e}"))?;
    Ok(())
}

/// 新增 / 更新一条链接。
#[tauri::command]
pub fn upsert_link(state: State<'_, DbState>, link: LinkItem) -> Result<(), String> {
    upsert_link_row(&state.conn.lock().unwrap(), &link)
}

/// 删除一条链接。
#[tauri::command]
pub fn delete_link(state: State<'_, DbState>, id: String) -> Result<(), String> {
    delete_link_row(&state.conn.lock().unwrap(), &id)
}

/// 新增 / 更新一个链接分组。
#[tauri::command]
pub fn upsert_link_group(state: State<'_, DbState>, group: GroupItem) -> Result<(), String> {
    upsert_link_group_row(&state.conn.lock().unwrap(), &group)
}

/// 删除链接分组：组内链接移到未分组后删组。
#[tauri::command]
pub fn delete_link_group(state: State<'_, DbState>, id: String) -> Result<(), String> {
    delete_link_group_tx(&mut state.conn.lock().unwrap(), &id)
}

/// 新增 / 更新一条笔记。
#[tauri::command]
pub fn upsert_note(state: State<'_, DbState>, note: NoteItem) -> Result<(), String> {
    upsert_note_row(&state.conn.lock().unwrap(), &note)
}

/// 删除一条笔记。
#[tauri::command]
pub fn delete_note(state: State<'_, DbState>, id: String) -> Result<(), String> {
    delete_note_row(&state.conn.lock().unwrap(), &id)
}

/// 新增 / 更新一个笔记分组。
#[tauri::command]
pub fn upsert_note_group(state: State<'_, DbState>, group: GroupItem) -> Result<(), String> {
    upsert_note_group_row(&state.conn.lock().unwrap(), &group)
}

/// 删除笔记分组：组内笔记移到未分组后删组。
#[tauri::command]
pub fn delete_note_group(state: State<'_, DbState>, id: String) -> Result<(), String> {
    delete_note_group_tx(&mut state.conn.lock().unwrap(), &id)
}

/// 新增 / 更新一条剪切板历史条目。
#[tauri::command]
pub fn upsert_clipboard_item(state: State<'_, DbState>, item: ClipboardItem) -> Result<(), String> {
    upsert_clipboard_item_row(&state.conn.lock().unwrap(), &item)
}

/// 删除一条剪切板历史条目。
#[tauri::command]
pub fn delete_clipboard_item(state: State<'_, DbState>, id: String) -> Result<(), String> {
    delete_clipboard_item_row(&state.conn.lock().unwrap(), &id)
}

/// 清空全部剪切板历史。
#[tauri::command]
pub fn clear_clipboard_items(state: State<'_, DbState>) -> Result<(), String> {
    clear_clipboard_items_row(&state.conn.lock().unwrap())
}

/// 新增 / 更新一个 JSON 格式化页签。
#[tauri::command]
pub fn upsert_json_tab(state: State<'_, DbState>, tab: JsonTabItem) -> Result<(), String> {
    upsert_json_tab_row(&state.conn.lock().unwrap(), &tab)
}

/// 删除一个 JSON 格式化页签。
#[tauri::command]
pub fn delete_json_tab(state: State<'_, DbState>, id: String) -> Result<(), String> {
    delete_json_tab_row(&state.conn.lock().unwrap(), &id)
}

// ---------------------------------------------------------------------------
// 数据库路径切换（设置变更时迁移数据）
// ---------------------------------------------------------------------------

/// 把当前连接替换到 `new_path` 对应的新库；新库为空时把旧库数据与设置整体迁移过去。
pub fn switch_db(app: &AppHandle, old: &DbState, new_path: &PathBuf) -> Result<(), String> {
    // 1. 读出旧库数据与设置
    let old_data = {
        let mut conn = old.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let data = read_all(&tx)?;
        tx.commit().map_err(|e| e.to_string())?;
        data
    };
    let old_settings = {
        let conn = old.conn.lock().unwrap();
        read_settings(&conn)?
    };

    // 2. 打开新库（建表）
    let mut new_conn = open_connection(new_path)?;

    // 3. 新库若为空则导入旧数据（首次切换场景），否则保留新库内容
    {
        let tx = new_conn.transaction().map_err(|e| e.to_string())?;
        let new_data = read_all(&tx)?;
        if new_data.links.is_empty()
            && new_data.notes.is_empty()
            && new_data.clipboard_items.is_empty()
            && new_data.json_tabs.is_empty()
        {
            write_all(&tx, &old_data)?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    // 4. 设置同步到新库（旧库有设置则迁移，否则保留新库设置）
    if let Some(s) = old_settings {
        write_settings(&new_conn, &s)?;
    }

    // 5. 替换连接与路径
    *old.conn.lock().unwrap() = new_conn;
    *old.path.lock().unwrap() = new_path.clone();
    let _ = app;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_db() -> DbState {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        DbState {
            conn: Mutex::new(conn),
            path: Mutex::new(PathBuf::from(":memory:")),
        }
    }

    fn sample_data() -> AllData {
        AllData {
            links: vec![LinkItem {
                id: "l1".into(),
                title: "API 文档".into(),
                protocol: "https".into(),
                address: "example.com/api".into(),
                notes: "接口说明".into(),
                group_id: Some("g1".into()),
            }],
            link_groups: vec![GroupItem {
                id: "g1".into(),
                name: "工作".into(),
            }],
            notes: vec![NoteItem {
                id: "n1".into(),
                title: "会议记录".into(),
                content: "<p>内容</p>".into(),
                group_id: None,
                time: "今天 14:00".into(),
            }],
            note_groups: vec![],
            clipboard_items: vec![ClipboardItem {
                id: "c1".into(),
                text: "剪贴板内容".into(),
                created_at: 1_700_000_000,
            }],
            json_tabs: vec![JsonTabItem {
                id: "j1".into(),
                title: "格式化".into(),
                input: "{\"a\":1}".into(),
                mode: "format".into(),
            }],
        }
    }

    #[test]
    fn roundtrip_writes_and_reads_all_tables() {
        let state = memory_db();
        let data = sample_data();

        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            write_all(&tx, &data).unwrap();
            tx.commit().unwrap();
        }

        let got = {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let g = read_all(&tx).unwrap();
            tx.commit().unwrap();
            g
        };

        assert_eq!(got.links.len(), 1);
        assert_eq!(got.links[0].title, "API 文档");
        assert_eq!(got.links[0].group_id.as_deref(), Some("g1"));
        assert_eq!(got.link_groups.len(), 1);
        assert_eq!(got.link_groups[0].name, "工作");
        assert_eq!(got.notes.len(), 1);
        assert_eq!(got.notes[0].content, "<p>内容</p>");
        assert_eq!(got.clipboard_items.len(), 1);
        assert_eq!(got.clipboard_items[0].created_at, 1_700_000_000);
        assert_eq!(got.json_tabs.len(), 1);
        assert_eq!(got.json_tabs[0].title, "格式化");
        assert_eq!(got.json_tabs[0].mode, "format");
    }

    #[test]
    fn replace_all_replaces_previous_snapshot() {
        let state = memory_db();
        let data = sample_data();
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            write_all(&tx, &data).unwrap();
            tx.commit().unwrap();
        }

        // 第二轮：空数据 + 一条新链接，旧数据应被清空
        let next = AllData {
            links: vec![LinkItem {
                id: "l2".into(),
                title: "新链接".into(),
                protocol: "https".into(),
                address: "new.example.com".into(),
                notes: "".into(),
                group_id: None,
            }],
            ..AllData::default()
        };
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            write_all(&tx, &next).unwrap();
            tx.commit().unwrap();
        }

        let got = {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let g = read_all(&tx).unwrap();
            tx.commit().unwrap();
            g
        };
        assert_eq!(got.links.len(), 1);
        assert_eq!(got.links[0].id, "l2");
        assert_eq!(got.notes.len(), 0);
        assert_eq!(got.clipboard_items.len(), 0);
        assert_eq!(got.link_groups.len(), 0);
        assert_eq!(got.json_tabs.len(), 0);
    }

    // ---- 逐条 CRUD ----

    #[test]
    fn upsert_link_inserts_updates_and_deletes_single_row() {
        let state = memory_db();
        let link = LinkItem {
            id: "l1".into(),
            title: "文档".into(),
            protocol: "https".into(),
            address: "example.com".into(),
            notes: "".into(),
            group_id: None,
        };
        {
            let conn = state.conn.lock().unwrap();
            upsert_link_row(&conn, &link).unwrap();
        }

        // 新增后可读
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let got = read_all(&tx).unwrap();
            tx.commit().unwrap();
            assert_eq!(got.links.len(), 1);
            assert_eq!(got.links[0].title, "文档");
        }

        // 同 id 覆盖更新（title 变化，行数不变）
        {
            let conn = state.conn.lock().unwrap();
            upsert_link_row(&conn, &LinkItem { title: "改名".into(), ..link.clone() }).unwrap();
        }
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let got = read_all(&tx).unwrap();
            tx.commit().unwrap();
            assert_eq!(got.links.len(), 1);
            assert_eq!(got.links[0].title, "改名");
        }

        // 删除后为空
        {
            let conn = state.conn.lock().unwrap();
            delete_link_row(&conn, "l1").unwrap();
        }
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let got = read_all(&tx).unwrap();
            tx.commit().unwrap();
            assert_eq!(got.links.len(), 0);
        }
    }

    #[test]
    fn delete_link_group_moves_links_to_ungrouped_before_deleting_group() {
        let state = memory_db();
        // 写入一个分组与两条组内链接
        {
            let conn = state.conn.lock().unwrap();
            upsert_link_group_row(
                &conn,
                &GroupItem { id: "g1".into(), name: "工作".into() },
            )
            .unwrap();
            upsert_link_row(
                &conn,
                &LinkItem {
                    id: "l1".into(),
                    title: "A".into(),
                    protocol: "https".into(),
                    address: "a.com".into(),
                    notes: "".into(),
                    group_id: Some("g1".into()),
                },
            )
            .unwrap();
            upsert_link_row(
                &conn,
                &LinkItem {
                    id: "l2".into(),
                    title: "B".into(),
                    protocol: "https".into(),
                    address: "b.com".into(),
                    notes: "".into(),
                    group_id: Some("g1".into()),
                },
            )
            .unwrap();
        }

        // 删除分组 → 组内链接应移到未分组
        {
            let mut conn = state.conn.lock().unwrap();
            delete_link_group_tx(&mut conn, "g1").unwrap();
        }
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let got = read_all(&tx).unwrap();
            tx.commit().unwrap();
            assert_eq!(got.link_groups.len(), 0);
            assert_eq!(got.links.len(), 2);
            assert!(got.links.iter().all(|l| l.group_id.is_none()));
        }
    }

    #[test]
    fn clipboard_item_crud_and_clear() {
        let state = memory_db();
        let item = ClipboardItem {
            id: "c1".into(),
            text: "内容".into(),
            created_at: 100,
        };
        {
            let conn = state.conn.lock().unwrap();
            upsert_clipboard_item_row(&conn, &item).unwrap();
        }
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let got = read_all(&tx).unwrap();
            tx.commit().unwrap();
            assert_eq!(got.clipboard_items.len(), 1);
        }
        {
            let conn = state.conn.lock().unwrap();
            delete_clipboard_item_row(&conn, "c1").unwrap();
        }
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let got = read_all(&tx).unwrap();
            tx.commit().unwrap();
            assert_eq!(got.clipboard_items.len(), 0);
        }
        {
            let conn = state.conn.lock().unwrap();
            upsert_clipboard_item_row(&conn, &item).unwrap();
            clear_clipboard_items_row(&conn).unwrap();
        }
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let got = read_all(&tx).unwrap();
            tx.commit().unwrap();
            assert_eq!(got.clipboard_items.len(), 0);
        }
    }

    #[test]
    fn json_tab_inserts_updates_and_deletes_single_row() {
        let state = memory_db();
        let tab = JsonTabItem {
            id: "j1".into(),
            title: "格式化".into(),
            input: "{\"a\":1}".into(),
            mode: "format".into(),
        };
        {
            let conn = state.conn.lock().unwrap();
            upsert_json_tab_row(&conn, &tab).unwrap();
        }

        // 新增后可读
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let got = read_all(&tx).unwrap();
            tx.commit().unwrap();
            assert_eq!(got.json_tabs.len(), 1);
            assert_eq!(got.json_tabs[0].title, "格式化");
            assert_eq!(got.json_tabs[0].input, "{\"a\":1}");
            assert_eq!(got.json_tabs[0].mode, "format");
        }

        // 同 id 覆盖更新（title/input/mode 变化，行数不变）
        {
            let conn = state.conn.lock().unwrap();
            upsert_json_tab_row(
                &conn,
                &JsonTabItem {
                    title: "压缩".into(),
                    input: "{\"b\":2}".into(),
                    mode: "minify".into(),
                    ..tab.clone()
                },
            )
            .unwrap();
        }
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let got = read_all(&tx).unwrap();
            tx.commit().unwrap();
            assert_eq!(got.json_tabs.len(), 1);
            assert_eq!(got.json_tabs[0].title, "压缩");
            assert_eq!(got.json_tabs[0].mode, "minify");
        }

        // 删除后为空
        {
            let conn = state.conn.lock().unwrap();
            delete_json_tab_row(&conn, "j1").unwrap();
        }
        {
            let mut conn = state.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let got = read_all(&tx).unwrap();
            tx.commit().unwrap();
            assert_eq!(got.json_tabs.len(), 0);
        }
    }
}
