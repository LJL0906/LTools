/**
 * localStorage 持久化工具：笔记/链接模块的轻量本地存储。
 * 写入采用 200ms 防抖合并高频变更，并在关闭/隐藏/卸载时强制 flush，
 * 兼顾输入流畅度与"不丢数据"。
 */

export const STORAGE_KEYS = {
  notes: "ltools.notes",
  noteGroups: "ltools.noteGroups",
  links: "ltools.links",
  linkGroups: "ltools.linkGroups",
  clipboardItems: "ltools.clipboardItems",
  settings: "ltools.settings",
} as const;

export const SAVE_DEBOUNCE_MS = 200;

export function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // 数据损坏或存储不可用：回退默认值
    return fallback;
  }
}

export function saveState(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用（隐私模式/容量满）：静默失败，不影响内存态使用
  }
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingValues = new Map<string, unknown>();

/** 防抖写入：同键多次变更合并为最后一次，delay 内无新变更才落盘 */
export function saveStateDebounced(
  key: string,
  value: unknown,
  delay = SAVE_DEBOUNCE_MS,
): void {
  pendingValues.set(key, value);
  const existing = saveTimers.get(key);
  if (existing !== undefined) clearTimeout(existing);
  saveTimers.set(
    key,
    setTimeout(() => {
      saveTimers.delete(key);
      const pending = pendingValues.get(key);
      pendingValues.delete(key);
      if (pending !== undefined) saveState(key, pending);
    }, delay),
  );
}

/** 立即写入所有待保存数据（关窗前/切后台/组件卸载时调用） */
export function flushPendingSaves(): void {
  for (const [key, value] of pendingValues) {
    saveState(key, value);
  }
  pendingValues.clear();
  for (const timer of saveTimers.values()) {
    clearTimeout(timer);
  }
  saveTimers.clear();
}

/** 取消所有待写入（测试隔离用），不落盘 */
export function cancelPendingSaves(): void {
  pendingValues.clear();
  for (const timer of saveTimers.values()) {
    clearTimeout(timer);
  }
  saveTimers.clear();
}
