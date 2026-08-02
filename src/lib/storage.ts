/**
 * localStorage 持久化工具：笔记/链接模块的轻量本地存储。
 * 数据在每次变更后全量写入；读取失败或数据损坏时回退到默认值。
 */

export const STORAGE_KEYS = {
  notes: "ltools.notes",
  noteGroups: "ltools.noteGroups",
  links: "ltools.links",
  linkGroups: "ltools.linkGroups",
} as const;

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
