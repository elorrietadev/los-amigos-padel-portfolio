// PubButton — primitivo fundacional del público (PUBLIC-R1), paralelo a
// components/ui/Button.tsx pero con la identidad propia del jugador
// (Oswald, uppercase, tracking ancho — igual que los CTA del artifact
// aprobado) y sus propios tokens (--color-pub-*). No reemplaza a Button: el
// admin sigue usando el suyo, sin cambios.
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "../ui/cx";

export type PubButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type PubButtonSize = "sm" | "md" | "lg";

export interface PubButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PubButtonVariant;
  size?: PubButtonSize;
  loading?: boolean;
}

const VARIANT: Record<PubButtonVariant, string> = {
  primary: "bg-pub-accent text-pub-on-accent hover:bg-pub-accent-hover shadow-pub-sm",
  secondary: "border border-pub-border bg-pub-surface-2 text-pub-text hover:border-pub-border-strong hover:bg-pub-surface-hover",
  outline: "border border-pub-border bg-transparent text-pub-text hover:border-pub-accent hover:text-pub-accent",
  ghost: "text-pub-muted hover:bg-pub-surface-2 hover:text-pub-text",
  destructive: "border border-pub-danger bg-transparent text-pub-danger hover:bg-pub-danger/10",
};

const SIZE: Record<PubButtonSize, string> = {
  sm: "h-10 px-4 text-[12.5px]",
  md: "h-12 px-5 text-[13.5px]",
  lg: "h-14 px-6 text-[14.5px]",
};

export const PubButton = forwardRef<HTMLButtonElement, PubButtonProps>(function PubButton(
  { variant = "primary", size = "md", loading = false, disabled, className, children, type, ...props },
  ref,
) {
  const deshabilitado = disabled || loading;
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={deshabilitado}
      aria-busy={loading || undefined}
      className={cx(
        "pub-transition inline-flex items-center justify-center gap-2 rounded-pub-pill font-pub-heading font-bold tracking-wide uppercase whitespace-nowrap",
        "active:scale-[0.96] motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pub-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-pub-bg",
        "disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)] disabled:active:scale-100",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});
