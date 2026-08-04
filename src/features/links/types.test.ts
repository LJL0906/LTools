import { describe, expect, it } from "vitest";
import { getLinkUrl } from "./types";

describe("getLinkUrl", () => {
  it("地址不带协议时拼接下拉框选择的协议", () => {
    expect(getLinkUrl({ protocol: "https", address: "example.com/api" })).toBe(
      "https://example.com/api",
    );
    expect(getLinkUrl({ protocol: "ws", address: "example.com/ws" })).toBe(
      "ws://example.com/ws",
    );
  });

  it("地址自带协议时不重复拼接", () => {
    expect(
      getLinkUrl({ protocol: "https", address: "https://example.com/api" }),
    ).toBe("https://example.com/api");
  });

  it("地址自带协议与下拉框选择不一致时以地址为准", () => {
    expect(
      getLinkUrl({ protocol: "https", address: "http://example.com/api" }),
    ).toBe("http://example.com/api");
  });

  it("识别大写协议的地址", () => {
    expect(
      getLinkUrl({ protocol: "https", address: "HTTPS://example.com" }),
    ).toBe("HTTPS://example.com");
  });

  it("地址前后有空格时先去除再判断", () => {
    expect(
      getLinkUrl({ protocol: "https", address: "  https://example.com  " }),
    ).toBe("https://example.com");
    expect(
      getLinkUrl({ protocol: "https", address: "  example.com  " }),
    ).toBe("https://example.com");
  });
});
