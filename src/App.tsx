import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "./App.css";
import { AppShell } from "./components/layout/AppShell";
import { Toaster } from "./components/shadcn/ui/sonner";
import { TooltipProvider } from "./components/shadcn/ui/tooltip";
import { LinksRoutePage } from "./pages/LinksPage";
import { NotesPage } from "./pages/NotesPage";
import { ClipboardPage } from "./pages/ClipboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { QuickSearchPage } from "./pages/QuickSearchPage";
import { isTauriRuntime } from "./lib/data";

/** 当前是否运行在快捷搜索窗口（label="search"）内 */
function isSearchWindow(): boolean {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return false;
  }
  try {
    return getCurrentWebviewWindow().label === "search";
  } catch {
    return false;
  }
}

/** 快捷搜索窗口强制进入 /search 路由（该窗口复用同一前端入口） */
function SearchWindowRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (isSearchWindow() && location.pathname !== "/search") {
      navigate("/search", { replace: true });
    }
  }, [location.pathname, navigate]);
  return null;
}

/**
 * 笔记跳转目标：快捷搜索窗口选中笔记后，主窗口跳转到笔记页并选中目标。
 * 通过 context 传递给 NotesPage。
 */
const NoteTargetContext = createContext<{
  targetNoteId: string | null;
  consumeTarget: () => void;
}>({ targetNoteId: null, consumeTarget: () => undefined });

export { NoteTargetContext };

export function useNoteTarget() {
  return useContext(NoteTargetContext);
}

/** 监听 Rust 侧 open-note 事件（快捷搜索选中笔记），跳转并设置目标笔记 */
function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [targetNoteId, setTargetNoteId] = useState<string | null>(null);

  // open-note 事件：仅主窗口监听（快捷搜索窗口不响应，避免被全局广播
  // 污染路由——open_note_in_main 的 emit 会广播到所有窗口）。仅记录目标
  // 笔记（navigate 由下方 effect 处理，避免在事件回调中调用导航导致
  // transition 无法可靠提交）。
  useEffect(() => {
    if (!isTauriRuntime() || isSearchWindow()) return;
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void listen<string>("open-note", (event) => {
      setTargetNoteId(event.payload);
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // 非 Tauri 环境静默降级
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // 目标笔记变化 → 在 React 生命周期内跳转到笔记页
  useEffect(() => {
    if (targetNoteId) {
      navigate("/notes");
    }
  }, [navigate, targetNoteId]);

  const noteTarget = useMemo(
    () => ({
      targetNoteId,
      consumeTarget: () => setTargetNoteId(null),
    }),
    [targetNoteId],
  );

  // 快捷搜索窗口强制进入 /search（渲染期决定，避免与 index 路由的
  // `<Navigate to="/links">` 在 effect 阶段竞态导致偶发展示主窗口内容）。
  if (isSearchWindow() && location.pathname !== "/search") {
    return <Navigate to="/search" replace />;
  }

  return (
    <NoteTargetContext.Provider value={noteTarget}>
      <Routes>
        {/* 快捷搜索窗口：独立布局（无主窗口导航壳） */}
        <Route path="search" element={<QuickSearchPage />} />
        {/* 主窗口：四个模块 */}
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to="/links" />} />
          <Route path="links" element={<LinksRoutePage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="clipboard" element={<ClipboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate replace to="/links" />} />
        </Route>
      </Routes>
    </NoteTargetContext.Provider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <SearchWindowRedirect />
        <AppRoutes />
      </BrowserRouter>
      {/* 通知仅主窗口渲染（快捷搜索窗口保持干净） */}
      {!isSearchWindow() ? (
        <Toaster closeButton position="bottom-right" richColors />
      ) : null}
    </TooltipProvider>
  );
}

export default App;
