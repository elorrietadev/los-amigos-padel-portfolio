// PubChip — primitivo de selección del público (PUBLIC-R1): fecha, horario,
// categoría de catálogo, etc. se van a construir sobre este mismo botón en
// las próximas etapas (PUBLIC-R3/R4) — acá solo el look/estados, sin lógica
// de negocio.
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "../ui/cx";

export interface PubChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const PubChip = forwardRef<HTMLButtonElement, PubChipProps>(function PubChip(
  { active = false, disabled, className, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled}
      aria-pressed={active}
      className={cx(
        "pub-transition inline-flex items-center justify-center gap-1.5 rounded-pub-pill border px-4 py-2.5 text-[12.5px] font-bold whitespace-nowrap",
        "active:scale-[0.94] motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pub-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-pub-bg",
        "disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)] disabled:active:scale-100",
        active
          ? "border-pub-accent bg-pub-accent-muted text-pub-accent"
          : "border-pub-border bg-pub-surface text-pub-text-secondary hover:border-pub-border-strong",
        className,
      )}
      {...props}
    />
  );
});
