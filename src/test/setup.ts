import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock;
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

// jsdom 未实现 Text/Range 的 getClientRects；ProseMirror 的 scrollToSelection
// （coordsAtPos → singleRect）会调用，缺失时异步抛出 TypeError。
// 注意：TS lib.dom 未声明 Text.getClientRects，需断言访问。
const textPrototype = Text.prototype as unknown as {
  getClientRects?: () => DOMRectList;
};
if (typeof textPrototype.getClientRects !== "function") {
  textPrototype.getClientRects = () => [] as unknown as DOMRectList;
}

if (typeof Range.prototype.getClientRects !== "function") {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}

// jsdom 未实现 elementFromPoint / caretRangeFromPoint，ProseMirror 的点击命中检测
// （posAtCoords）依赖它们；缺失会导致 click 事件处理器抛错、选区无法同步。
// 返回编辑器内容区作为命中元素（布局尺寸为 0，坐标计算退化为 doc 内首个位置）。
// 注意：这是全局 mock，会影响渲染 .ProseMirror 的所有测试文件；当前测试集无冲突。
if (typeof document.elementFromPoint !== "function") {
  document.elementFromPoint = () =>
    document.querySelector(".ProseMirror") ?? document.body;
}

if (typeof document.caretRangeFromPoint !== "function") {
  document.caretRangeFromPoint = () => {
    const mirror = document.querySelector(".ProseMirror");
    if (!mirror?.firstChild) return null;
    const range = document.createRange();
    range.setStart(mirror.firstChild, 0);
    return range;
  };
}

afterEach(() => {
  cleanup();
});
