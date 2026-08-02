import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TopNavigation } from "./TopNavigation";

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
