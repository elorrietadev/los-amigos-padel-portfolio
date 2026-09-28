// Button — primitivo fundacional de R1. 4 variantes, 2 tamaños, estados
// default/hover/active/focus/disabled/loading.
//
// loading reutiliza la clase .spinner ya existente (globals.css) en vez de
// crear un spinner nuevo — mismo look que ya usa AdminLogin.
//
// El press feedback (active:scale) y la transición de color/fondo/borde son
// dos mecanismos separados a propósito — ver el comentario de .ui-transition
// en globals.css (colisión de la propiedad `transition` como shorthand si
// se intenta meter todo en una sola clase compartida con otras utilities).
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "success";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-border bg-surface-2 text-text hover:border-border-strong hover:bg-surface-hover",
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
  destructive: "border border-error bg-error-muted text-error hover:bg-error/20",
  // R5 — acciones "positivas" que no son la CTA principal (Confirmar, Cargar
  // pago): el resto del código ya usa bg-success para esto (JugadaItem,
  // ReservaItem) pero a mano, sin pasar por este primitivo — variant nueva,
  // puramente aditiva (no toca ningún consumidor existente de Button).
  success: "bg-success text-on-accent hover:bg-success/90",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-11 px-5 text-[14px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
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
        "ui-transition inline-flex items-center justify-center gap-2 rounded-pill font-semibold whitespace-nowrap",
        "active:scale-[0.96] motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
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
