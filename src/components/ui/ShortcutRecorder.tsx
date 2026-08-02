import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { KeyRound, X } from "lucide-react";

interface ShortcutRecorderProps {
  /** 当前绑定（Tauri 格式，如 "Ctrl+Shift+L"），null = 未绑定 */
  value: string | null;
  /** 绑定变化回调（null 表示清除） */
  onChange: (value: string | null) => void;
  placeholder?: string;
}

/**
 * 快捷键绑定录入器：点击后进入捕获模式，按下组合键自动录入为
 * Tauri 全局快捷键格式（"Ctrl+Alt+Key"），无需手动输入。
 * - Escape 取消捕获；仅按修饰键（Ctrl/Alt/Shift）不触发录入；
 * - 未含任何修饰键的纯按键拒绝录入（防止抢占系统按键）；
 * - 右侧 × 清除绑定。
 */
export function ShortcutRecorder({
  value,
  onChange,
  placeholder = "点击后按下组合键",
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (recording) {
      inputRef.current?.focus();
    }
  }, [recording]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();

    const native = event.nativeEvent;
    const combo = eventToShortcut(native);
    if (combo === null) {
      // Escape 或无效组合：保持捕获状态等待下一个按键
      return;
    }
    onChange(combo);
    setRecording(false);
  };

  return (
    <div className={`shortcut-recorder${recording ? " is-recording" : ""}`}>
      <button
        aria-label={recording ? "按下组合键绑定快捷键" : "点击以绑定快捷键"}
        className="shortcut-recorder__input"
        onClick={() => setRecording((prev) => !prev)}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        type="button"
      >
        <KeyRound aria-hidden="true" className="shortcut-recorder__icon" size={13} />
        {recording ? (
          <span className="shortcut-recorder__hint">按下组合键…（Esc 取消）</span>
        ) : value ? (
          <span className="shortcut-recorder__value">{value}</span>
        ) : (
          <span className="shortcut-recorder__empty">{placeholder}</span>
        )}
      </button>
      {value ? (
        <button
          aria-label="清除快捷键"
          className="shortcut-recorder__clear"
          onClick={() => onChange(null)}
          type="button"
        >
          <X aria-hidden="true" size={13} />
        </button>
      ) : null}
    </div>
  );
}

/** 浏览器 KeyboardEvent → Tauri 快捷键字符串（如 "Ctrl+Shift+L"） */
export function eventToShortcut(event: KeyboardEvent): string | null {
  if (event.key === "Escape") return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Super");

  const key = normalizeKey(event.key);
  if (!key) return null; // 纯修饰键或不可绑定键：保持捕获状态

  parts.push(key);
  const combo = parts.join("+");
  // 必须包含至少一个修饰键 + 一个主键，避免抢占系统按键
  if (!/(Ctrl|Alt|Shift|Super)\+/.test(combo)) return null;
  return combo;
}

/** 规范化按键名到 Tauri 支持的键名 */
function normalizeKey(key: string): string | null {
  if (key.length === 1 && /[a-z0-9]/.test(key)) return key.toUpperCase();
  if (/^F([1-9]|1[0-2])$/.test(key)) return key;
  const map: Record<string, string> = {
    " ": "Space",
    "ArrowUp": "Up",
    "ArrowDown": "Down",
    "ArrowLeft": "Left",
    "ArrowRight": "Right",
    "Enter": "Enter",
    "Tab": "Tab",
    "Backspace": "Backspace",
    "Delete": "Delete",
    "Home": "Home",
    "End": "End",
    "PageUp": "PageUp",
    "PageDown": "PageDown",
    "Insert": "Insert",
  };
  return map[key] ?? null;
}
