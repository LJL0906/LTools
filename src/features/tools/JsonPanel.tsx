import { useEffect, useMemo, useState } from "react";
import { collectContainers, parseJson, type JsonNode } from "./jsonTree";
import { JsonTreeView } from "./JsonTreeView";

const PROCESS_DEBOUNCE_MS = 300;

/** 预览模式：格式化（美化）或压缩（单行） */
export type JsonViewMode = "format" | "minify";

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

/**
 * JSON 格式化工具（受控组件）：顶部一整行操作按钮，下方左右两栏（输入 | 预览）。
 * - 输入/模式变化后 300ms 防抖自动处理（按当前模式：美化或压缩）
 * - 格式化 / 压缩为预览模式切换；一键复制、一键清空
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
  /** 折叠的容器节点集合（节点引用定位；输入/模式变化时自动重置） */
  const [collapsed, setCollapsed] = useState<ReadonlySet<JsonNode>>(new Set());

  /** 格式化模式下的折叠树（仅 format 有效；minify 保持纯文本） */
  const tree = useMemo(
    () =>
      result.ok && result.text && mode === "format"
        ? parseJson(result.text)
        : null,
    [mode, result.ok, result.text],
  );

  // 输入或模式变化（result 更新）后重置折叠状态，避免旧路径指向新树
  useEffect(() => {
    setCollapsed(new Set());
  }, [result, mode]);

  // 输入或模式变化后防抖处理
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = input.trim();
      if (!raw) {
        setResult({ ok: true, text: "", error: "" });
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        setResult({
          ok: true,
          text:
            mode === "format"
              ? JSON.stringify(parsed, null, 2)
              : JSON.stringify(parsed),
          error: "",
        });
      } catch (e) {
        setResult({
          ok: false,
          text: "",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }, PROCESS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input, mode]);

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默（与剪切板模块行为一致）
    }
  };

  /** 单个节点折叠 / 展开切换 */
  const toggleNode = (node: JsonNode) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(node)) next.delete(node);
      else next.add(node);
      return next;
    });
  };

  const collapseAll = () => {
    if (!tree || !tree.ok) return;
    setCollapsed(new Set(collectContainers(tree.roots)));
  };

  const expandAll = () => {
    setCollapsed(new Set());
  };

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
          disabled={!tree || !tree.ok || tree.roots.length === 0}
          onClick={collapseAll}
          type="button"
        >
          折叠全部
        </button>
        <button
          className="json-panel__action"
          disabled={collapsed.size === 0}
          onClick={expandAll}
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

        {/* 右：预览区（format 为可折叠树 / minify 为纯文本 / 错误 / 占位） */}
        <div className="json-panel__side">
          {result.error ? (
            <pre className="json-panel__error">{result.error}</pre>
          ) : result.ok && mode === "format" ? (
            <div aria-label="JSON 预览" className="json-panel__output">
              {tree && tree.ok && tree.roots.length > 0 ? (
                <JsonTreeView
                  collapsed={collapsed}
                  onToggle={toggleNode}
                  roots={tree.roots}
                />
              ) : (
                <div className="json-panel__placeholder">等待输入…</div>
              )}
            </div>
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
