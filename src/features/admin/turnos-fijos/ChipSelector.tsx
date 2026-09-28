// ChipSelector — fila horizontal de chips seleccionables con drag-to-scroll en
// desktop (mouse). Puerto del patrón `sty.scrollSelector` + arrastre de
// admin.html:445-467 (ahí aplicado a la grilla de Agenda; acá al mismo tipo de
// selector de horario/día que el legacy repite 2 veces en Turnos Fijos y 2
// veces más en Bloqueos — C2 ya lo usa 3 veces en el mismo form, así que vale
// la pena extraerlo ahora). Sin variantes de tamaño/color/orientación: si un
// selector futuro necesita algo distinto, es otro componente, no una prop más
// acá.

import { useRef, type MouseEvent as ReactMouseEvent } from "react";

interface EstadoArrastre {
  activo: boolean;
  startX: number;
  scrollLeft: number;
  movio: boolean;
}

export interface ChipSelectorProps<T extends string | number> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  renderLabel?: (option: T) => string;
  ariaLabel?: string;
}

export function ChipSelector<T extends string | number>({
  options,
  value,
  onChange,
  renderLabel,
  ariaLabel,
}: ChipSelectorProps<T>) {
  const arrastreRef = useRef<EstadoArrastre>({ activo: false, startX: 0, scrollLeft: 0, movio: false });

  function iniciarArrastre(e: ReactMouseEvent<HTMLDivElement>) {
    arrastreRef.current = { activo: true, startX: e.pageX, scrollLeft: e.currentTarget.scrollLeft, movio: false };
    e.currentTarget.style.cursor = "grabbing";
  }
  function moverArrastre(e: ReactMouseEvent<HTMLDivElement>) {
    const a = arrastreRef.current;
    if (!a.activo) return;
    const delta = e.pageX - a.startX;
    if (Math.abs(delta) > 3) a.movio = true;
    e.currentTarget.scrollLeft = a.scrollLeft - delta;
  }
  function terminarArrastre(e: ReactMouseEvent<HTMLDivElement>) {
    e.currentTarget.style.cursor = "grab";
    arrastreRef.current = { ...arrastreRef.current, activo: false };
  }
  // admin.html:462-467 — un arrastre no debe disparar el click del chip debajo
  // del cursor al soltar.
  function bloquearClickSiArrastro(e: ReactMouseEvent<HTMLDivElement>) {
    if (arrastreRef.current.movio) {
      e.stopPropagation();
      e.preventDefault();
      arrastreRef.current = { ...arrastreRef.current, movio: false };
    }
  }

  return (
    <div
      aria-label={ariaLabel}
      className="flex gap-1.5 overflow-x-auto"
      onMouseDown={iniciarArrastre}
      onMouseMove={moverArrastre}
      onMouseUp={terminarArrastre}
      onMouseLeave={terminarArrastre}
      onClickCapture={bloquearClickSiArrastro}
    >
      {options.map((opt) => (
        <button
          key={String(opt)}
          type="button"
          onClick={() => onChange(opt)}
          className={`tap-fx ui-transition shrink-0 rounded-pill border px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
            opt === value
              ? "border-success bg-success/15 text-success"
              : "border-border text-muted hover:border-border-strong hover:text-text"
          }`}
        >
          {renderLabel ? renderLabel(opt) : opt}
        </button>
      ))}
    </div>
  );
}
