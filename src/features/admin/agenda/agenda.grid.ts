// agenda.grid.ts — R3 (rediseño visual de Agenda). Agrupa las celdas de
// 30min que arma agenda.logic.ts (calcularCelda/esFinDeBloque, sin tocar ese
// archivo — es lógica de negocio, fuera de alcance de R3) en "bloques" de
// varias filas para poder dibujar cada reserva/turno fijo/bloqueo como un
// único rectángulo según su duración real, en vez de una celda por cada
// franja de 30 minutos.
//
// Puramente de presentación: no decide qué es cada celda (eso lo sigue
// resolviendo calcularCelda), solo agrupa filas consecutivas con la misma
// identidad lógica (misma reserva/turno fijo) en un solo bloque con
// filaInicio+span.

import { calcularCelda, esFinDeBloque, type CeldaGrilla, type ExcepcionTurnoFijo, type ReservaConHorario, type TurnoFijoConHorario } from "./agenda.logic";

export type CeldaOcupada = Extract<CeldaGrilla, { estado: "reserva" | "bloqueado" | "fijo" }>;

export interface BloqueGrilla {
  celda: CeldaOcupada;
  filaInicio: number;
  span: number;
}

export function construirBloquesDia(
  fechaISO: string,
  filasGrilla: string[],
  reservasSemana: ReservaConHorario[],
  turnosFijos: TurnoFijoConHorario[],
  excepciones: ExcepcionTurnoFijo[],
  aperturaMin: number,
): BloqueGrilla[] {
  const bloques: BloqueGrilla[] = [];
  let actual: { celda: CeldaOcupada; filaInicio: number } | null = null;

  function cerrarBloque(finIdx: number) {
    if (!actual) return;
    bloques.push({ celda: actual.celda, filaInicio: actual.filaInicio, span: finIdx - actual.filaInicio });
    actual = null;
  }

  filasGrilla.forEach((hora, idx) => {
    const celda = calcularCelda(fechaISO, hora, reservasSemana, turnosFijos, excepciones, aperturaMin);
    if (celda.estado === "libre") {
      cerrarBloque(idx);
      return;
    }
    // Continúa el mismo bloque que ya estaba abierto: no hace falta hacer
    // nada acá, el span se calcula recién al cerrarlo (arriba/abajo).
    if (actual && !esFinDeBloque(actual.celda, celda)) return;
    cerrarBloque(idx);
    actual = { celda, filaInicio: idx };
  });
  cerrarBloque(filasGrilla.length);

  return bloques;
}
