import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-md border border-t-border bg-t-surface px-3 py-2 text-sm text-t-text placeholder:text-t-faint focus:border-t-focus focus:outline-none focus:ring-1 focus:ring-t-focus",
        className
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";
