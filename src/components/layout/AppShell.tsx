import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TopNavigation } from "./TopNavigation";
import { flushPendingSaves } from "../../lib/storage";

const searchPlaceholders: Record<string, string | undefined> = {
  "/links": "搜索链接",
  "/notes": "搜索笔记",
  "/clipboard": "搜索剪切板",
};

export interface AppOutletContext {
  searchQuery: string;
}

export function AppShell() {
  const { pathname } = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setSearchQuery("");
  }, [pathname]);

  // 防抖保存的兜底：关窗/切后台/卸载时强制落盘，避免丢最近 200ms 的输入
  useEffect(() => {
    const flush = () => flushPendingSaves();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flush();
    };
  }, []);

  return (
    <div className="app-frame">
      <TopNavigation
        compactSearch={pathname === "/links"}
        onSearchChange={setSearchQuery}
        searchPlaceholder={searchPlaceholders[pathname]}
        searchValue={searchQuery}
      />
      <Outlet context={{ searchQuery } satisfies AppOutletContext} />
    </div>
  );
}
