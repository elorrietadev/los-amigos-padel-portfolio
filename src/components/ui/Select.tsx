// Select nativo estilizado — se importa el ícono directo de lucide-react acá
// (sin wrapper propio, más limpio para un solo uso puntual como este).
import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./cx";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error = false, className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={error || undefined}
        className={cx(
          "ui-transition text-body w-full appearance-none rounded-md border bg-surface-2 py-2.5 pr-10 pl-3.5 text-text",
          "focus-visible:outline-none focus-visible:ring-2",
          "disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]",
          error
            ? "border-error focus-visible:ring-error"
            : "border-border hover:border-border-strong focus-visible:border-accent focus-visible:ring-focus-ring",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
      />
    </div>
  );
});
