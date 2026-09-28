import { forwardRef, type InputHTMLAttributes } from "react";
import { cx } from "./cx";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error = false, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={cx(
        "ui-transition text-body w-full rounded-md border bg-surface-2 px-3.5 py-2.5 text-text placeholder:text-muted",
        "focus-visible:outline-none focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]",
        error
          ? "border-error focus-visible:ring-error"
          : "border-border hover:border-border-strong focus-visible:border-accent focus-visible:ring-focus-ring",
        className,
      )}
      {...props}
    />
  );
});
