// TitularPicker — TF-R3. Selector con búsqueda para elegir un titular
// existente al agregarle un horario nuevo desde el modal de alta (opción
// "Titular existente" del SegmentedControl). Construido sobre PickerPopover
// (mismo primitivo que ya usan TimePicker/DatePicker: trigger + panel
// posicionado, navegación por teclado, cierre por click afuera/Escape ya
// resueltos ahí) — este archivo solo aporta el contenido del panel, mismo
// patrón que TimeList en TimePicker.tsx.
//
// La lista de titulares no pide nada al servidor: se deriva de
// turnosFijos.turnosFijos (ya cargado por useTurnosFijos) vía
// agruparPorTitular — todo titular visible en el admin ya tiene al menos un
// horario, así que no hace falta una query separada.
//
// Búsqueda por nombre O teléfono (no solo nombre): dos titulares pueden
// compartir teléfono (decisión de diseño de TF-R2, sin dedup), así que el
// teléfono ayuda a desambiguar cuando dos personas tienen nombres parecidos
// o iguales.
import { useRef, useState } from "react";
import { Check, User } from "lucide-react";
import { PickerPopover, type PickerProps } from "../../../components/ui/PickerPopover";
import type { TitularAgrupado } from "./turnosFijos.logic";

export interface TitularPickerProps extends PickerProps {
  titulares: readonly TitularAgrupado[];
}

export function TitularPicker({ titulares, ...props }: TitularPickerProps) {
  const seleccionado = titulares.find((t) => t.titularId === props.value);
  return (
    <PickerPopover
      {...props}
      icon={<User size={17} aria-hidden="true" className="shrink-0 text-muted" />}
      display={seleccionado ? `${seleccionado.nombre} · ${seleccionado.telefono}` : props.placeholder || "Elegí un titular"}
    >
      {(close) => (
        <TitularList
          titulares={titulares}
          value={props.value}
          select={(value) => {
            props.onChange(value);
            close();
          }}
        />
      )}
    </PickerPopover>
  );
}

function TitularList({
  titulares,
  value,
  select,
}: {
  titulares: readonly TitularAgrupado[];
  value: string;
  select: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const consulta = query.trim().toLowerCase();
  const filtrados = titulares.filter(
    (t) => !consulta || t.nombre.toLowerCase().includes(consulta) || t.telefono.includes(consulta),
  );
  const [active, setActive] = useState<string | undefined>(
    filtrados.some((t) => t.titularId === value) ? value : filtrados[0]?.titularId,
  );

  function focus(next: string | undefined) {
    setActive(next);
    const element = list.current?.querySelector<HTMLElement>(`[data-titular="${next}"]`);
    element?.focus();
    element?.scrollIntoView?.({ block: "nearest" });
  }

  return (
    <>
      <input
        aria-label="Buscar titular"
        placeholder="Buscar por nombre o teléfono"
        value={query}
        className="mb-2 min-h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
        onChange={(event) => {
          const nuevaConsulta = event.target.value;
          setQuery(nuevaConsulta);
          const buscado = nuevaConsulta.trim().toLowerCase();
          const primero = titulares.find(
            (t) => !buscado || t.nombre.toLowerCase().includes(buscado) || t.telefono.includes(buscado),
          );
          setActive(primero?.titularId);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            focus(filtrados[0]?.titularId);
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const elegido = filtrados.find((t) => t.titularId === active) ?? filtrados[0];
            if (elegido) select(elegido.titularId);
          }
        }}
      />
      <div ref={list} role="listbox" aria-label="Titulares" className="max-h-64 overflow-y-auto overscroll-contain">
        {filtrados.map((t, index) => (
          <button
            key={t.titularId}
            type="button"
            role="option"
            aria-selected={t.titularId === value}
            data-titular={t.titularId}
            data-picker-focus={t.titularId === active}
            tabIndex={t.titularId === active ? 0 : -1}
            onFocus={() => setActive(t.titularId)}
            onClick={() => select(t.titularId)}
            className={`picker-option flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-sm ${
              t.titularId === value ? "bg-accent font-semibold text-on-accent" : "hover:bg-surface-2"
            }`}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowDown") next = Math.min(index + 1, filtrados.length - 1);
              else if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = filtrados.length - 1;
              else return;
              event.preventDefault();
              focus(filtrados[next]?.titularId);
            }}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{t.nombre}</span>
              <span className="truncate text-xs opacity-75">{t.telefono}</span>
            </span>
            {t.titularId === value && <Check size={16} aria-hidden="true" className="shrink-0" />}
          </button>
        ))}
        {!filtrados.length && <p className="px-3 py-4 text-sm text-muted">No hay titulares que coincidan.</p>}
      </div>
    </>
  );
}
