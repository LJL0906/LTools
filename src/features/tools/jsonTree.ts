/**
 * JSON 折叠的数据层：把格式化后的 JSON 文本解析为节点树。
 *
 * - 渲染层（JsonTreeView）按树递归渲染，折叠状态用节点引用集合管理；
 * - 叶子节点的 text 与 JSON.stringify(parsed, null, 2) 输出规则完全一致，
 *   保证"复制完整文本"与预览所见一致；
 * - 纯函数、无 React 依赖，可独立单测。
 */

/** JSON 节点：容器（对象/数组）或标量（string/number/boolean/null） */
export type JsonNode =
  | { kind: "object" | "array"; key?: string; children: JsonNode[] }
  | { kind: "string" | "number" | "boolean" | "null"; key?: string; text: string };

export interface JsonParseResult {
  ok: boolean;
  roots: JsonNode[];
  error: string;
}

/** 标量统一用 JSON.stringify 序列化：与 stringify(parsed, null, 2) 输出规则一致 */
function scalarText(value: boolean | number | string | null): string {
  return JSON.stringify(value);
}

function toNode(value: unknown, key?: string): JsonNode {
  if (value === null) {
    return { kind: "null", key, text: scalarText(null) };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean", key, text: scalarText(value) };
  }
  if (typeof value === "number") {
    return { kind: "number", key, text: scalarText(value) };
  }
  if (typeof value === "string") {
    return { kind: "string", key, text: scalarText(value) };
  }
  if (Array.isArray(value)) {
    return {
      kind: "array",
      key,
      children: value.map((item) => toNode(item)),
    };
  }
  return {
    kind: "object",
    key,
    children: Object.entries(value as Record<string, unknown>).map(
      ([childKey, childValue]) => toNode(childValue, childKey),
    ),
  };
}

/** 解析 JSON 文本为节点树；非法输入返回错误信息（复用 JSON.parse 的报错） */
export function parseJson(input: string): JsonParseResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: true, roots: [], error: "" };
  }
  try {
    const parsed = JSON.parse(raw);
    return { ok: true, roots: [toNode(parsed)], error: "" };
  } catch (e) {
    return {
      ok: false,
      roots: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 收集所有非空容器节点（折叠全部 / 展开全部的遍历基础；空容器无折叠意义） */
export function collectContainers(roots: JsonNode[]): JsonNode[] {
  const out: JsonNode[] = [];
  const walk = (nodes: JsonNode[]) => {
    for (const node of nodes) {
      if (node.kind === "object" || node.kind === "array") {
        if (node.children.length > 0) out.push(node);
        walk(node.children);
      }
    }
  };
  walk(roots);
  return out;
}

/** 节点在树中的路径描述（调试 / aria-label 用；根 = `$`，子节点按索引拼接） */
export function describePath(roots: JsonNode[], target: JsonNode): string {
  if (roots.length === 1 && roots[0] === target) return "$";
  const find = (nodes: JsonNode[], path: string): string | null => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodePath = `${path}[${i}]`;
      if (node === target) return nodePath;
      if (node.kind === "object" || node.kind === "array") {
        const childPath = find(node.children, nodePath);
        if (childPath !== null) return childPath;
      }
    }
    return null;
  };
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    if (root === target) return i === 0 ? "$" : `$[${i}]`;
    if (root.kind === "object" || root.kind === "array") {
      const childPath = find(root.children, i === 0 ? "$" : `$[${i}]`);
      if (childPath !== null) return childPath;
    }
  }
  return "?";
}
