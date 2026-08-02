import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

interface ModuleLayoutProps {
  sidebar: ReactNode;
  sidebarWidth: number;
  children: ReactNode;
  className?: string;
  minSidebarWidth?: number;
  maxSidebarWidth?: number;
  maxSidebarRatio?: number;
  resizeHandleLabel?: string;
  sidebarStateKey?: string;
}

interface DragState {
  pointerId: number;
  startX: number;
  startWidth: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const runtimeSidebarWidths = new Map<string, number>();

export function ModuleLayout({
  sidebar,
  sidebarWidth: initialSidebarWidth,
  children,
  className = "",
  minSidebarWidth = 160,
  maxSidebarWidth = 320,
  maxSidebarRatio = 0.4,
  resizeHandleLabel = "调整侧栏宽度",
  sidebarStateKey,
}: ModuleLayoutProps) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clamp(
      sidebarStateKey
        ? (runtimeSidebarWidths.get(sidebarStateKey) ?? initialSidebarWidth)
        : initialSidebarWidth,
      minSidebarWidth,
      maxSidebarWidth,
    ),
  );

  const getEffectiveMaxWidth = () => {
    const containerWidth = layoutRef.current?.getBoundingClientRect().width ?? 0;
    const containerMaxWidth =
      containerWidth > 0
        ? Math.floor(containerWidth * maxSidebarRatio)
        : maxSidebarWidth;

    return Math.max(
      minSidebarWidth,
      Math.min(maxSidebarWidth, containerMaxWidth),
    );
  };

  const updateSidebarWidth = (nextWidth: number) => {
    const clampedWidth = clamp(
      nextWidth,
      minSidebarWidth,
      getEffectiveMaxWidth(),
    );
    if (sidebarStateKey) {
      runtimeSidebarWidths.set(sidebarStateKey, clampedWidth);
    }
    setSidebarWidth(clampedWidth);
  };

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    if (!layout) {
      return;
    }

    const fitSidebarToLayout = () => {
      setSidebarWidth((currentWidth) => {
        const clampedWidth = clamp(
          currentWidth,
          minSidebarWidth,
          getEffectiveMaxWidth(),
        );
        if (sidebarStateKey) {
          runtimeSidebarWidths.set(sidebarStateKey, clampedWidth);
        }
        return clampedWidth;
      });
    };

    fitSidebarToLayout();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(fitSidebarToLayout);
    observer.observe(layout);

    return () => observer.disconnect();
  }, [maxSidebarRatio, maxSidebarWidth, minSidebarWidth, sidebarStateKey]);

  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsResizing(false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsResizing(true);
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    updateSidebarWidth(
      dragState.startWidth + event.clientX - dragState.startX,
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    const step = event.shiftKey ? 16 : 8;
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    updateSidebarWidth(sidebarWidth + step * direction);
    event.preventDefault();
  };

  const effectiveMaxWidth = getEffectiveMaxWidth();

  return (
    <div
      className={`module-layout${isResizing ? " is-resizing" : ""} ${className}`.trim()}
      ref={layoutRef}
    >
      <aside
        className="module-layout__sidebar"
        data-testid="module-sidebar"
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </aside>
      <div
        aria-label={resizeHandleLabel}
        aria-orientation="vertical"
        aria-valuemax={effectiveMaxWidth}
        aria-valuemin={minSidebarWidth}
        aria-valuenow={sidebarWidth}
        className="module-layout__resize-handle"
        onKeyDown={handleKeyDown}
        onLostPointerCapture={() => {
          dragStateRef.current = null;
          setIsResizing(false);
        }}
        onPointerCancel={finishResize}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishResize}
        role="separator"
        tabIndex={0}
      />
      <main className="module-layout__content">{children}</main>
    </div>
  );
}
