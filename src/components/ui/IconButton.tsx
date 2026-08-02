import type { ButtonHTMLAttributes } from "react";
import { Button as ShadcnButton } from "@/components/shadcn/ui/button";
import { cn } from "@/lib/utils";

export function IconButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <ShadcnButton
      className={cn("icon-button", className)}
      size="icon"
      type={type}
      variant="ghost"
      {...props}
    />
  );
}