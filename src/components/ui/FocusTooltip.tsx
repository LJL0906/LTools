import { useEffect, useState, type ReactNode } from "react";
import { Tooltip } from "@/components/shadcn/ui/tooltip";

/** 窗口聚焦状态：失焦 / 页面隐藏视为 false */
function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const onBlur = () => setFocused(false);
    const onFocus = () => setFocused(true);
    const onVisibility = () => {
      setFocused(document.visibilityState === "visible");
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return focused;
}

/**
 * 窗口聚焦感知的 Tooltip（受控 open）：
 * 窗口失焦 / 隐藏时强制关闭已打开的 tooltip；窗口重新聚焦后不会自动弹出，
 * 需再次把鼠标移到按钮上才显示。
 * 解决「tooltip 显示时失焦隐藏、窗口再次出现又主动弹出」的困扰
 * （Radix 的 open 状态不会因窗口失焦而自动关闭）。
 */
export function FocusTooltip({
  children,
  ...props
}: React.ComponentProps<typeof Tooltip> & { children: ReactNode }) {
  const focused = useWindowFocused();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!focused) setOpen(false);
  }, [focused]);

  return (
    <Tooltip open={open} onOpenChange={setOpen} {...props}>
      {children}
    </Tooltip>
  );
}
