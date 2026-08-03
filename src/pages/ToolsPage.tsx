import { useState } from "react";
import { ModuleLayout } from "../components/layout/ModuleLayout";
import { JsonPanel, type JsonMode } from "../features/tools/JsonPanel";

/** 顶部工具 tab（当前仅 JSON 格式化，未来加工具时扩展数组） */
const TOOL_TABS = [{ id: "json", label: "JSON 格式化" }];

/** 当前工具下的子功能页签（左侧菜单） */
const SUB_TOOLS: { id: JsonMode; label: string; description: string }[] = [
  { id: "format", label: "格式化", description: "美化缩进" },
  { id: "minify", label: "压缩", description: "去除空白" },
  { id: "validate", label: "校验", description: "检查合法性" },
];

/**
 * 工具模块：顶部为工具 tab（未来多工具），左侧为当前工具的子功能页签，
 * 右侧为工作区。三个子功能面板常驻挂载、切换显隐，切换页签不丢失输入。
 */
export function ToolsPage() {
  const [activeTool] = useState("json");
  const [activeSub, setActiveSub] = useState<JsonMode>("format");

  return (
    <div className="tools-page">
      <div
        aria-label="工具"
        className="tools-page__toolbar"
        role="tablist"
      >
        {TOOL_TABS.map((tab) => (
          <button
            aria-selected={activeTool === tab.id}
            className="tools-page__tool-tab"
            key={tab.id}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <ModuleLayout
        maxSidebarWidth={220}
        minSidebarWidth={150}
        sidebar={
          <nav aria-label="工具功能" className="tools-page__menu">
            {SUB_TOOLS.map((sub) => (
              <button
                aria-pressed={activeSub === sub.id}
                className={`tools-page__menu-item${
                  activeSub === sub.id ? " is-active" : ""
                }`}
                key={sub.id}
                onClick={() => setActiveSub(sub.id)}
                type="button"
              >
                <span className="tools-page__menu-label">{sub.label}</span>
                <span className="tools-page__menu-desc">{sub.description}</span>
              </button>
            ))}
          </nav>
        }
        sidebarStateKey="tools"
        sidebarWidth={180}
      >
        {SUB_TOOLS.map((sub) => (
          <div hidden={activeSub !== sub.id} key={sub.id}>
            <JsonPanel mode={sub.id} />
          </div>
        ))}
      </ModuleLayout>
    </div>
  );
}
