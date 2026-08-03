import { describe, expect, it } from "vitest";
import { collectContainers, describePath, parseJson } from "./jsonTree";

describe("parseJson", () => {
  it("parses an object with all scalar types", () => {
    const { ok, roots, error } = parseJson(
      '{"name":"ltools","count":2,"active":true,"extra":null}',
    );
    expect(ok).toBe(true);
    expect(error).toBe("");
    expect(roots).toHaveLength(1);
    const root = roots[0];
    expect(root.kind).toBe("object");
    if (root.kind !== "object") return;
    expect(root.children).toHaveLength(4);
    const [name, count, active, extra] = root.children;
    expect(name).toMatchObject({ kind: "string", key: "name", text: '"ltools"' });
    expect(count).toMatchObject({ kind: "number", key: "count", text: "2" });
    expect(active).toMatchObject({ kind: "boolean", key: "active", text: "true" });
    expect(extra).toMatchObject({ kind: "null", key: "extra", text: "null" });
  });

  it("parses nested arrays and objects with correct keys", () => {
    const { ok, roots } = parseJson('{"b":[1,{"c":"x"}],"d":[]}');
    expect(ok).toBe(true);
    const root = roots[0];
    expect(root.kind).toBe("object");
    if (root.kind !== "object") return;
    const [b, d] = root.children;
    expect(b).toMatchObject({ kind: "array", key: "b" });
    if (b.kind !== "array") return;
    // 数组元素无 key；嵌套对象带 key
    expect(b.children[0]).toMatchObject({ kind: "number", key: undefined });
    expect(b.children[1]).toMatchObject({ kind: "object", key: undefined });
    if (b.children[1].kind !== "object") return;
    expect(b.children[1].children[0]).toMatchObject({
      kind: "string",
      key: "c",
      text: '"x"',
    });
    // 空数组保留为容器但无子节点
    expect(d).toMatchObject({ kind: "array", key: "d", children: [] });
  });

  it("parses scalar roots", () => {
    expect(parseJson('"hello"').roots[0]).toMatchObject({
      kind: "string",
      text: '"hello"',
    });
    expect(parseJson("42").roots[0]).toMatchObject({
      kind: "number",
      text: "42",
    });
  });

  it("returns error for invalid JSON", () => {
    const { ok, error, roots } = parseJson('{"a": 1,}');
    expect(ok).toBe(false);
    expect(error).not.toBe("");
    expect(roots).toHaveLength(0);
  });

  it("treats blank input as empty", () => {
    const { ok, roots } = parseJson("   ");
    expect(ok).toBe(true);
    expect(roots).toHaveLength(0);
  });

  it("keeps number text identical to JSON.stringify output", () => {
    // 指数形式等特殊数字：树文本必须与 stringify(parsed, null, 2) 一致
    const { roots } = parseJson("1e21");
    expect(roots[0]).toMatchObject({ kind: "number", text: "1e+21" });
  });
});

describe("collectContainers", () => {
  it("collects all non-empty containers in document order", () => {
    const { roots } = parseJson('{"a":{"b":1},"c":[2,{"d":3}]}');
    const containers = collectContainers(roots);
    // 根对象、a、c、c[1]（内层对象）——空容器不收集
    expect(containers).toHaveLength(4);
    const paths = containers.map((n) => describePath(roots, n));
    expect(paths).toEqual(["$", "$[0]", "$[1]", "$[1][1]"]);
  });

  it("collects nothing for scalar or empty roots", () => {
    expect(collectContainers(parseJson("42").roots)).toHaveLength(0);
    expect(collectContainers(parseJson("{}").roots)).toHaveLength(0);
  });
});
