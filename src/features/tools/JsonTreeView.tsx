import { memo, useMemo } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import type { JsonNode } from "./jsonTree";

/**
 * 可折叠 JSON 树视图：按 JsonNode 树递归渲染，行文本与
 * JSON.stringify(parsed, null, 2) 逐字节一致（缩进为行首空格、行间换行），
 * 语法高亮通过 Prism.tokenize 逐行生成 token（与现有 .token.* 配色复用）。
 */

/** 单行文本的 Prism token 渲染（无匹配片段原样输出） */
const Tokenized = memo(function Tokenized({ text }: { text: string }) {
  const tokens = useMemo(
    () => Prism.tokenize(text, Prism.languages.json),
    [text],
  );
  return (
    <>
      {tokens.map((token, index) =>
        typeof token === "string" ? (
          <span key={index}>{token}</span>
        ) : (
          <span className={`token ${token.type}`} key={index}>
            {String(token.content)}
          </span>
        ),
      )}
    </>
  );
});

const INDENT_UNIT = 2; // 与 JSON.stringify(parsed, null, 2) 的缩进一致

/** 类型守卫：标量叶子节点（显式谓词保证 TS 窄化可靠） */
const isScalar = (node: JsonNode): node is Extract<JsonNode, { text: string }> =>
  node.kind === "string" ||
  node.kind === "number" ||
  node.kind === "boolean" ||
  node.kind === "null";

/** 容器行的开行文本：`"key": {`（无 key 时 `{`）；折叠时为 `"key": { … }` */
function containerOpenText(node: JsonNode, collapsed: boolean): string {
  const open = node.kind === "object" ? "{" : "[";
  const close = node.kind === "object" ? "}" : "]";
  const keyPart = node.key !== undefined ? `${JSON.stringify(node.key)}: ` : "";
  return collapsed ? `${keyPart}${open} … ${close}` : `${keyPart}${open}`;
}

interface TreeNodeProps {
  collapsed: ReadonlySet<JsonNode>;
  depth: number;
  /** 是否为父容器的最后一项：非末项行尾需补 `,`（与 JSON.stringify 一致） */
  isLastChild?: boolean;
  node: JsonNode;
  onToggle: (node: JsonNode) => void;
}

function TreeNode({
  collapsed,
  depth,
  isLastChild = true,
  node,
  onToggle,
}: TreeNodeProps) {
  const indent = " ".repeat(depth * INDENT_UNIT);
  const trailing = isLastChild ? "" : ",";

  // 标量叶子：整行 tokenize（`"key": value` 或数组元素 `value`）
  if (isScalar(node)) {
    const keyPart =
      node.key !== undefined ? `${JSON.stringify(node.key)}: ` : "";
    return (
      <>
        <div className="json-tree__line">
          <span className="json-tree__indent">{indent}</span>
          <Tokenized text={`${keyPart}${node.text}${trailing}`} />
        </div>
        {"\n"}
      </>
    );
  }

  // 空容器：单行 `{}` / `[]`，不可折叠（走到这里 node 必为容器）
  if (node.children.length === 0) {
    const close = node.kind === "object" ? "}" : "]";
    const keyPart =
      node.key !== undefined ? `${JSON.stringify(node.key)}: ` : "";
    return (
      <>
        <div className="json-tree__line">
          <span className="json-tree__indent">{indent}</span>
          <Tokenized text={`${keyPart}${node.kind === "object" ? "{" : "["}${close}${trailing}`} />
        </div>
        {"\n"}
      </>
    );
  }

  const isCollapsed = collapsed.has(node);
  const keyLabel = node.key !== undefined ? JSON.stringify(node.key) : node.kind;
  const toggleLabel = `${isCollapsed ? "展开" : "折叠"} ${keyLabel}`;
  const close = node.kind === "object" ? "}" : "]";

  return (
    <>
      {/* 容器开行（含折叠态） */}
      <div className="json-tree__line json-tree__line--container">
        <span className="json-tree__indent">{indent}</span>
        <button
          aria-label={toggleLabel}
          aria-pressed={isCollapsed}
          className="json-tree__toggle"
          onClick={() => onToggle(node)}
          type="button"
        />
        <Tokenized text={`${containerOpenText(node, isCollapsed)}${trailing}`} />
      </div>
      {"\n"}
      {/* 展开时递归渲染子节点 + 闭合行 */}
      {!isCollapsed ? (
        <>
          {node.children.map((child, index) => (
            <TreeNode
              collapsed={collapsed}
              depth={depth + 1}
              isLastChild={index === node.children.length - 1}
              key={index}
              node={child}
              onToggle={onToggle}
            />
          ))}
          <div className="json-tree__line">
            <span className="json-tree__indent">{indent}</span>
            <Tokenized text={close} />
          </div>
          {"\n"}
        </>
      ) : null}
    </>
  );
}

interface JsonTreeViewProps {
  collapsed: ReadonlySet<JsonNode>;
  onToggle: (node: JsonNode) => void;
  roots: JsonNode[];
}

/** 树容器：逐根渲染，滚动与配色沿用 .json-panel__output 容器 */
export function JsonTreeView({ collapsed, onToggle, roots }: JsonTreeViewProps) {
  return (
    <div className="json-tree">
      {roots.map((node, index) => (
        <TreeNode
          collapsed={collapsed}
          depth={0}
          key={index}
          node={node}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
