import type { InputHTMLAttributes } from "react";
import { Input } from "@/components/shadcn/ui/input";
import { cn } from "@/lib/utils";

type SearchBoxProps = InputHTMLAttributes<HTMLInputElement>;

export function SearchBox({ className, ...props }: SearchBoxProps) {
  return <Input {...props} className={cn("search-box", className)} type="search" />;
}