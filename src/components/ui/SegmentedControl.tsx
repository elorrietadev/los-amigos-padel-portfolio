// Equal-width options with a persistent CSS indicator. Only selection changes animate;
// loading, mounting and surrounding layout changes do not move the indicator.
import { type ReactNode } from "react";
import { cx } from "./cx";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = {
  sm: "px-2 py-1.5 text-xs",
  md: "px-3 py-2 text-[13px]",
  lg: "px-4 py-2.5 text-sm",
} as const;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  size = "md",
  className,
}: SegmentedControlProps<T>) {
  const selectedIndex = options.findIndex((option) => option.value === value);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        "relative isolate grid gap-1 rounded-pill border border-border bg-surface-2 p-1",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {selectedIndex >= 0 && <span
        aria-hidden="true"
        className="segmented-indicator pointer-events-none absolute top-1 bottom-1 left-1 rounded-pill bg-accent"
        style={{
          width: `calc((100% - 8px - ${(options.length - 1) * 4}px) / ${options.length})`,
          transform: `translateX(calc(${selectedIndex * 100}% + ${selectedIndex * 4}px))`,
        }}
      />}
      {options.map((op) => {
        const activo = op.value === value;
        return (
          <button
            key={op.value}
            type="button"
            aria-pressed={activo}
            disabled={disabled}
            onClick={() => onChange(op.value)}
            className={cx(
              "ui-transition relative rounded-pill font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]",
              SIZE[size],
              activo ? "text-on-accent" : "text-muted hover:text-text",
            )}
          >
            <span className="relative z-10">{op.label}</span>
          </button>
        );
      })}
    </div>
  );
}
