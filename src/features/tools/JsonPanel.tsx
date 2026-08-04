import { useEffect, useMemo, useState, type CSSProperties } from "react";
import JsonView from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";
import { vscodeTheme } from "@uiw/react-json-view/vscode";

const PROCESS_DEBOUNCE_MS = 300;
const SEARCH_DEBOUNCE_MS = 200;
/** 搜索路径分隔符（\0 不会出现在 JSON 键中） */
const PATH_SEP = "\u0000";

/** 预览模式：格式化（美化）或压缩（单行） */
export type JsonViewMode = "format" | "minify";
/** 预览树主题 */
export type JsonTheme = "light" | "dark" | "vscode";

interface JsonPanelProps {
  input: string;
  mode: JsonViewMode;
  onInputChange: (input: string) => void;
  onModeChange: (mode: JsonViewMode) => void;
  onClear: () => void;
}

interface JsonResult {
  ok: boolean;
  text: string;
  error: string;
}

/** 亮色主题变量（与项目 token 配色一致；dark/vscode 复用库主题） */
const LIGHT_THEME = {
  "--w-rjv-color": "var(--color-text)",
  "--w-rjv-key-string": "var(--color-primary)",
  "--w-rjv-background-color": "transparent",
  "--w-rjv-line-color": "#ebebeb",
  "--w-rjv-arrow-color": "var(--color-text-secondary)",
  "--w-rjv-edit-color": "var(--color-text-secondary)",
  "--w-rjv-info-color": "var(--color-text-muted)",
  "--w-rjv-update-color": "#ebcb8b",
  "--w-rjv-copied-color": "var(--color-text-secondary)",
  "--w-rjv-copied-success-color": "#28a745",
  "--w-rjv-curlybraces-color": "var(--color-text-secondary)",
  "--w-rjv-colon-color": "var(--color-text-secondary)",
  "--w-rjv-brackets-color": "var(--color-text-secondary)",
  "--w-rjv-quotes-color": "var(--color-text)",
  "--w-rjv-quotes-string-color": "#2e7d32",
  "--w-rjv-type-string-color": "#2e7d32",
  "--w-rjv-type-int-color": "#7c3aed",
  "--w-rjv-type-float-color": "#7c3aed",
  "--w-rjv-type-bigint-color": "#7c3aed",
  "--w-rjv-type-boolean-color": "#b45309",
  "--w-rjv-type-null-color": "#b45309",
  "--w-rjv-type-date-color": "#586e75",
  "--w-rjv-type-url-color": "#0969da",
  "--w-rjv-font-family": '"Cascadia Code", Consolas, monospace',
} as Record<string, string> & CSSProperties;

const THEME_VARIANTS: Record<JsonTheme, CSSProperties> = {
  light: LIGHT_THEME,
  dark: darkTheme,
  vscode: vscodeTheme,
};

const THEME_LABELS: Record<JsonTheme, string> = {
  light: "亮色",
  dark: "暗色",
  vscode: "VSCode",
};

/** 递归收集匹配路径（键或标量值包含关键词，小写不敏感） */
function collectSearchMatches(
  value: unknown,
  path: Array<string | number>,
  query: string,
  out: Array<Array<string | number>>,
): void {
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = [...path, key];
      if (key.toLowerCase().includes(query)) out.push(next);
      collectSearchMatches(child, next, query, out);
    }
  } else if (
    value !== null &&
    value !== undefined &&
    String(value).toLowerCase().includes(query)
  ) {
    out.push(path);
  }
}

/**
 * JSON 格式化工具（受控组件）：顶部一整行操作按钮，下方左右两栏（输入 | 预览）。
 * - 输入/模式变化后 300ms 防抖自动处理（按当前模式：美化或压缩）
 * - format 预览由 @uiw/react-json-view 树视图渲染：可折叠/搜索/三套主题
 * - 复制统一由"一键复制"按钮输出 JSON.stringify 后的干净文本
 */
export function JsonPanel({
  input,
  mode,
  onInputChange,
  onModeChange,
  onClear,
}: JsonPanelProps) {
  const [result, setResult] = useState<JsonResult>({ ok: true, text: "", error: "" });
  const [copied, setCopied] = useState(false);
  /** 解析后的 JSON 数据（format 树渲染用；null = 空输入或解析失败） */
  const [parsed, setParsed] = useState<unknown>(null);
  /** 折叠全部（true）/ 展开全部（false）：驱动 JsonView 的 collapsed */
  const [collapseAll, setCollapseAll] = useState(false);
  /** 树重挂载版本：输入/模式变化、折叠全部/展开全部时递增，让 collapsed 生效并清空库内展开状态 */
  const [viewVersion, setViewVersion] = useState(0);
  /** 搜索框输入值（受控，即时更新） */
  const [searchInput, setSearchInput] = useState("");
  /** 搜索生效值（防抖后）；空串 = 未搜索 */
  const [search, setSearch] = useState("");
  /** 搜索重挂载版本：搜索变化时递增，让 shouldExpandNodeInitially 生效 */
  const [searchVersion, setSearchVersion] = useState(0);
  /** 当前预览树主题 */
  const [theme, setTheme] = useState<JsonTheme>("light");

  // 输入或模式变化后防抖处理
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = input.trim();
      if (!raw) {
        setResult({ ok: true, text: "", error: "" });
        setParsed(null);
        return;
      }
      try {
        const value = JSON.parse(raw);
        setParsed(value);
        setResult({
          ok: true,
          text:
            mode === "format"
              ? JSON.stringify(value, null, 2)
              : JSON.stringify(value),
          error: "",
        });
      } catch (e) {
        setParsed(null);
        setResult({
          ok: false,
          text: "",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }, PROCESS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input, mode]);

  // 搜索框输入防抖：生效后重挂载树并恢复展开（使搜索路径展开逻辑生效）
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setSearchVersion((version) => version + 1);
      if (searchInput.trim()) setCollapseAll(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // 输入或模式变化（result 更新）后：恢复展开全部、清空搜索并重挂载树，避免旧状态残留
  useEffect(() => {
    setCollapseAll(false);
    setSearchInput("");
    setSearch("");
    setSearchVersion(0);
    setViewVersion((version) => version + 1);
  }, [result, mode]);

  /** 搜索匹配路径（去重后）与其前缀集合（用于展开含匹配的容器链） */
  const searchMatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query || parsed === null) {
      return { prefixes: new Set<string>(), count: 0 };
    }
    const paths: Array<Array<string | number>> = [];
    collectSearchMatches(parsed, [], query, paths);
    // 键与值同路径命中时去重，避免重复计数
    const unique = new Map<string, Array<string | number>>();
    for (const path of paths) unique.set(path.join(PATH_SEP), path);
    const prefixes = new Set<string>();
    for (const path of unique.values()) {
      for (let index = 0; index <= path.length; index++) {
        prefixes.add(path.slice(0, index).join(PATH_SEP));
      }
    }
    return { prefixes, count: unique.size };
  }, [search, parsed]);

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默（与剪切板模块行为一致）
    }
  };

  /** 拦截预览区任意复制（全选/框选 Ctrl+C），统一写入干净的格式化文本 */
  const handlePreviewCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", result.text);
  };

  const collapseAllNodes = () => {
    setCollapseAll(true);
    setViewVersion((version) => version + 1);
  };

  const expandAllNodes = () => {
    setCollapseAll(false);
    setViewVersion((version) => version + 1);
  };

  /** format 树渲染仅针对对象/数组；顶层标量回退为纯文本 */
  const showTree = parsed !== null && typeof parsed === "object";

  /** 搜索生效时：仅展开含匹配节点路径的容器链 */
  const handleInitialExpand = (
    _isExpanded: boolean,
    props: { keys: Array<string | number> },
  ): boolean => searchMatches.prefixes.has(props.keys.join(PATH_SEP));

  return (
    <div className="json-panel">
      {/* 顶部一整行操作按钮 */}
      <div className="json-panel__actions">
        <button
          aria-pressed={mode === "format"}
          className={`json-panel__action${
            mode === "format" ? " is-active" : ""
          }`}
          onClick={() => onModeChange("format")}
          type="button"
        >
          格式化
        </button>
        <button
          aria-pressed={mode === "minify"}
          className={`json-panel__action${
            mode === "minify" ? " is-active" : ""
          }`}
          onClick={() => onModeChange("minify")}
          type="button"
        >
          压缩
        </button>
        <button
          className="json-panel__action"
          disabled={mode !== "format" || !showTree || search.trim() !== ""}
          onClick={collapseAllNodes}
          type="button"
        >
          折叠全部
        </button>
        <button
          className="json-panel__action"
          disabled={mode !== "format"}
          onClick={expandAllNodes}
          type="button"
        >
          展开全部
        </button>
        <button
          className="json-panel__action"
          disabled={!result.text}
          onClick={() => void copyOutput()}
          type="button"
        >
          {copied ? "已复制" : "一键复制"}
        </button>
        <button
          className="json-panel__action"
          onClick={onClear}
          type="button"
        >
          一键清空
        </button>
        {/* 主题切换 */}
        <span aria-label="预览主题" className="json-panel__theme" role="group">
          {(Object.keys(THEME_VARIANTS) as JsonTheme[]).map((item) => (
            <button
              aria-pressed={theme === item}
              className={`json-panel__action${
                theme === item ? " is-active" : ""
              }`}
              key={item}
              onClick={() => setTheme(item)}
              type="button"
            >
              {THEME_LABELS[item]}
            </button>
          ))}
        </span>
      </div>

      {/* 左右两栏：等高（flex:1 + stretch），各自独立滚动 */}
      <div className="json-panel__columns">
        {/* 左：输入区 */}
        <div className="json-panel__side">
          <textarea
            aria-label="JSON 输入"
            className="json-panel__input"
            onChange={(event) => onInputChange(event.target.value)}
            placeholder='{"示例": "粘贴 JSON 后自动处理"}'
            spellCheck={false}
            value={input}
          />
        </div>

        {/* 右：预览区（format 为可搜索/可折叠树 / minify 为纯文本 / 错误 / 占位） */}
        <div className="json-panel__side">
          {result.error ? (
            <pre className="json-panel__error">{result.error}</pre>
          ) : result.ok && mode === "format" ? (
            showTree ? (
              <div className="json-panel__preview">
                <div className="json-panel__search">
                  <input
                    aria-label="JSON 搜索"
                    className="json-panel__search-input"
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="搜索键或值…"
                    value={searchInput}
                  />
                  {search.trim() ? (
                    <span className="json-panel__search-count">
                      {searchMatches.count > 0
                        ? `匹配 ${searchMatches.count} 处`
                        : "无匹配"}
                    </span>
                  ) : null}
                </div>
                <JsonView
                  key={`${mode}-${viewVersion}-${searchVersion}`}
                  aria-label="JSON 预览"
                  className="json-panel__output"
                  collapsed={collapseAll}
                  displayDataTypes={false}
                  displayObjectSize={false}
                  enableClipboard
                  indentWidth={10}
                  onCopy={handlePreviewCopy}
                  shouldExpandNodeInitially={
                    search.trim() ? handleInitialExpand : undefined
                  }
                  shortenTextAfterLength={0}
                  style={THEME_VARIANTS[theme]}
                  value={parsed as object}
                />
              </div>
            ) : result.text ? (
              <pre aria-label="JSON 预览" className="json-panel__output">
                {result.text}
              </pre>
            ) : (
              <div className="json-panel__placeholder">等待输入…</div>
            )
          ) : result.text ? (
            <pre aria-label="JSON 预览" className="json-panel__output">
              {result.text}
            </pre>
          ) : (
            <div className="json-panel__placeholder">等待输入…</div>
          )}
        </div>
      </div>
    </div>
  );
}
