/**
 * 统一数据访问层：业务数据（链接/笔记/分组/剪切板）的真实存储。
 *
 * - Tauri 桌面环境：数据读写 SQLite（`db.rs` 的全量快照 commands），
 *   「数据库存储路径」设置真实决定数据库文件位置；首次启动时若 SQLite 为空
 *   且 localStorage 残留旧数据，则自动一次性迁移。
 * - 浏览器 dev / 测试环境：静默降级为 localStorage（与历史行为一致）。
 *
 * 写操作在 Tauri 模式下做 200ms 防抖（读-改-写快照），避免高频输入打满 IPC。
 */

import { invoke } from "@tauri-apps/api/core";
import type { ClipboardEntry } from "../features/clipboard/types";
import type { GroupItem } from "../features/groups/types";
import type { LinkItem } from "../features/links/types";
import type { NoteItem } from "../features/notes/types";
import { loadState, saveStateDebounced, STORAGE_KEYS } from "./storage";

/** 是否运行在 Tauri 桌面环境（否则为浏览器 dev / 测试降级路径） */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** JSON 格式化页签（jsonTabs 数据项） */
export interface JsonTabItem {
  id: string;
  title: string;
  input: string;
  mode: "format" | "minify";
}

/** 全量数据快照（与 Rust `AllData` 字段名一致） */
export interface AllData {
  links: LinkItem[];
  linkGroups: GroupItem[];
  notes: NoteItem[];
  noteGroups: GroupItem[];
  clipboardItems: ClipboardEntry[];
  /** 与 Rust `AllData` 字段名一致 */
  jsonTabs: JsonTabItem[];
}

const DATA_COMMANDS = {
  get: "get_all_data",
  replace: "replace_all_data",
} as const;

function readAllFromLocalStorage(): AllData {
  return {
    links: loadState<LinkItem[]>(STORAGE_KEYS.links, []),
    linkGroups: loadState<GroupItem[]>(STORAGE_KEYS.linkGroups, []),
    notes: loadState<NoteItem[]>(STORAGE_KEYS.notes, []),
    noteGroups: loadState<GroupItem[]>(STORAGE_KEYS.noteGroups, []),
    clipboardItems: loadState<ClipboardEntry[]>(STORAGE_KEYS.clipboardItems, []),
    jsonTabs: loadState<JsonTabItem[]>(STORAGE_KEYS.jsonTabs, []),
  };
}

async function replaceAll(data: AllData): Promise<void> {
  await invoke(DATA_COMMANDS.replace, { data }).catch(() => undefined);
}

/**
 * 加载全量业务数据：
 * - Tauri：读 SQLite；若库为空且 localStorage 有残留则一次性迁移并返回迁移结果；
 * - 浏览器：直接读 localStorage。
 */
async function loadAllData(): Promise<AllData> {
  if (!isTauriRuntime()) {
    return readAllFromLocalStorage();
  }

  const dbData = await invoke<AllData>(DATA_COMMANDS.get).catch(() => null);
  if (!dbData) return readAllFromLocalStorage();

  const dbEmpty =
    dbData.links.length === 0 &&
    dbData.notes.length === 0 &&
    dbData.clipboardItems.length === 0 &&
    dbData.linkGroups.length === 0 &&
    dbData.noteGroups.length === 0 &&
    dbData.jsonTabs.length === 0;

  if (dbEmpty) {
    const local = readAllFromLocalStorage();
    const hasLocalData =
      local.links.length > 0 ||
      local.notes.length > 0 ||
      local.clipboardItems.length > 0 ||
      local.linkGroups.length > 0 ||
      local.noteGroups.length > 0 ||
      local.jsonTabs.length > 0;
    if (hasLocalData) {
      await replaceAll(local);
      return local;
    }
  }
  return dbData;
}

/** 防抖执行器：高频调用时只执行最后一次（Tauri 快照写合并） */
function createDebouncer(delay = 200) {
  let timer: number | undefined;
  return (fn: () => void) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      fn();
    }, delay);
  };
}

const persistLinksDebounced = createDebouncer();
const persistNotesDebounced = createDebouncer();
const persistClipboardDebounced = createDebouncer();

// ---------------------------------------------------------------------------
// 模块级加载 / 持久化
// ---------------------------------------------------------------------------

/** 加载链接与链接分组 */
export async function loadLinksData(): Promise<{
  links: LinkItem[];
  linkGroups: GroupItem[];
}> {
  const all = await loadAllData();
  return { links: all.links, linkGroups: all.linkGroups };
}

/** 持久化链接与链接分组（Tauri：快照写 SQLite；浏览器：localStorage 防抖） */
export function persistLinks(links: LinkItem[], linkGroups: GroupItem[]): void {
  if (isTauriRuntime()) {
    persistLinksDebounced(() => {
      void (async () => {
        const db = await invoke<AllData>(DATA_COMMANDS.get).catch(() => null);
        const full = db ?? readAllFromLocalStorage();
        full.links = links;
        full.linkGroups = linkGroups;
        await replaceAll(full);
      })();
    });
    return;
  }
  saveStateDebounced(STORAGE_KEYS.links, links);
  saveStateDebounced(STORAGE_KEYS.linkGroups, linkGroups);
}

/** 加载笔记与笔记分组 */
export async function loadNotesData(): Promise<{
  notes: NoteItem[];
  noteGroups: GroupItem[];
}> {
  const all = await loadAllData();
  return { notes: all.notes, noteGroups: all.noteGroups };
}

/** 持久化笔记与笔记分组 */
export function persistNotes(notes: NoteItem[], noteGroups: GroupItem[]): void {
  if (isTauriRuntime()) {
    persistNotesDebounced(() => {
      void (async () => {
        const db = await invoke<AllData>(DATA_COMMANDS.get).catch(() => null);
        const full = db ?? readAllFromLocalStorage();
        full.notes = notes;
        full.noteGroups = noteGroups;
        await replaceAll(full);
      })();
    });
    return;
  }
  saveStateDebounced(STORAGE_KEYS.notes, notes);
  saveStateDebounced(STORAGE_KEYS.noteGroups, noteGroups);
}

/** 加载剪切板历史 */
export async function loadClipboardData(): Promise<ClipboardEntry[]> {
  const all = await loadAllData();
  return all.clipboardItems;
}

/** 持久化剪切板历史 */
export function persistClipboard(entries: ClipboardEntry[]): void {
  if (isTauriRuntime()) {
    persistClipboardDebounced(() => {
      void (async () => {
        const db = await invoke<AllData>(DATA_COMMANDS.get).catch(() => null);
        const full = db ?? readAllFromLocalStorage();
        full.clipboardItems = entries;
        await replaceAll(full);
      })();
    });
    return;
  }
  saveStateDebounced(STORAGE_KEYS.clipboardItems, entries);
}

/** 加载 JSON 格式化页签 */
export async function loadToolsData(): Promise<JsonTabItem[]> {
  const all = await loadAllData();
  return all.jsonTabs;
}

/** 立即把 localStorage 数据写入 SQLite（迁移 / 测试辅助） */
export function migrateToDb(): void {
  if (!isTauriRuntime()) return;
  const local = readAllFromLocalStorage();
  void replaceAll(local);
}

/** 读取全量数据（设置页备份用）：Tauri 从 SQLite，浏览器从 localStorage */
export async function getAllData(): Promise<AllData> {
  if (isTauriRuntime()) {
    return (
      (await invoke<AllData>(DATA_COMMANDS.get).catch(() => null)) ??
      readAllFromLocalStorage()
    );
  }
  return readAllFromLocalStorage();
}

/** 全量写入（导入恢复用）：Tauri 写 SQLite，浏览器写 localStorage */
export function saveAllData(data: AllData): void {
  if (isTauriRuntime()) {
    void replaceAll(data);
    return;
  }
  saveStateDebounced(STORAGE_KEYS.links, data.links);
  saveStateDebounced(STORAGE_KEYS.linkGroups, data.linkGroups);
  saveStateDebounced(STORAGE_KEYS.notes, data.notes);
  saveStateDebounced(STORAGE_KEYS.noteGroups, data.noteGroups);
  saveStateDebounced(STORAGE_KEYS.clipboardItems, data.clipboardItems);
  saveStateDebounced(STORAGE_KEYS.jsonTabs, data.jsonTabs);
}

// ---------------------------------------------------------------------------
// 逐条 CRUD（upsert = 新增或更新单条）
// Tauri：调用 SQLite 单条命令；浏览器：localStorage 读改写降级。
// ---------------------------------------------------------------------------

const CRUD_COMMANDS = {
  upsertLink: "upsert_link",
  deleteLink: "delete_link",
  upsertLinkGroup: "upsert_link_group",
  deleteLinkGroup: "delete_link_group",
  upsertNote: "upsert_note",
  deleteNote: "delete_note",
  upsertNoteGroup: "upsert_note_group",
  deleteNoteGroup: "delete_note_group",
  upsertJsonTab: "upsert_json_tab",
  deleteJsonTab: "delete_json_tab",
  upsertClipboardItem: "upsert_clipboard_item",
  deleteClipboardItem: "delete_clipboard_item",
  clearClipboardItems: "clear_clipboard_items",
} as const;

/** 浏览器降级：对 localStorage 中的数组做一次读改写（防抖落盘） */
function mutateLocalArray<T>(key: string, mutate: (items: T[]) => T[]): void {
  saveStateDebounced(key, mutate(loadState<T[]>(key, [])));
}

/** 新增 / 更新一条链接 */
export function upsertLink(link: LinkItem): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.upsertLink, { link }).catch(() => undefined);
    return;
  }
  mutateLocalArray<LinkItem>(STORAGE_KEYS.links, (items) => {
    const idx = items.findIndex((x) => x.id === link.id);
    if (idx === -1) return [...items, link];
    const next = [...items];
    next[idx] = link;
    return next;
  });
}

/** 删除一条链接 */
export function deleteLink(id: string): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.deleteLink, { id }).catch(() => undefined);
    return;
  }
  mutateLocalArray<LinkItem>(STORAGE_KEYS.links, (items) => items.filter((x) => x.id !== id));
}

/** 新增 / 更新一个链接分组 */
export function upsertLinkGroup(group: GroupItem): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.upsertLinkGroup, { group }).catch(() => undefined);
    return;
  }
  mutateLocalArray<GroupItem>(STORAGE_KEYS.linkGroups, (items) => {
    const idx = items.findIndex((x) => x.id === group.id);
    if (idx === -1) return [...items, group];
    const next = [...items];
    next[idx] = group;
    return next;
  });
}

/** 删除链接分组：组内链接移到未分组（Rust 侧单事务完成，降级路径此处模拟） */
export function deleteLinkGroup(id: string): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.deleteLinkGroup, { id }).catch(() => undefined);
    return;
  }
  mutateLocalArray<LinkItem>(STORAGE_KEYS.links, (items) =>
    items.map((l) => (l.groupId === id ? { ...l, groupId: null } : l)),
  );
  mutateLocalArray<GroupItem>(STORAGE_KEYS.linkGroups, (items) => items.filter((g) => g.id !== id));
}

/** 新增 / 更新一条笔记 */
export function upsertNote(note: NoteItem): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.upsertNote, { note }).catch(() => undefined);
    return;
  }
  mutateLocalArray<NoteItem>(STORAGE_KEYS.notes, (items) => {
    const idx = items.findIndex((x) => x.id === note.id);
    if (idx === -1) return [...items, note];
    const next = [...items];
    next[idx] = note;
    return next;
  });
}

/** 删除一条笔记 */
export function deleteNote(id: string): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.deleteNote, { id }).catch(() => undefined);
    return;
  }
  mutateLocalArray<NoteItem>(STORAGE_KEYS.notes, (items) => items.filter((x) => x.id !== id));
}

/** 新增 / 更新一个笔记分组 */
export function upsertNoteGroup(group: GroupItem): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.upsertNoteGroup, { group }).catch(() => undefined);
    return;
  }
  mutateLocalArray<GroupItem>(STORAGE_KEYS.noteGroups, (items) => {
    const idx = items.findIndex((x) => x.id === group.id);
    if (idx === -1) return [...items, group];
    const next = [...items];
    next[idx] = group;
    return next;
  });
}

/** 删除笔记分组：组内笔记移到未分组（Rust 侧单事务完成，降级路径此处模拟） */
export function deleteNoteGroup(id: string): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.deleteNoteGroup, { id }).catch(() => undefined);
    return;
  }
  mutateLocalArray<NoteItem>(STORAGE_KEYS.notes, (items) =>
    items.map((n) => (n.groupId === id ? { ...n, groupId: null } : n)),
  );
  mutateLocalArray<GroupItem>(STORAGE_KEYS.noteGroups, (items) => items.filter((g) => g.id !== id));
}

/** 新增 / 更新一个 JSON 格式化页签 */
export function upsertJsonTab(tab: JsonTabItem): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.upsertJsonTab, { tab }).catch(() => undefined);
    return;
  }
  mutateLocalArray<JsonTabItem>(STORAGE_KEYS.jsonTabs, (items) => {
    const idx = items.findIndex((x) => x.id === tab.id);
    if (idx === -1) return [...items, tab];
    const next = [...items];
    next[idx] = tab;
    return next;
  });
}

/** 删除一个 JSON 格式化页签 */
export function deleteJsonTab(id: string): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.deleteJsonTab, { id }).catch(() => undefined);
    return;
  }
  mutateLocalArray<JsonTabItem>(STORAGE_KEYS.jsonTabs, (items) => items.filter((x) => x.id !== id));
}

/** 新增 / 更新一条剪切板历史条目 */
export function upsertClipboardItem(item: ClipboardEntry): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.upsertClipboardItem, { item }).catch(() => undefined);
    return;
  }
  mutateLocalArray<ClipboardEntry>(STORAGE_KEYS.clipboardItems, (items) => {
    const idx = items.findIndex((x) => x.id === item.id);
    if (idx === -1) return [...items, item];
    const next = [...items];
    next[idx] = item;
    return next;
  });
}

/** 删除一条剪切板历史条目 */
export function deleteClipboardItem(id: string): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.deleteClipboardItem, { id }).catch(() => undefined);
    return;
  }
  mutateLocalArray<ClipboardEntry>(STORAGE_KEYS.clipboardItems, (items) => items.filter((x) => x.id !== id));
}

/** 清空全部剪切板历史 */
export function clearClipboardItems(): void {
  if (isTauriRuntime()) {
    void invoke(CRUD_COMMANDS.clearClipboardItems).catch(() => undefined);
    return;
  }
  mutateLocalArray<ClipboardEntry>(STORAGE_KEYS.clipboardItems, () => []);
}
