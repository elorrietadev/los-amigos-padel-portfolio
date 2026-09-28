// AgendaGridDesktop — R3. Grilla semanal desktop/notebook: columna de horas
// fija + header de días sticky, usando casi todo el ancho útil (columnas
// flexibles, no los 42px angostos del legacy). Cada columna de día dibuja sus
// bloques reales según duración vía AgendaColumnaDia — acá solo se arma el
// layout (grid + sticky) y se conecta el drag-to-scroll horizontal existente
// (mismos handlers que ya vivían en AgendaView, sin cambiar su lógica).

import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { CeldaOcupada } from "./agenda.grid";
import type { DiaGrilla, ExcepcionTurnoFijo, ReservaConHorario, TurnoFijoConHorario } from "./agenda.logic";
import { AgendaColumnaDia, AgendaColumnaHoras, useLineaAhora } from "./AgendaColumnaDia";

export const SLOT_PX_DESKTOP = 32;
const COL_HORAS_PX = 56;

export interface AgendaGridDesktopProps {
  diasGrilla: DiaGrilla[];
  filasGrilla: string[];
  reservasSemana: ReservaConHorario[];
  turnosFijos: TurnoFijoConHorario[];
  excepciones: ExcepcionTurnoFijo[];
  // AUDIT-DAY #5 — apertura propia de cada día visible (clave = fecha ISO),
  // no una única `aperturaMin` global: con horarios_semana muy distintos
  // entre días, usar el mínimo de la semana para TODOS los días corría mal
  // el corte de medianoche de los días que abren más tarde. `aperturaMinDefault`
  // (el mínimo global que ya se usaba antes) es el fallback para un día
  // ausente del mapa (cerrado, o sin franja resuelta todavía).
  aperturaMinPorDia: Record<string, number>;
  aperturaMinDefault: number;
  hoy: string;
  // R3.1 — semana actualmente visible (semanaOffset === 0, decidido por
  // AgendaView): gatea la línea de "hora actual", que no tiene sentido
  // mostrar navegando otras semanas.
  semanaEsActual: boolean;
  onClickCelda: (celda: CeldaOcupada) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onMouseMove: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onMouseUp: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onMouseLeave: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onClickCapture: (e: ReactMouseEvent<HTMLDivElement>) => void;
}

export function AgendaGridDesktop({
  diasGrilla,
  filasGrilla,
  reservasSemana,
  turnosFijos,
  excepciones,
  aperturaMinPorDia,
  aperturaMinDefault,
  hoy,
  semanaEsActual,
  onClickCelda,
  scrollRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onClickCapture,
}: AgendaGridDesktopProps) {
  // La línea de "ahora" solo puede caer en la columna de HOY o en la de ayer
  // (cruce de medianoche) — su propia apertura es la de HOY, nunca el mínimo
  // global de la semana (ver useLineaAhora).
  const lineaAhora = useLineaAhora(semanaEsActual, aperturaMinPorDia[hoy] ?? aperturaMinDefault, filasGrilla.length, SLOT_PX_DESKTOP);

  return (
    <div
      ref={scrollRef}
      className="agenda-scroll mt-3 max-h-[min(72vh,900px)] cursor-grab overflow-auto rounded-[12px] border border-border/70 shadow-sm"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onClickCapture={onClickCapture}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `${COL_HORAS_PX}px repeat(${diasGrilla.length}, minmax(108px, 1fr))`, minWidth: 760 }}
      >
        <div className="sticky top-0 left-0 z-30 border-r border-b border-border bg-surface" />
        {diasGrilla.map((d) => {
          const esHoy = d.iso === hoy;
          return (
            <div
              key={d.iso}
              className={`sticky top-0 z-20 flex flex-col items-center gap-1 border-b border-border bg-surface py-3 ${
                esHoy ? "text-accent" : "text-muted"
              }`}
            >
              <span className="text-[11px] font-semibold tracking-wider uppercase">{d.diaAbrev}</span>
              <span
                className={`font-heading flex h-7 w-7 items-center justify-center rounded-full text-[14px] font-bold ${
                  esHoy ? "bg-accent text-on-accent" : "text-text"
                }`}
              >
                {d.diaNum}
              </span>
            </div>
          );
        })}

        <AgendaColumnaHoras filasGrilla={filasGrilla} slotPx={SLOT_PX_DESKTOP} className="sticky left-0 z-10 border-r border-border bg-surface" />
        {diasGrilla.map((d) => (
          <AgendaColumnaDia
            key={d.iso}
            fechaISO={d.iso}
            filasGrilla={filasGrilla}
            reservasSemana={reservasSemana}
            turnosFijos={turnosFijos}
            excepciones={excepciones}
            aperturaMin={aperturaMinPorDia[d.iso] ?? aperturaMinDefault}
            slotPx={SLOT_PX_DESKTOP}
            esHoy={d.iso === hoy}
            onClickCelda={onClickCelda}
            lineaAhoraPx={lineaAhora?.fechaISO === d.iso ? lineaAhora.topPx : null}
          />
        ))}
      </div>
    </div>
  );
}
