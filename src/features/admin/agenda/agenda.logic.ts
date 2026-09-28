// Lógica pura de la Agenda (grilla semanal) — puerto de admin.html:2144-2189,
// 2148-2162, 2211, 2253-2254 (B6). Sin fetch/hooks/UI/Realtime: todo acá toma
// los datos ya cargados como parámetros y devuelve estructuras/valores, igual
// que reservas.logic.ts hace para su dominio.
//
// A propósito NO importa nada de reservas.logic.ts/reservas.types.ts — Agenda
// es su propio dominio, no depende de Reservas. Reusa `extenderReserva`,
// `horaToMinutos`, `minutosToHora`, `formatearISO` de lib/datetime.ts (esas sí
// son genéricas y ya vivían ahí) y define sus propios tipos mínimos a partir
// de database.types.ts en vez de los ya recortados de reservas.types.ts.
// `calcularCierreExtendido` (B6) se movió de reservations-public/reservations.logic.ts
// a lib/datetime.ts por el mismo motivo: es genérica (dos números, sin nada de
// dominio) y Agenda la necesita tanto como reservations-public.

import {
  calcularCierreExtendido,
  esReservaVigente,
  extenderReserva,
  formatearISO,
  horaToMinutos,
  minutosToHora,
  ocurrenciaEsPosteriorACreacion,
  recortarHora,
} from "../../../lib/datetime";
import { limpiarTelefonoWa } from "../../../lib/format";
import type { Tables } from "../../../types/database.types";

export type ReservaConHorario = Tables<"reservas"> & { horaInicio: string; horaFin: string };
// TF-R2 — nombre/telefono ya no viven en turnos_fijos (ahora en titulares_turno_fijo,
// tabla hija por titular_id); useTurnosFijos los aplana desde el embed de
// Supabase antes de construir este shape, así que el resto del código (agenda,
// turnosFijos.logic.ts, reservas.logic.ts) sigue viéndolos como campos propios.
export type TurnoFijoConHorario = Pick<Tables<"turnos_fijos">, "id" | "dia_semana" | "titular_id"> & {
  nombre: string;
  telefono: string;
  horaInicio: string;
  horaFin: string;
  // FINAL-F3 (M5) — turnos_fijos.creado. Opcional a propósito: ausente/nulo =
  // sin cota inferior (ver ocurrenciaEsPosteriorACreacion en lib/datetime.ts).
  creado?: string | null;
};
export type ExcepcionTurnoFijo = Tables<"excepciones_turno_fijo">;

export interface DiaGrilla {
  iso: string;
  diaAbrev: string;
  diaNum: number;
}

export type CeldaGrilla =
  | { estado: "libre" }
  | { estado: "reserva" | "bloqueado"; reserva: ReservaConHorario }
  | { estado: "fijo"; turnoFijo: TurnoFijoConHorario; fecha: string };

// admin.html:2205 (uso) / :2157-2159 (definición) — mismo casing título
// ("Dom", "Lun"...) que el legacy, distinto del DIAS_ABREV en mayúsculas de
// lib/datetime.ts (ese es para reservations-public, no para Agenda) y del
// DIAS_SEMANA_ABREV de reservas.logic.ts (tampoco se importa de ahí — ver
// comentario de cabecera). 7 strings cortos, no vale la pena compartirlos.
// Exportado (no solo interno): AgendaDetalleSheet.tsx lo reusa para mostrar
// el día completo de un turno fijo ("Lunes"), sin duplicar el mismo array de
// 7 strings una vez más dentro del propio dominio de Agenda.
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// admin.html:2148-2155 (obtenerLunes) — B7 la necesita para saber qué semana
// pedir/mostrar según `semanaOffset`. `ahora` explícito (no `new Date()`
// interno) para que sea testeable, mismo criterio ya usado en el resto del
// código portado (esPasado, generarProximosDias, etc.). Duplicada a propósito
// en vez de importar el `obtenerLunes` de reservas.logic.ts — ver comentario
// de cabecera (Agenda no depende de Reservas).
export function obtenerLunesOffset(ahora: number, offset: number): Date {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const diaSemana = hoy.getDay();
  const offsetDias = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + offsetDias + offset * 7);
  return lunes;
}

// admin.html:341-347 (formatearBadgeFecha) — B7 la necesita para el campo
// "Día" del sheet de detalle (reserva/bloqueado; el de turno fijo muestra el
// día de la semana completo, no una fecha). Reusa el mismo DIAS_SEMANA de
// arriba en vez de duplicar otro array de 7 strings.
export function formatearBadgeFecha(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`);
  const dia = DIAS_SEMANA[d.getDay()].slice(0, 3).toUpperCase();
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${dia} ${dd}/${mm}`;
}

// P1 — teléfono usable para abrir un wa.me. `crear_reserva` ya exige que
// normalize_phone() resuelva el teléfono a 10 dígitos AR antes de guardar la
// reserva (ver ese RPC), así que en la práctica toda reserva real pasa este
// chequeo; queda como red de seguridad para datos viejos/editados a mano
// (teléfono vacío o con muy pocos dígitos) en vez de asumirlo siempre válido.
// Reusa limpiarTelefonoWa de lib/format.ts (genérico) en vez de reimplementar
// la limpieza — mismo helper que ya usan reservas.logic.ts/TurnosFijosView.
export function telefonoParaWhatsapp(telefono: string | null | undefined): string | null {
  const limpio = limpiarTelefonoWa(telefono ?? "");
  return limpio.length >= 10 ? limpio : null;
}

// P1 — botón "WhatsApp" del detalle de reserva de Agenda. Mensaje propio
// (neutral, sin pedir seña: a diferencia de reservas.logic.ts/construirLinkWhatsapp
// -pensado solo para "próximas sin confirmar"-, este botón aplica a cualquier
// reserva del detalle). Duplica el patrón en vez de importar de
// reservas.logic.ts — ver comentario de cabecera (Agenda no depende de
// Reservas). Nunca abre wa.me sola: devuelve el link para que el botón sea un
// <a href> que el admin clickea, nunca se dispara solo.
export function construirLinkWhatsappReserva(
  reserva: { nombre: string; fecha: string; horaInicio: string; horaFin: string; telefono: string },
  nombreCancha: string,
): string | null {
  const numero = telefonoParaWhatsapp(reserva.telefono);
  if (!numero) return null;
  const texto = encodeURIComponent(
    `Hola ${reserva.nombre}! Te escribo por tu turno del ${formatearBadgeFecha(reserva.fecha)} de ${reserva.horaInicio} a ${reserva.horaFin} en ${nombreCancha}.`,
  );
  return `https://wa.me/${numero}?text=${texto}`;
}

// P1 — mensaje de "cancelar y avisar". Se llama SOLO después de que la
// cancelación real en el backend ya devolvió éxito (ver confirmarCancelarReserva
// en AgendaView.tsx) — nunca antes.
export function construirLinkWhatsappCancelacion(
  reserva: { telefono: string; fecha: string; horaInicio: string },
  nombreCancha: string,
): string | null {
  const numero = telefonoParaWhatsapp(reserva.telefono);
  if (!numero) return null;
  const texto = encodeURIComponent(
    `Hola! Te escribimos de ${nombreCancha} para avisarte que tu turno del ${formatearBadgeFecha(reserva.fecha)} a las ${reserva.horaInicio} fue cancelado.`,
  );
  return `https://wa.me/${numero}?text=${texto}`;
}

// admin.html:671-677 (dentro de cargarSemanaGrilla) — mismo criterio de
// "vigente" (bloqueado || confirmada || creada hace <15min) que ya usa
// reservas.logic.ts, pero acá vía esReservaVigente/recortarHora de
// lib/datetime.ts directamente (genéricas, no reservas.logic.ts) en vez de
// duplicar el filtro/map a mano — ver comentario de cabecera.
export function procesarReservasGrilla(data: Tables<"reservas">[] | null, ahora: number): ReservaConHorario[] {
  const filas = data ?? [];
  return filas
    // `creado` es nullable en el schema pero tiene default now() y en la
    // práctica siempre viene poblado — mismo `?? epoch` defensivo que ya usa
    // reservas.logic.ts (procesarReservas) para no romper el tipado, sin
    // inventar ninguna regla nueva.
    .filter((r) => esReservaVigente({ bloqueado: r.bloqueado, confirmada: r.confirmada, creado: r.creado ?? new Date(0).toISOString() }, { ahora }))
    .map((r) => ({ ...r, horaInicio: recortarHora(r.hora_inicio)!, horaFin: recortarHora(r.hora_fin)! }));
}

// admin.html:2156-2160
export function construirDiasGrilla(lunes: Date): DiaGrilla[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return { iso: formatearISO(d), diaAbrev: DIAS_SEMANA[d.getDay()].slice(0, 3), diaNum: d.getDate() };
  });
}

// admin.html:2161-2162
export function construirFilasGrilla(aperturaMin: number, cierreExt: number): string[] {
  const filas: string[] = [];
  for (let t = aperturaMin; t < cierreExt; t += 30) filas.push(minutosToHora(t));
  return filas;
}

export interface RangoGrillaSemana {
  aperturaMin: number;
  cierreExt: number;
}

// CFG-F2 — reemplaza los 08:00/01:00 hardcodeados de configCancha: la grilla
// es UNA sola fila de horas compartida por los 7 días de la semana visible,
// así que su rango tiene que cubrir el más amplio de esos 7 días reales
// (horarios_semana + fecha especial, resueltos por día vía franja_operativa
// — ver useFranjaSemana.ts), no el de un solo día. Un día más angosto que
// otro simplemente queda con huecos vacíos en esas horas, en vez de recortar
// la grilla entera. `null` si NINGÚN día de la semana está abierto (no hay
// ningún rango real que mostrar) — nunca un fallback a 08:00-01:00.
export function calcularRangoGrillaSemana(
  franjas: ReadonlyArray<{ cerrado: boolean; horaApertura: string | null; horaCierre: string | null }>,
): RangoGrillaSemana | null {
  const abiertas = franjas.filter(
    (f): f is { cerrado: boolean; horaApertura: string; horaCierre: string } =>
      !f.cerrado && f.horaApertura != null && f.horaCierre != null,
  );
  if (abiertas.length === 0) return null;
  const aperturaMin = Math.min(...abiertas.map((f) => horaToMinutos(f.horaApertura)));
  const cierreExt = Math.max(...abiertas.map((f) => calcularCierreExtendido(aperturaMin, horaToMinutos(f.horaCierre))));
  return { aperturaMin, cierreExt };
}

// admin.html:2211 — usa el último día de diasGrilla (no necesariamente [6]:
// diasGrilla siempre tiene 7 elementos en la práctica, pero indexar por length
// es más honesto que hardcodear).
export function etiquetaSemana(diasGrilla: DiaGrilla[]): string {
  const primero = diasGrilla[0];
  const ultimo = diasGrilla[diasGrilla.length - 1];
  const mes = MESES_CORTOS[new Date(`${ultimo.iso}T00:00:00`).getMonth()];
  return `${primero.diaNum} - ${ultimo.diaNum} ${mes}`;
}

// admin.html:2180 — misma condición exacta que ya usa reservas.logic.ts en
// ocurrenciasFijasVirtuales (turno_fijo_id + fecha exacta), pero NO se importa
// de ahí (ver comentario de cabecera): es una línea, duplicarla es más barato
// que crear un módulo compartido para ella.
function estaExceptuado(turnoFijoId: string, fecha: string, excepciones: ExcepcionTurnoFijo[]): boolean {
  return excepciones.some((e) => e.turno_fijo_id === turnoFijoId && e.fecha === fecha);
}

// admin.html:2164-2187 — prioridad estricta: reserva/bloqueado real de esa
// fecha (se corta en el primer match, igual que el legacy: si hay datos
// inconsistentes con reservas superpuestas, gana la primera del array) >
// turno fijo sin excepción para esa fecha > libre.
export function calcularCelda(
  fechaISO: string,
  horaSlot: string,
  reservasSemana: ReservaConHorario[],
  turnosFijos: TurnoFijoConHorario[],
  excepciones: ExcepcionTurnoFijo[],
  aperturaMin: number,
): CeldaGrilla {
  let slotExt = horaToMinutos(horaSlot);
  if (slotExt < aperturaMin) slotExt += 1440;

  const reservasDia = reservasSemana.filter((r) => r.fecha === fechaISO);
  for (const r of reservasDia) {
    const { ini, fin } = extenderReserva(r.horaInicio, r.horaFin, aperturaMin);
    if (slotExt >= ini && slotExt < fin) {
      return r.bloqueado ? { estado: "bloqueado", reserva: r } : { estado: "reserva", reserva: r };
    }
  }

  const diaSemana = new Date(`${fechaISO}T00:00:00`).getDay();
  for (const t of turnosFijos) {
    if (t.dia_semana !== diaSemana) continue;
    if (estaExceptuado(t.id, fechaISO, excepciones)) continue;
    // FINAL-F3 (M5) — una ocurrencia que empieza antes de que el turno fijo
    // existiera no es una ocurrencia (ni hacia atrás en semanas anteriores ni
    // el mismo día con horario ya empezado). `aperturaMin` es la de ESTA
    // columna/fecha (la real de ese día), la misma con la que se ubica la
    // celda, así que el cruce de medianoche se resuelve igual que en el
    // servidor. Se decide por la ocurrencia completa (no por la fila de la
    // grilla), así que todas las filas del bloque coinciden.
    if (!ocurrenciaEsPosteriorACreacion(fechaISO, t.horaInicio, aperturaMin, t.creado)) continue;
    const { ini, fin } = extenderReserva(t.horaInicio, t.horaFin, aperturaMin);
    if (slotExt >= ini && slotExt < fin) {
      return { estado: "fijo", turnoFijo: t, fecha: fechaISO };
    }
  }

  return { estado: "libre" };
}

// Identidad lógica de una celda no-libre: la MISMA reserva real (por id) o el
// MISMO turno fijo (por id) es el MISMO bloque, sin importar el texto que se
// vaya a mostrar. `null` para "libre" (nunca es el mismo bloque que nada,
// tampoco que otra celda libre — eso ya lo resuelve el early-return de
// esFinDeBloque). Prefijada por `estado` (no solo por tipo de entidad): una
// reserva que pasa de "reserva" a "bloqueado" — o viceversa — sigue siendo la
// misma fila en la tabla, pero admin.html:2253-2254 la trata como fin de
// bloque igual (el color de la celda cambia), así que el cambio de estado
// tiene que romper la identidad aunque el id de la reserva sea el mismo.
function identidadCelda(celda: CeldaGrilla): string | null {
  if (celda.estado === "libre") return null;
  if (celda.estado === "fijo") return `${celda.estado}:${celda.turnoFijo.id}`;
  return `${celda.estado}:${celda.reserva.id}`;
}

// admin.html:2253-2254 (esUltimoBloque) — `celdaSiguiente` es `null` cuando
// `celda` es la última fila visible de la grilla (admin.html pasa
// {estado:"libre"} en ese caso vía el `proximaHora ? ... : {estado:"libre"}`
// de la fila anterior; acá se modela como `null` para que el llamador no
// tenga que fabricar una celda libre artificial).
export function esFinDeBloque(celda: CeldaGrilla, celdaSiguiente: CeldaGrilla | null): boolean {
  if (celda.estado === "libre") return false;
  return identidadCelda(celda) !== identidadCelda(celdaSiguiente ?? { estado: "libre" });
}
