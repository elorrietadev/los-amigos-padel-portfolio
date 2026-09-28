// Card — solo base/elevated, a propósito nada más (ver pedido: "No crear una
// Card 'glass' genérica para usar en todos lados" — el vidrio esmerilado
// queda reservado a sidebar/header/overlays puntuales, no a cards comunes).
import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type CardVariant = "base" | "elevated";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const VARIANT: Record<CardVariant, string> = {
  base: "bg-surface shadow-sm",
  elevated: "bg-surface-elevated shadow-md",
};

export function Card({ variant = "base", className, ...props }: CardProps) {
  return <div className={cx("rounded-lg border border-border", VARIANT[variant], className)} {...props} />;
}
