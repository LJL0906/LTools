import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("application navigation", () => {
  it("opens the links module by default and switches to notes", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole("button", { name: "添加链接" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "链接" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(screen.getByRole("link", { name: "笔记" }));

    expect(screen.getByRole("heading", { name: "项目会议记录" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "笔记" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
