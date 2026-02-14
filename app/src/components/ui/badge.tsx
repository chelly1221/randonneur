import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
}

const variantClasses = {
  default: "bg-t-badge-bg text-t-badge-text",
  primary: "bg-t-badge-p-bg text-t-badge-p-text",
  success: "bg-sky-blue/20 text-t-success",
  warning: "bg-sky-yellow/20 text-sky-orange-dark",
  danger: "bg-sky-red/15 text-t-danger",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
