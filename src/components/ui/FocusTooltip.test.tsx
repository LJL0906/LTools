import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TooltipProvider, TooltipContent, TooltipTrigger } from "../shadcn/ui/tooltip";
import { FocusTooltip } from "./FocusTooltip";

function renderFocusTooltip() {
  return render(
    <TooltipProvider>
      <FocusTooltip>
        <TooltipTrigger asChild>
          <button type="button">目标按钮</button>
        </TooltipTrigger>
        <TooltipContent>提示内容</TooltipContent>
      </FocusTooltip>
    </TooltipProvider>,
  );
}

describe("FocusTooltip（窗口聚焦感知）", () => {
  it("hover 显示 tooltip，窗口失焦后关闭，重新聚焦不自动弹出", async () => {
    const user = userEvent.setup();
    renderFocusTooltip();
    const button = screen.getByRole("button", { name: "目标按钮" });

    // hover → tooltip 显示
    await user.hover(button);
    expect(await screen.findByText("提示内容")).toBeInTheDocument();

    // 窗口失焦 → tooltip 关闭
    fireEvent.blur(window);
    expect(screen.queryByText("提示内容")).not.toBeInTheDocument();

    // 重新聚焦 → 不自动弹出（鼠标仍在按钮上方也不会弹）
    fireEvent.focus(window);
    expect(screen.queryByText("提示内容")).not.toBeInTheDocument();
    await user.hover(button);
    expect(screen.queryByText("提示内容")).not.toBeInTheDocument();

    // 鼠标移出再移回 → 重新显示
    await user.unhover(button);
    await user.hover(button);
    expect(await screen.findByText("提示内容")).toBeInTheDocument();
  });
});
