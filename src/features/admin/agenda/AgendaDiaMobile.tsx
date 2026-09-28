// AgendaDiaMobile — R3. Vista mobile de la Agenda: NO son las mismas 7
// columnas comprimidas del desktop, es una vista de un solo día (selector
// horizontal de días arriba + bloques a ancho completo abajo), como pide el
// pedido ("OBJETIVO MOBILE"). Reusa AgendaColumnaDia/AgendaColumnaHoras (el
// mismo bloque real según duración que en desktop), solo que una única
// columna a ancho completo en vez de 7 lado a lado.

import type { CeldaOcupada } from "./agenda.grid";
import type { DiaGrilla, ExcepcionTurnoFijo, ReservaConHorario, TurnoFijoConHorario } from "./agenda.logic";
import { AgendaColumnaDia, AgendaColumnaHoras, useLineaAhora } from "./AgendaColumnaDia";

export const SLOT_PX_MOBILE = 40;

export interface AgendaDiaMobileProps {
  diasGrilla: DiaGrilla[];
  filasGrilla: string[];
  reservasSemana: ReservaConHorario[];
  turnosFijos: TurnoFijoConHorario[];
  excepciones: ExcepcionTurnoFijo[];
  // AUDIT-DAY #5 — ver el mismo par de props en AgendaGridDesktop.
  aperturaMinPorDia: Record<string, number>;
  aperturaMinDefault: number;
  hoy: string;
  // R3.1 — ver el mismo prop en AgendaGridDesktop.
  semanaEsActual: boolean;
  diaSeleccionado: string;
  onSeleccionarDia: (iso: string) => void;
  onClickCelda: (celda: CeldaOcupada) => void;
}

export function AgendaDiaMobile({
  diasGrilla,
  filasGrilla,
  reservasSemana,
  turnosFijos,
  excepciones,
  aperturaMinPorDia,
  aperturaMinDefault,
  hoy,
  semanaEsActual,
  diaSeleccionado,
  onSeleccionarDia,
  onClickCelda,
}: AgendaDiaMobileProps) {
  const lineaAhora = useLineaAhora(semanaEsActual, aperturaMinPorDia[hoy] ?? aperturaMinDefault, filasGrilla.length, SLOT_PX_MOBILE);
  return (
    <div className="mt-3">
      <div role="tablist" aria-label="Elegir día" className="flex gap-1.5 overflow-x-auto pb-1">
        {diasGrilla.map((d) => {
          const esHoy = d.iso === hoy;
          const activo = d.iso === diaSeleccionado;
          return (
            <button
              key={d.iso}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => onSeleccionarDia(d.iso)}
              className={`tap-fx flex min-w-[46px] flex-1 flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 ${
                activo
                  ? "border-accent bg-accent text-on-accent"
                  : esHoy
                    ? "border-accent text-accent"
                    : "border-border text-muted"
              }`}
            >
              <span className="text-[10px] font-semibold uppercase">{d.diaAbrev}</span>
              <span className="font-heading text-[15px] font-bold">{d.diaNum}</span>
            </button>
          );
        })}
      </div>

      <div className="agenda-scroll mt-3 flex overflow-y-auto rounded-md border border-border" style={{ maxHeight: "min(68dvh, 820px)" }}>
        <AgendaColumnaHoras filasGrilla={filasGrilla} slotPx={SLOT_PX_MOBILE} className="w-14 shrink-0 border-r border-border bg-surface" />
        <AgendaColumnaDia
          fechaISO={diaSeleccionado}
          filasGrilla={filasGrilla}
          reservasSemana={reservasSemana}
          turnosFijos={turnosFijos}
          excepciones={excepciones}
          aperturaMin={aperturaMinPorDia[diaSeleccionado] ?? aperturaMinDefault}
          slotPx={SLOT_PX_MOBILE}
          esHoy={diaSeleccionado === hoy}
          onClickCelda={onClickCelda}
          lineaAhoraPx={lineaAhora?.fechaISO === diaSeleccionado ? lineaAhora.topPx : null}
          className="flex-1"
        />
      </div>
    </div>
  );
}
