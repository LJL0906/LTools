import { useEffect, useState } from "react";

/** JSON 子功能模式 */
export type JsonMode = "format" | "minify" | "validate";

interface JsonPanelProps {
  mode: JsonMode;
}

const FORMAT_DEBOUNCE_MS = 300;

interface JsonResult {
  ok: boolean;
  text: string;
  error: string;
}

/**
 * JSON 工具面板：输入后防抖自动处理。
 * - format：美化缩进
 * - minify：压缩为单行
 * - validate：仅校验合法性
 */
export function JsonPanel({ mode }: JsonPanelProps) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<JsonResult>({ ok: true, text: "", error: "" });
  const [copied, setCopied] = useState(false);

  // 输入防抖：停止输入 300ms 后自动格式化/校验
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = input.trim();
      if (!raw) {
        setResult({ ok: true, text: "", error: "" });
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (mode === "format") {
          setResult({ ok: true, text: JSON.stringify(parsed, null, 2), error: "" });
        } else if (mode === "minify") {
          setResult({ ok: true, text: JSON.stringify(parsed), error: "" });
        } else {
          setResult({ ok: true, text: "✅ JSON 合法", error: "" });
        }
      } catch (e) {
        setResult({
          ok: false,
          text: "",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }, FORMAT_DEBOUNCE_MS);
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

  const modeLabel =
    mode === "format" ? "格式化" : mode === "minify" ? "压缩" : "校验";

  return (
    <div className="json-panel">
      <label className="json-panel__label" htmlFor={`json-input-${mode}`}>
        JSON 输入（{modeLabel}）
      </label>
      <textarea
        aria-label={`JSON 输入（${modeLabel}）`}
        className="json-panel__input"
        id={`json-input-${mode}`}
        onChange={(event) => setInput(event.target.value)}
        placeholder='{"示例": "粘贴 JSON 后自动处理"}'
        spellCheck={false}
        value={input}
      />
      <div className="json-panel__result">
        <div className="json-panel__result-head">
          <span className="json-panel__result-title">
            输出{result.error ? "（无效）" : ""}
          </span>
          {result.text && mode !== "validate" ? (
            <button
              className="json-panel__copy"
              onClick={() => void copyOutput()}
              type="button"
            >
              {copied ? "已复制" : "复制"}
            </button>
          ) : null}
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
