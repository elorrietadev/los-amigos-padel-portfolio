// PUBLIC-R5 — agrupación puramente de PRESENTACIÓN del horario semanal para
// Información: junta días consecutivos (Lunes a Domingo) que comparten
// exactamente el mismo horario en una sola línea ("Lunes a Viernes · 08 a 01
// hs") en vez de listar 7 filas casi siempre iguales. No es una regla de
// negocio nueva — solo decide cómo mostrar datos que ya vienen resueltos de
// horarios_semana_publica (ver useHorariosSemana/reservations.logic.ts).
import type { HorarioSemanaDia } from "../reservations-public/reservations.types";

// Orden de exhibición Lunes(1)..Domingo(0) — más natural para leer una
// semana que el orden crudo de la DB (0=Domingo..6=Sábado, igual a
// Date.getDay()). DIAS_SEMANA de features/baja/baja.logic.ts ya usa ese
// mismo índice crudo; acá solo se reordena para mostrar, el índice sigue
// siendo el mismo.
const ORDEN_LUNES_A_DOMINGO = [1, 2, 3, 4, 5, 6, 0];
const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export interface GrupoHorarioSemana {
  etiquetaDias: string;
  abierto: boolean;
  horaApertura: string | null;
  horaCierre: string | null;
}

function mismoHorario(a: HorarioSemanaDia, b: HorarioSemanaDia): boolean {
  return a.abierto === b.abierto && a.horaApertura === b.horaApertura && a.horaCierre === b.horaCierre;
}

function etiquetaDias(nombres: string[]): string {
  if (nombres.length === 1) return nombres[0];
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`;
  return `${nombres[0]} a ${nombres[nombres.length - 1]}`;
}

// Recibe los días en CUALQUIER orden (tal como llegan de horarios_semana_publica,
// no necesariamente las 7 filas) y devuelve grupos ya ordenados Lunes->Domingo.
// Si faltan días (fetch parcial) simplemente no aparecen — no se inventa un
// horario para un día sin dato.
function cerrarGrupo(actual: { dia: HorarioSemanaDia; nombres: string[] }): GrupoHorarioSemana {
  return {
    etiquetaDias: etiquetaDias(actual.nombres),
    abierto: actual.dia.abierto,
    horaApertura: actual.dia.horaApertura,
    horaCierre: actual.dia.horaCierre,
  };
}

export function agruparHorariosSemana(dias: HorarioSemanaDia[]): GrupoHorarioSemana[] {
  const porDia = new Map(dias.map((d) => [d.diaSemana, d]));
  const grupos: GrupoHorarioSemana[] = [];
  let actual: { dia: HorarioSemanaDia; nombres: string[] } | null = null;

  for (const diaSemana of ORDEN_LUNES_A_DOMINGO) {
    const dia = porDia.get(diaSemana);
    if (!dia) {
      // Un día sin dato ROMPE la racha: no se sabe si comparte horario con
      // el siguiente, así que nunca se fusiona "a través" de un hueco.
      if (actual) grupos.push(cerrarGrupo(actual));
      actual = null;
      continue;
    }
    if (actual && mismoHorario(actual.dia, dia)) {
      actual.nombres.push(NOMBRES_DIA[diaSemana]);
      continue;
    }
    if (actual) grupos.push(cerrarGrupo(actual));
    actual = { dia, nombres: [NOMBRES_DIA[diaSemana]] };
  }
  if (actual) grupos.push(cerrarGrupo(actual));
  return grupos;
}
