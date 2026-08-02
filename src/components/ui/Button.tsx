import * as React from "react";
import { Button as ShadcnButton } from "@/components/shadcn/ui/button";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({
  className,
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <ShadcnButton
      className={cn("button", `button--${variant}`, className)}
      variant={variant === "primary" ? "default" : "outline"}
      {...props}
    />
  );
}