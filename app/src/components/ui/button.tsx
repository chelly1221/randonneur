import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-t-primary text-white hover:bg-t-primary-x":
              variant === "primary",
            "bg-t-secondary text-t-text hover:bg-t-secondary-x":
              variant === "secondary",
            "border border-t-outline-border bg-t-outline-bg text-t-text hover:bg-t-outline-hover":
              variant === "outline",
            "text-t-text hover:bg-t-hover": variant === "ghost",
            "bg-t-danger text-white hover:opacity-90": variant === "danger",
          },
          {
            "px-3 py-1.5 text-sm": size === "sm",
            "px-4 py-2 text-sm": size === "md",
            "px-6 py-3 text-base": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
