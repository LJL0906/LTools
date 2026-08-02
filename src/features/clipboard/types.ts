/**
 * 剪切板模块类型定义与业务常量。
 * 数据模式与链接/笔记一致：页面局部 state + localStorage 防抖持久化。
 */

/** 最多保留条数，超出裁剪最旧 */
export const CLIPBOARD_MAX_ITEMS = 30;

/** 单条文本最大长度（超出截断，防止 localStorage 容量被大文本撑爆） */
export const CLIPBOARD_MAX_TEXT_LENGTH = 10_000;

/** Rust 侧剪贴板监听推送事件名（payload 为纯文本字符串） */
export const CLIPBOARD_CHANGED_EVENT = "clipboard-changed";

export interface ClipboardEntry {
  id: string;
  /** 剪贴板文本内容（已截断到 CLIPBOARD_MAX_TEXT_LENGTH） */
  text: string;
  /** 创建时间（epoch 毫秒） */
  createdAt: number;
}

/** 截断文本到允许长度 */
export function truncateClipboardText(text: string): string {
  return text.length > CLIPBOARD_MAX_TEXT_LENGTH
    ? text.slice(0, CLIPBOARD_MAX_TEXT_LENGTH)
    : text;
}
