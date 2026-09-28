// Badge — 6 variantes semánticas. "danger" es el nombre de la variante (así
// se pidió para Badge en particular); por dentro consume el token `error`
// existente, no uno nuevo — ver la nota de nombres en tokens.css.
//
// R5.1 — pulido visual: todas las variantes suman un borde tintado al mismo
// color del texto (10-35% de opacidad vía color-mix, ver nota de Tailwind v4
// más abajo) para ganar definición/contraste sin subir la intensidad del
// fondo — "neutral" en particular pasa de `text-muted` (bajo contraste sobre
// bg-surface-2) a `text-text-secondary`, un nivel más de jerarquía ya
// existente en tokens.css. Puramente visual: ninguna variante cambia de
// nombre ni de significado semántico.
import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

// El modificador de opacidad `/NN` sobre un color de @theme (Tailwind v4)
// funciona igual con hex que con oklch — no hace falta ningún cambio en
// tokens.css para esto.
const VARIANT: Record<BadgeVariant, string> = {
  neutral: "border border-border-strong bg-surface-2 text-text-secondary",
  accent: "border border-accent/30 bg-accent-muted text-accent",
  success: "border border-success/30 bg-success-muted text-success",
  warning: "border border-warning/30 bg-warning-muted text-warning",
  danger: "border border-error/30 bg-error-muted text-error",
  info: "border border-info/30 bg-info-muted text-info",
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        "text-label inline-flex items-center gap-1 rounded-pill px-2.5 py-1 font-bold tracking-wide uppercase",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
