// AgendaColumnaDia — R3/R3.1. Columna de un solo día (bloques reales según
// duración, posicionados en absoluto sobre una franja con líneas de fondo).
// La reusan tanto la grilla desktop (7 columnas lado a lado) como la vista
// mobile (una sola columna a ancho completo) — mismo componente, mismo look,
// para no mantener dos implementaciones del mismo bloque.
//
// AgendaColumnaHoras es la columna de horas fija que acompaña a esta (una
// vez en desktop a la izquierda de las 7 columnas, una vez en mobile a la
// izquierda de la única columna visible).
//
// R3.1 (pulido visual, sin tocar lógica de negocio):
//   - Jerarquía de líneas: hora completa vs. media hora (dos capas de
//     repeating-linear-gradient, ver `lineasDeFondo`).
//   - Etiqueta de hora reubicada DEBAJO de su línea (antes iba centrada
//     sobre la línea con un offset negativo — eso hacía que la primera
//     ("08:00") quedara parcialmente tapada por el header sticky, que ocupa
//     justo ese espacio negativo). Efecto secundario bienvenido: ya no hace
//     falta ningún padding/offset extra para "liberar" la primera hora.
//   - Fondo de los bloques ahora opaco (agenda.presentacion.ts) — ver esa
//     nota para el porqué de "las líneas no atraviesan el bloque".
//   - Línea de "hora actual" (useLineaAhora), solo cuando corresponde.
//
// R9.1-fix: se eliminó la línea horizontal de "hora actual" (atravesaba toda
// la agenda, quedaba confusa). useLineaAhora se mantiene (mismo cálculo de
// posición, mismos tests), pero ahora solo se usa para determinar qué bloque
// está efectivamente en curso (inicio <= ahora < fin) y marcarlo desde
// adentro: badge "EN JUEGO" + acento en el borde/sombra. Sin turno en curso,
// no se muestra ningún indicador.

import { useEffect, useState } from "react";
import { formatearISO } from "../../../lib/datetime";
import { construirBloquesDia, type CeldaOcupada } from "./agenda.grid";
import type { ExcepcionTurnoFijo, ReservaConHorario, TurnoFijoConHorario } from "./agenda.logic";
import { AgendaBloqueContenido, estaPagoPendiente, estiloBloque, tituloCelda } from "./agenda.presentacion";

export interface AgendaColumnaDiaProps {
  fechaISO: string;
  filasGrilla: string[];
  reservasSemana: ReservaConHorario[];
  turnosFijos: TurnoFijoConHorario[];
  excepciones: ExcepcionTurnoFijo[];
  aperturaMin: number;
  slotPx: number;
  esHoy: boolean;
  onClickCelda: (celda: CeldaOcupada) => void;
  // R9.1-fix — posición vertical (px) del instante "ahora" si esta columna es
  // la que le corresponde mostrarla (null en cualquier otro caso: otro día,
  // otra semana, o fuera del rango horario visible). Ver useLineaAhora más
  // abajo. Ya no se dibuja como línea: se usa solo para detectar qué bloque
  // está en curso ahora mismo.
  lineaAhoraPx?: number | null;
  className?: string;
}

function identidadBloque(celda: CeldaOcupada): string {
  if (celda.estado === "fijo") return `fijo:${celda.turnoFijo.id}`;
  return `${celda.estado}:${celda.reserva.id}`;
}

// Dos capas: la de encima (primera en la lista, "más cerca del usuario" en
// CSS) marca cada hora en punto con el color de borde normal ("sutil pero
// visible"); la de abajo marca cada media hora con el mismo color diluido al
// ~40% ("bastante más tenue") — evita la sensación de tabla plana sin perder
// la referencia visual de cada franja de 30min.
function lineasDeFondo(slotPx: number): string {
  const horaEnPunto = "color-mix(in srgb, var(--color-border) 65%, transparent)";
  const media = "color-mix(in srgb, var(--color-border) 25%, transparent)";
  return [
    `repeating-linear-gradient(to bottom, ${horaEnPunto} 0, ${horaEnPunto} 1px, transparent 1px, transparent ${slotPx * 2}px)`,
    `repeating-linear-gradient(to bottom, ${media} 0, ${media} 1px, transparent 1px, transparent ${slotPx}px)`,
  ].join(", ");
}

export function AgendaColumnaDia({
  fechaISO,
  filasGrilla,
  reservasSemana,
  turnosFijos,
  excepciones,
  aperturaMin,
  slotPx,
  esHoy,
  onClickCelda,
  lineaAhoraPx,
  className,
}: AgendaColumnaDiaProps) {
  const bloques = construirBloquesDia(fechaISO, filasGrilla, reservasSemana, turnosFijos, excepciones, aperturaMin);
  const alturaTotal = filasGrilla.length * slotPx;

  return (
    <div
      data-testid={`agenda-dia-${fechaISO}`}
      className={`relative border-r border-border/50 last:border-r-0 ${esHoy ? "bg-accent-muted/30" : "bg-surface"} ${className ?? ""}`}
      style={{
        height: alturaTotal,
        backgroundImage: lineasDeFondo(slotPx),
        // "Hoy" queda enmarcada dentro de su propia columna (además del tinte
        // y del círculo acento en el header) sin sumar un borde grueso extra
        // que compita con los separadores de columna.
        boxShadow: esHoy ? "inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 12%, transparent)" : undefined,
      }}
    >
      {bloques.map((bloque) => {
        const { className: colorClassName, style } = estiloBloque(bloque.celda);
        const pendiente = estaPagoPendiente(bloque.celda);
        // inicio <= ahora < fin, en las mismas unidades (px) que ya usa la
        // grilla para posicionar el bloque — equivale exactamente a comparar
        // minutos reales porque topPx/filaInicio/span salen del mismo
        // slotPx, sin redondeos adicionales.
        const inicioPx = bloque.filaInicio * slotPx;
        const finPx = (bloque.filaInicio + bloque.span) * slotPx;
        const enCurso = lineaAhoraPx != null && lineaAhoraPx >= inicioPx && lineaAhoraPx < finPx;
        return (
          <button
            key={identidadBloque(bloque.celda)}
            type="button"
            title={tituloCelda(bloque.celda)}
            onClick={() => onClickCelda(bloque.celda)}
            className={`agenda-event absolute inset-x-[4px] flex items-start overflow-hidden rounded-[7px] px-2 py-1 text-left focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface ${colorClassName}`}
            style={{
              ...style,
              top: bloque.filaInicio * slotPx + 1,
              height: bloque.span * slotPx - 2,
              ...(enCurso
                ? { boxShadow: "0 0 0 1px var(--color-secondary), 0 2px 4px rgb(0 0 0 / 12%)" }
                : undefined),
            }}
          >
            <AgendaBloqueContenido celda={bloque.celda} duracionMin={bloque.span * 30} enCurso={enCurso} />
            {pendiente && <span aria-hidden="true" className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-warning" />}
          </button>
        );
      })}
    </div>
  );
}

export function AgendaColumnaHoras({ filasGrilla, slotPx, className }: { filasGrilla: string[]; slotPx: number; className?: string }) {
  return (
    <div className={className} style={{ height: filasGrilla.length * slotPx }}>
      {filasGrilla.map((hora) => (
        <div key={hora} style={{ height: slotPx }} className="relative">
          {hora.endsWith(":00") && <span className="absolute top-[2px] right-2 text-[11px] font-medium tabular-nums text-muted">{hora}</span>}
        </div>
      ))}
    </div>
  );
}

// R3.1 — línea de "hora actual", solo cuando se muestra la semana vigente
// (`activo`, decidido por el llamador según semanaOffset === 0). No toca
// nada de reservas: es puramente una posición derivada de la hora del
// sistema, recalculada una vez por minuto mientras está activa.
//
// El rango horario de la grilla es "extendido" (admin.html/B6:
// calcularCierreExtendido) porque el día operativo cruza medianoche (cierra
// 01:00 del día siguiente) — igual que una reserva de 00:30 pertenece a la
// columna del día ANTERIOR (ver agenda.logic.ts/extenderReserva), la línea
// de "ahora" tiene que ubicarse en esa misma columna "de ayer" cuando la
// hora real está entre medianoche y la apertura.
export function useLineaAhora(
  activo: boolean,
  aperturaMin: number,
  cantidadFilas: number,
  slotPx: number,
): { fechaISO: string; topPx: number } | null {
  const [ahoraMs, setAhoraMs] = useState(() => Date.now());

  useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => setAhoraMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [activo]);

  if (!activo) return null;

  const d = new Date(ahoraMs);
  const minutosReales = d.getHours() * 60 + d.getMinutes();
  let fechaISO: string;
  let minutosExt: number;
  if (minutosReales < aperturaMin) {
    const ayer = new Date(d);
    ayer.setDate(d.getDate() - 1);
    fechaISO = formatearISO(ayer);
    minutosExt = minutosReales + 1440;
  } else {
    fechaISO = formatearISO(d);
    minutosExt = minutosReales;
  }

  const finExt = aperturaMin + cantidadFilas * 30;
  if (minutosExt < aperturaMin || minutosExt >= finExt) return null;

  return { fechaISO, topPx: ((minutosExt - aperturaMin) / 30) * slotPx };
}
