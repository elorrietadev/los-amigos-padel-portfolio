// Funciones de fecha/horario extraídas de admin.html (líneas 208-267 al momento de
// la extracción), preservando el comportamiento exacto. Los únicos cambios respecto
// al legacy son de tipado y los dos ajustes explícitamente aprobados en finReservaDate
// y esPasado (ver comentarios puntuales abajo) — nada de lógica se reescribió.

export interface ReservaHorario {
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // HH:MM (ya recortado, como hace recortarHora sobre hora_inicio/hora_fin)
  horaFin: string; // HH:MM
}

export interface ReservaVigencia {
  bloqueado: boolean;
  confirmada: boolean;
  creado: string; // timestamptz ISO
}

export function recortarHora(h: string | null | undefined): string | null | undefined {
  return h ? h.slice(0, 5) : h;
}

export function horaToMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minutosToHora(min: number): string {
  const mm = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(mm / 60).toString().padStart(2, "0")}:${(mm % 60).toString().padStart(2, "0")}`;
}

export function extenderReserva(
  horaInicioStr: string,
  horaFinStr: string,
  aperturaMin: number,
): { ini: number; fin: number } {
  let ini = horaToMinutos(horaInicioStr);
  if (ini < aperturaMin) ini += 1440;
  let finBase = horaToMinutos(horaFinStr);
  if (finBase <= horaToMinutos(horaInicioStr)) finBase += 1440;
  const fin = finBase + (ini - horaToMinutos(horaInicioStr));
  return { ini, fin };
}

// Movida acá desde reservations-public/reservations.logic.ts (B6): semántica
// genérica (dos números, sin nada de dominio), usada igual por Agenda
// (admin.html:2144-2146, cierreExt de la grilla) y por reservations-public
// (index.html:222-224). Mismos call sites actualizados para importarla de acá
// en vez de reservations.logic.ts — no queda re-exportada desde ahí.
export function calcularCierreExtendido(aperturaMin: number, cierreMin: number): number {
  let cierreExt = cierreMin;
  if (cierreExt <= aperturaMin) cierreExt += 1440;
  return cierreExt;
}

// admin.html:222-229 (generarOpcionesHorario) — todas las horas en punto/media
// hora entre apertura y cierre (inclusive en ambos extremos), reusando
// calcularCierreExtendido para el mismo ajuste de cruce de medianoche que ya
// hace el resto del código (en vez de reimplementar `if (cierre <= apertura)
// cierre += 1440` acá). Genérica (no específica de Turnos Fijos ni de
// Bloqueos): la van a usar los dos formularios de C2/C4 con offsets mínimos
// distintos, igual que ya hace el legacy.
export function generarOpcionesHorario(horaApertura: string, horaCierre: string): string[] {
  const aperturaMin = horaToMinutos(horaApertura);
  const cierreExt = calcularCierreExtendido(aperturaMin, horaToMinutos(horaCierre));
  const out: string[] = [];
  for (let t = aperturaMin; t <= cierreExt; t += 30) out.push(minutosToHora(t));
  return out;
}

// admin.html:230-241 (opcionesFinDesde) — opciones de hora fin disponibles a
// partir de `horaInicio` + `minOffsetMin` (60 para Turnos Fijos, 30 para
// Bloqueos — ver admin.html:2504 y :2593), hasta el cierre extendido. Vacío si
// no hay `horaInicio` todavía, igual que el legacy.
//
// C5.1 — `maxOffsetMin` opcional (nuevo, sin tocar ningún call site
// existente: por defecto sigue sin techo, igual que siempre) para que
// TurnosFijosView pueda acotar las opciones al máximo real de
// configuracion_cancha, además del mínimo. Se calcula ACÁ, sobre `t` en
// minutos extendidos (antes de formatear con minutosToHora), en vez de que
// el llamador filtre el array ya formateado — reparsear "HH:MM" con
// horaToMinutos pierde la extensión de medianoche que este mismo bucle ya
// resuelve.
export function opcionesFinDesde(
  horaInicio: string,
  horaApertura: string,
  horaCierre: string,
  minOffsetMin: number = 60,
  maxOffsetMin?: number,
): string[] {
  if (!horaInicio) return [];
  const aperturaMin = horaToMinutos(horaApertura);
  const cierreExt = calcularCierreExtendido(aperturaMin, horaToMinutos(horaCierre));
  let inicioExt = horaToMinutos(horaInicio);
  if (inicioExt < aperturaMin) inicioExt += 1440;
  const limite = maxOffsetMin != null ? Math.min(cierreExt, inicioExt + maxOffsetMin) : cierreExt;
  const out: string[] = [];
  for (let t = inicioExt + minOffsetMin; t <= limite; t += 30) out.push(minutosToHora(t));
  return out;
}

export function formatearISO(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function hoyISO(): string {
  return formatearISO(new Date());
}

// P2 (venta atada a reserva) — instante real de inicio, mismo criterio de
// cruce de medianoche que ya usaba finReservaDate en su primer tramo (una
// reserva de madrugada, horaInicio antes de la apertura, pertenece al día
// calendario SIGUIENTE al de `fecha`): factorizado acá para que finReservaDate
// lo reuse en vez de duplicar ese cálculo, y para tener un instante de inicio
// propio (necesario para decidir "en juego", que finReservaDate solo no cubre).
//
// `aperturaMin` acepta `null` — mismo criterio que los overloads puros de
// `instante_inicio_real`/`instante_fin_real` en Postgres (C4.1, ver
// c4_1_resolver_instantes_segun_horario_operativo.sql): si no se conoce la
// apertura vigente (columna `hora_apertura_vigente` de la fila, día marcado
// cerrado, o dato viejo sin resolver), NO se aplica ningún corrimiento de día
// — degrada seguro, sin inventar un valor por defecto.
export function inicioReservaDate(r: ReservaHorario, aperturaMin: number | null): Date {
  const diaInicio = new Date(`${r.fecha}T00:00:00`);
  if (aperturaMin != null && horaToMinutos(r.horaInicio) < aperturaMin) diaInicio.setDate(diaInicio.getDate() + 1);
  const [ih, im] = r.horaInicio.split(":").map(Number);
  const inicio = new Date(diaInicio);
  inicio.setHours(ih, im, 0, 0);
  return inicio;
}

// FINAL-F3 (M5) — regla ÚNICA, compartida por todo lo que proyecta ocurrencias
// virtuales de un turno fijo (Agenda, Reservas, Turnos fijos, choques del alta):
//
//   instante_inicio_real(ocurrencia) >= turnos_fijos.creado
//
// Es el mismo predicado que aplican en el servidor el núcleo de materialización
// (materializar_turnos_fijos_jugados_core) y obtener_turnos_fijos_titular_publico.
// Se compara por INSTANTE real, nunca por fecha: incluye el corrimiento de día
// de las horas de madrugada (horaInicio < apertura => día calendario siguiente)
// con la apertura vigente de ESA fecha, que pasa el llamador (`null` = no se
// conoce: no se corre el día, mismo degradado seguro que inicioReservaDate).
//
// `creado` ausente/nulo/ilegible => true (sin cota inferior): mismo criterio que
// el servidor para una fila sin `creado`, y no oculta ocurrencias por datos
// incompletos.
export function ocurrenciaEsPosteriorACreacion(
  fecha: string,
  horaInicio: string,
  aperturaMin: number | null,
  creado: string | null | undefined,
): boolean {
  if (!creado) return true;
  const creadoMs = new Date(creado).getTime();
  if (Number.isNaN(creadoMs)) return true;
  return inicioReservaDate({ fecha, horaInicio, horaFin: horaInicio }, aperturaMin).getTime() >= creadoMs;
}

// Cambio aprobado: aperturaMin llega como parámetro explícito en vez de leerse de
// una global (config.horaApertura / window.CONFIG_CANCHA) — misma lógica, función pura.
// Acepta `null` (ver inicioReservaDate arriba) — el segundo corrimiento (cruce
// de medianoche DENTRO de la reserva, horaFin <= horaInicio) es independiente
// de la apertura y sigue aplicando igual, con o sin ella.
export function finReservaDate(r: ReservaHorario, aperturaMin: number | null): Date {
  const fin = new Date(inicioReservaDate(r, aperturaMin));
  const [fh, fm] = r.horaFin.split(":").map(Number);
  fin.setHours(fh, fm, 0, 0);
  if (horaToMinutos(r.horaFin) <= horaToMinutos(r.horaInicio)) fin.setDate(fin.getDate() + 1);
  return fin;
}

// Cambio aprobado: "ahora" opcional (default Date.now(), igual que el legacy) para
// poder testear con una fecha fija en vez de depender del reloj real.
export function esPasado(r: ReservaHorario, aperturaMin: number | null, ahora: number = Date.now()): boolean {
  return finReservaDate(r, aperturaMin).getTime() <= ahora;
}

// Deduplica el filtro de "reserva vigente" copiado 6 veces en admin.html:
// x.bloqueado || x.confirmada || (AHORA - new Date(x.creado).getTime()) < MIN_VENCIMIENTO
export function esReservaVigente(
  r: ReservaVigencia,
  opts: { ahora?: number; minVencimientoMs?: number } = {},
): boolean {
  const ahora = opts.ahora ?? Date.now();
  const minVencimientoMs = opts.minVencimientoMs ?? 15 * 60 * 1000;
  return r.bloqueado || r.confirmada || ahora - new Date(r.creado).getTime() < minVencimientoMs;
}

const DIAS_ABREV = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MESES_ABREV = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

export interface DiaDisponible {
  iso: string;
  diaSemana: string;
  diaNum: number;
  mes: string;
}

// index.html:210-220. Cambio aprobado: `base` inyectable (default new Date(),
// igual comportamiento que el legacy) para poder testear sin depender del
// reloj real — mismo patrón ya usado en horasInicioDisponibles.
export function generarProximosDias(cantidad: number, base: Date = new Date()): DiaDisponible[] {
  const hoy = new Date(base);
  hoy.setHours(0, 0, 0, 0);
  const out: DiaDisponible[] = [];
  for (let i = 0; i < cantidad; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    out.push({
      iso: formatearISO(d),
      diaSemana: DIAS_ABREV[d.getDay()],
      diaNum: d.getDate(),
      mes: MESES_ABREV[d.getMonth()],
    });
  }
  return out;
}
