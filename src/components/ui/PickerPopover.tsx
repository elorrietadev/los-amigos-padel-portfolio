import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";
import "./pickers.css";

export interface PickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
}

// Native top layer avoids clipping in scrolling admin dialogs, while keeping
// the panel in the dialog's DOM/focus scope. No modal semantics or focus trap.
export function PickerPopover({ value, disabled, required, label, "aria-label": ariaLabel,
  "aria-describedby": describedBy, className, id, name, icon, display, invalid,
  role = "dialog", children,
}: Omit<PickerProps, "onChange"> & {
  icon: ReactNode;
  display: string;
  invalid?: boolean;
  role?: "dialog" | "listbox";
  children: (close: () => void) => ReactNode;
}) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const panelId = `${generatedId}-panel`;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const validation = useRef<HTMLInputElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    validation.current?.setCustomValidity(invalid ? "Seleccioná un valor válido." : "");
  }, [invalid, value]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const element = panel.current;
    element.showPopover?.();
    function position() {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      element.style.width = `${Math.min(336, width - 16)}px`;
      element.style.maxHeight = `${height - 16}px`;
      const panelHeight = element.getBoundingClientRect().height;
      element.style.left = `${Math.max(left + 8, Math.min(anchor.left, left + width - element.offsetWidth - 8))}px`;
      element.style.top = `${Math.max(top + 8, Math.min(anchor.bottom + 6, top + height - panelHeight - 8))}px`;
    }
    position();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(element);
    const initialFocus = element.querySelector<HTMLElement>('[data-picker-focus="true"]') ?? element;
    initialFocus.focus();
    initialFocus.scrollIntoView?.({ block: "nearest" });
    function outside(event: PointerEvent) {
      if (!element.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      observer?.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [open]);

  return <div className={cx("picker-root block min-w-0", className)}>
    {label && <label htmlFor={triggerId} className="mb-2 block text-body-sm text-text-secondary">{label}</label>}
    <button ref={trigger} id={triggerId} type="button" disabled={disabled}
      aria-label={ariaLabel ?? label} aria-describedby={describedBy} aria-haspopup={role}
      aria-expanded={open} aria-controls={open ? panelId : undefined} aria-invalid={invalid || undefined}
      className="picker-trigger ui-transition flex min-h-11 w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-left text-sm text-text hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => open ? close() : setOpen(true)}
      onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>
      {icon}<span className={cx("truncate", !value && "text-muted")}>{display}</span>
    </button>
    {/* Only form validation/submission; never a native date/time UI. */}
    <input ref={validation} className="sr-only" tabIndex={-1} aria-hidden="true"
      name={name} value={value} required={required} disabled={disabled}
      onChange={() => {}} onInvalid={(event) => { event.preventDefault(); trigger.current?.focus(); setOpen(true); }} />
    {open && !disabled && <div ref={panel} popover={typeof HTMLElement.prototype.showPopover === "function" ? "manual" : undefined} tabIndex={-1} id={panelId} role={role}
      aria-label={ariaLabel ?? label ?? "Elegir valor"} className="picker-panel"
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      }}>{children(close)}</div>}
  </div>;
}
