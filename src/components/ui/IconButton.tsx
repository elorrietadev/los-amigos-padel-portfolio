// IconButton — mismo sistema visual que Button (colores/estados), pero
// cuadrado y sin texto. aria-label es obligatorio a nivel de tipos (no en
// runtime): un IconButton sin nombre accesible es un bug de accesibilidad,
// no un caso válido con valor por defecto.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export type IconButtonVariant = "ghost" | "secondary";
export type IconButtonSize = "sm" | "md";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  children: ReactNode;
  "aria-label": string;
}

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
  secondary: "border border-border bg-surface-2 text-text hover:border-border-strong hover:bg-surface-hover",
};

const SIZE: Record<IconButtonSize, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "ghost", size = "md", disabled, className, children, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled}
      className={cx(
        "ui-transition inline-flex shrink-0 items-center justify-center rounded-md",
        "active:scale-[0.96] motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)] disabled:active:scale-100",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
