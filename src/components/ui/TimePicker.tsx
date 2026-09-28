import { useRef, useState } from "react";
import { Check, Clock } from "lucide-react";
import { PickerPopover, type PickerProps } from "./PickerPopover";

export type TimeOption = string | { value: string; label?: string; disabled?: boolean };
export interface TimePickerProps extends PickerProps {
  options: readonly TimeOption[];
  isTimeDisabled?: (time: string) => boolean;
}
export function TimePicker({ options, isTimeDisabled, ...props }: TimePickerProps) {
  const items = options.map((option) => typeof option === "string" ? { value: option } : option);
  return <PickerPopover {...props} icon={<Clock size={17} aria-hidden="true" className="shrink-0 text-muted" />}
    display={items.find((item) => item.value === props.value)?.label ?? (props.value || props.placeholder || "Elegí un horario")}>
    {(close) => <TimeList items={items} value={props.value} isTimeDisabled={isTimeDisabled}
      select={(value) => { props.onChange(value); close(); }} />}
  </PickerPopover>;
}
function TimeList({ items, value, isTimeDisabled, select }: {
  items: Exclude<TimeOption, string>[]; value: string; isTimeDisabled?: (time: string) => boolean; select: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const filtered = items.filter((item) => !query || (item.label ?? item.value).includes(query));
  const blocked = (item: Exclude<TimeOption, string>) => item.disabled || isTimeDisabled?.(item.value);
  const enabled = filtered.filter((item) => !blocked(item));
  const [active, setActive] = useState<string | undefined>(enabled.some((item) => item.value === value) ? value : enabled[0]?.value);
  function focus(next: string | undefined) {
    setActive(next);
    const element = list.current?.querySelector<HTMLElement>(`[data-time="${next}"]`);
    element?.focus(); element?.scrollIntoView?.({ block: "nearest" });
  }
  return <>
    {items.length > 48 && <input aria-label="Buscar horario" placeholder="Buscar HH:mm" value={query}
      className="mb-2 min-h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
      onChange={(event) => {
        const query = event.target.value;
        setQuery(query);
        setActive(items.find((item) => !blocked(item) && (item.label ?? item.value).includes(query))?.value);
      }} onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); focus(enabled[0]?.value); }
        if (event.key === "Enter") {
          event.preventDefault();
          const selected = enabled.find((item) => item.value === active) ?? enabled[0];
          if (selected) select(selected.value);
        }
      }} />}
    <div ref={list} role="listbox" aria-label="Horarios" className="max-h-64 overflow-y-auto overscroll-contain">
      {filtered.map((item) => <button key={item.value} type="button" role="option"
        aria-selected={item.value === value} disabled={blocked(item)} data-time={item.value}
        data-picker-focus={item.value === active} tabIndex={item.value === active ? 0 : -1}
        onFocus={() => setActive(item.value)} onClick={() => select(item.value)}
        className={`picker-option flex min-h-11 w-full items-center justify-between rounded-md px-3 text-sm tabular-nums disabled:opacity-35 ${item.value === value ? "bg-accent font-semibold text-on-accent" : "hover:bg-surface-2"}`}
        onKeyDown={(event) => {
          const index = enabled.findIndex((option) => option.value === item.value);
          let next: number;
          if (event.key === "ArrowDown") next = Math.min(index + 1, enabled.length - 1);
          else if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = enabled.length - 1;
          else return;
          event.preventDefault(); focus(enabled[next]?.value);
        }}>{item.label ?? item.value}{item.value === value && <Check size={16} aria-hidden="true" />}</button>)}
      {!filtered.length && <p className="px-3 py-4 text-sm text-muted">No hay horarios disponibles.</p>}
    </div>
  </>;
}
