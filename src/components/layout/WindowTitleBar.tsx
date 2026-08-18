import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Minus, Pin, Square, Copy, X } from "lucide-react";
import { TooltipContent, TooltipTrigger } from "@/components/shadcn/ui/tooltip";
import { FocusTooltip } from "@/components/ui/FocusTooltip";
import type { AppSettings } from "../../features/settings/types";
import { isTauriRuntime } from "../../lib/data";

/**
 * 自绘标题栏（主窗口 decorations:false 后接管窗口顶部）：
 * 左侧拖拽区（拖拽移动 + 双击最大化/还原），右侧「置顶 | 最小化 | 最大化/还原 | 关闭」。
 * 非 Tauri 环境（浏览器 dev / 测试）按钮全部禁用，仅作视觉占位。
 */
export function WindowTitleBar() {
  const tauriAvailable = isTauriRuntime();
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [settingsCache, setSettingsCache] = useState<AppSettings | null>(null);

  // 初始化：读取置顶 / 最大化状态与设置缓存；监听窗口尺寸变化同步最大化状态
  useEffect(() => {
    if (!tauriAvailable) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void (async () => {
      try {
        const win = getCurrentWindow();
        const [onTop, maximized, s] = await Promise.all([
          win.isAlwaysOnTop(),
          win.isMaximized(),
          invoke<AppSettings>("get_settings"),
        ]);
        if (disposed) return;
        setAlwaysOnTop(onTop);
        setIsMaximized(maximized);
        setSettingsCache(s);
        const fn = await win.onResized(() => {
          void win.isMaximized().then((m) => {
            if (!disposed) setIsMaximized(m);
          });
        });
        if (disposed) fn();
        else unlisten = fn;
      } catch {
        // 非 Tauri / 受限环境（测试 mock 无 metadata）静默降级
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [tauriAvailable]);

  /** 切换置顶：即时应用窗口置顶 + 持久化到设置（重启保持） */
  const toggleAlwaysOnTop = () => {
    if (!tauriAvailable) return;
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    void getCurrentWindow()
      .setAlwaysOnTop(next)
      .catch(() => setAlwaysOnTop(!next));
    if (settingsCache) {
      void invoke("set_settings", {
        settings: { ...settingsCache, always_on_top: next },
      }).catch(() => undefined);
    }
  };

  /** 双击标题栏：最大化 / 还原（Windows 标题栏惯例） */
  const handleDoubleClick = () => {
    if (!tauriAvailable) return;
    void getCurrentWindow().toggleMaximize();
  };

  const windowControls = [
    {
      label: "最小化",
      icon: <Minus size={15} aria-hidden="true" />,
      action: () => getCurrentWindow().minimize(),
    },
    {
      label: isMaximized ? "还原" : "最大化",
      icon: isMaximized ? (
        <Copy size={13} aria-hidden="true" />
      ) : (
        <Square size={12} aria-hidden="true" />
      ),
      action: () => getCurrentWindow().toggleMaximize(),
    },
  ] as const;

  return (
    <div className="window-title-bar">
      <div
        className="window-title-bar__drag"
        data-tauri-drag-region
        onDoubleClick={handleDoubleClick}
      >
        <span className="window-title-bar__title" data-tauri-drag-region>
          LTools
        </span>
      </div>
      <div className="window-title-bar__controls">
        <FocusTooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={alwaysOnTop ? "取消置顶" : "置顶主窗口"}
              aria-pressed={alwaysOnTop}
              className={`window-title-bar__btn${
                alwaysOnTop ? " is-active" : ""
              }`}
              disabled={!tauriAvailable}
              onClick={toggleAlwaysOnTop}
              type="button"
            >
              <Pin size={14} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {alwaysOnTop ? "取消置顶" : "置顶主窗口"}
          </TooltipContent>
        </FocusTooltip>
        {windowControls.map((control) => (
          <button
            aria-label={control.label}
            className="window-title-bar__btn"
            disabled={!tauriAvailable}
            key={control.label}
            onClick={() => control.action()}
            type="button"
          >
            {control.icon}
          </button>
        ))}
        <button
          aria-label="关闭"
          className="window-title-bar__btn window-title-bar__btn--close"
          disabled={!tauriAvailable}
          onClick={() => getCurrentWindow().close()}
          type="button"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
