import { useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { PickerPopover, type PickerProps } from "./PickerPopover";
import { formatearISO, hoyISO } from "../../lib/datetime";

export interface DatePickerProps extends PickerProps {
  min?: string;
  max?: string;
  isDateDisabled?: (date: string) => boolean;
  clearable?: boolean;
}
// Calendar-only arithmetic: external ISO strings never pass through UTC.
function date(iso: string) { return new Date(`${iso}T12:00:00`); }
function shift(iso: string, days: number) {
  const next = date(iso); next.setDate(next.getDate() + days); return formatearISO(next);
}
const monthFormat = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });
function compactDate(iso: string) {
  return dayFormat.formatToParts(date(iso)).filter((part) => part.type !== "literal").map((part) => part.type === "month" ? part.value.replace(/\./g, "").slice(0, 3) : part.value).join(" ");
}

export function DatePicker(props: DatePickerProps) {
  const { value, onChange, min, max, isDateDisabled, clearable = !props.required } = props;
  const disabledDate = (iso: string) => Boolean((min && iso < min) || (max && iso > max) || isDateDisabled?.(iso));
  return <PickerPopover {...props} icon={<Calendar size={17} aria-hidden="true" className="shrink-0 text-muted" />}
    invalid={!!value && disabledDate(value)} display={value ? compactDate(value) : props.placeholder ?? "Elegí una fecha"}>
    {(close) => <CalendarPanel value={value} min={min} max={max} disabledDate={disabledDate}
      clearable={clearable} select={(iso) => { onChange(iso); close(); }} />}
  </PickerPopover>;
}

function CalendarPanel({ value, min, max, disabledDate, clearable, select }: {
  value: string; min?: string; max?: string; disabledDate: (iso: string) => boolean;
  clearable: boolean; select: (iso: string) => void;
}) {
  const today = hoyISO();
  const initial = value || (min && today < min ? min : max && today > max ? max : today);
  const [active, setActive] = useState(initial);
  const [month, setMonth] = useState(initial.slice(0, 7));
  const grid = useRef<HTMLDivElement>(null);
  const first = `${month}-01`;
  const start = shift(first, -((date(first).getDay() + 6) % 7));
  function changeMonth(amount: number) {
    const next = date(first); next.setMonth(next.getMonth() + amount);
    const iso = formatearISO(next); setMonth(iso.slice(0, 7)); setActive(iso);
  }
  function move(iso: string) {
    if (min && iso < min) iso = min;
    if (max && iso > max) iso = max;
    setActive(iso); setMonth(iso.slice(0, 7));
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-date="${iso}"]`)?.focus());
  }
  return <>
    <div className="mb-3 flex items-center justify-between gap-2">
      <button type="button" aria-label="Mes anterior" className="min-h-11 min-w-11 rounded-md hover:bg-surface-2"
        disabled={!!min && month <= min.slice(0, 7)} onClick={() => changeMonth(-1)}><ChevronLeft size={18} className="mx-auto" /></button>
      <span aria-live="polite" className="text-sm font-semibold first-letter:uppercase">{monthFormat.format(date(first))}</span>
      <button type="button" aria-label="Mes siguiente" className="min-h-11 min-w-11 rounded-md hover:bg-surface-2"
        disabled={!!max && month >= max.slice(0, 7)} onClick={() => changeMonth(1)}><ChevronRight size={18} className="mx-auto" /></button>
    </div>
    <div ref={grid} role="grid" aria-label="Calendario">
      <div role="row" className="grid grid-cols-7">{["L", "M", "X", "J", "V", "S", "D"].map((day, i) =>
        <span role="columnheader" key={i} className="py-1 text-center text-xs text-muted">{day}</span>)}</div>
      {Array.from({ length: 6 }, (_, week) => <div role="row" key={week} className="grid grid-cols-7">
        {Array.from({ length: 7 }, (_, day) => {
          const iso = shift(start, week * 7 + day);
          const blocked = disabledDate(iso);
          return <div role="gridcell" aria-selected={iso === value} key={iso}>
            <button type="button" data-date={iso} data-picker-focus={iso === active} tabIndex={iso === active ? 0 : -1}
              aria-label={compactDate(iso)} aria-current={iso === today ? "date" : undefined} aria-disabled={blocked}
              onFocus={() => setActive(iso)} onClick={() => { if (!blocked) select(iso); }}
              className={`min-h-10 w-full rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${iso === value ? "bg-accent font-semibold text-on-accent" : "hover:bg-surface-2"} ${blocked ? "cursor-not-allowed opacity-35" : ""} ${iso.slice(0, 7) !== month ? "text-muted" : ""} ${iso === today ? "ring-1 ring-inset ring-accent" : ""}`}
              onKeyDown={(event) => {
                const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -day, End: 6 - day };
                if (event.key in offsets) { event.preventDefault(); move(shift(iso, offsets[event.key])); }
                if (event.key === "PageUp" || event.key === "PageDown") {
                  event.preventDefault(); const next = date(`${iso.slice(0, 7)}-01`);
                  next.setMonth(next.getMonth() + (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1)); move(formatearISO(next));
                }
              }}>{date(iso).getDate()}</button>
          </div>;
        })}
      </div>)}
    </div>
    {clearable && <button type="button" className="mt-2 min-h-11 w-full rounded-md text-sm text-muted hover:bg-surface-2" onClick={() => select("")}>Limpiar fecha</button>}
  </>;
}
