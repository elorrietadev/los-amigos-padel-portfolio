// PubCard — superficie base del público (PUBLIC-R1), paralela a
// components/ui/Card.tsx. `interactive` suma hover/pressed sutiles (nunca
// transform grande, ver reglas de motion del artifact aprobado) para cards
// que son también un link/botón (accesos rápidos, previews).
import type { HTMLAttributes } from "react";
import { cx } from "../ui/cx";

export type PubCardVariant = "base" | "elevated";

export interface PubCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: PubCardVariant;
  interactive?: boolean;
}

const VARIANT: Record<PubCardVariant, string> = {
  base: "bg-pub-surface",
  elevated: "bg-pub-surface shadow-pub-md",
};

export function PubCard({ variant = "base", interactive = false, className, ...props }: PubCardProps) {
  return (
    <div
      className={cx(
        "pub-transition rounded-pub-lg border border-pub-border",
        interactive &&
          "transition-transform duration-[var(--pub-duration-fast)] ease-[var(--pub-ease)] active:scale-[0.985] motion-reduce:active:scale-100 motion-reduce:hover:translate-y-0 hover:border-pub-accent/35 hover:-translate-y-0.5",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
