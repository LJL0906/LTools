import { useEffect, useState } from "react";

const PROCESS_DEBOUNCE_MS = 300;

/** 预览模式：格式化（美化）或压缩（单行） */
type ViewMode = "format" | "minify";

interface JsonResult {
  ok: boolean;
  text: string;
  error: string;
}

/**
 * JSON 格式化工具：左右布局（输入 | 预览）。
 * - 输入防抖自动处理（按当前模式：美化或压缩）
 * - 操作按钮：格式化 / 压缩（切换预览模式）、一键复制、一键清空
 */
export function JsonPanel() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ViewMode>("format");
  const [result, setResult] = useState<JsonResult>({ ok: true, text: "", error: "" });
  const [copied, setCopied] = useState(false);

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

  const clearAll = () => {
    setInput("");
    setResult({ ok: true, text: "", error: "" });
    setCopied(false);
  };

  return (
    <div className="json-panel">
      {/* 左：输入区 */}
      <div className="json-panel__side">
        <div className="json-panel__side-head">
          <span className="json-panel__label">JSON 输入</span>
        </div>
        <textarea
          aria-label="JSON 输入"
          className="json-panel__input"
          onChange={(event) => setInput(event.target.value)}
          placeholder='{"示例": "粘贴 JSON 后自动处理"}'
          spellCheck={false}
          value={input}
        />
        <button
          className="json-panel__clear"
          onClick={clearAll}
          type="button"
        >
          一键清空
        </button>
      </div>

      {/* 右：预览区 */}
      <div className="json-panel__side">
        <div className="json-panel__actions">
          <button
            aria-pressed={mode === "format"}
            className={`json-panel__action${
              mode === "format" ? " is-active" : ""
            }`}
            onClick={() => setMode("format")}
            type="button"
          >
            格式化
          </button>
          <button
            aria-pressed={mode === "minify"}
            className={`json-panel__action${
              mode === "minify" ? " is-active" : ""
            }`}
            onClick={() => setMode("minify")}
            type="button"
          >
            压缩
          </button>
          <button
            className="json-panel__action"
            disabled={!result.text}
            onClick={() => void copyOutput()}
            type="button"
          >
            {copied ? "已复制" : "一键复制"}
          </button>
        </div>
        {result.error ? (
          <pre className="json-panel__error">{result.error}</pre>
        ) : result.text ? (
          <pre className="json-panel__output">{result.text}</pre>
        ) : (
          <div className="json-panel__placeholder">等待输入…</div>
        )}
      </div>
    </div>
  );
}
