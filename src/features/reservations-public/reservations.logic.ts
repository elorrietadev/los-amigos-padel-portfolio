// Lógica PURA de disponibilidad extraída de index.html (líneas 277-407 al momento
// de la extracción). Sin useEffect, sin caché, sin refs, sin timers, sin llamadas
// a Supabase — todo recibe datos/configuración por parámetro y devuelve resultados.
// Nada de esto se usa todavía desde ningún componente/hook.

import { extenderReserva, formatearISO, horaToMinutos, minutosToHora, recortarHora } from "../../lib/datetime";
import type {
  ConfiguracionCanchaPublicaRow,
  ConfiguracionReservas,
  ExcepcionTurnoFijo,
  FranjaOperativa,
  FranjaOperativaRow,
  HorarioSemanaDia,
  HorarioSemanaRow,
  OcupacionDelDia,
  ReservaPublica,
  ReservaProcesada,
  TurnoFijoOcurrencia,
  TurnoFijoProcesado,
  TurnoFijoPublico,
} from "./reservations.types";

// Regla EXACTA de index.html:279 — `const MIN_VENCIMIENTO = 15 * 60 * 1000;`.
// A propósito NO incluye `bloqueado` (a diferencia de esReservaVigente() en
// lib/datetime.ts, que sí lo tiene): el index público nunca evaluó ese campo.
export function esReservaPublicaVigente(
  r: { confirmada: boolean; creado: string },
  ahora: number = Date.now(),
  minVencimientoMs: number = 15 * 60 * 1000,
): boolean {
  return r.confirmada || ahora - new Date(r.creado).getTime() < minVencimientoMs;
}

// Único punto donde se cruza nullable -> no-nullable (ver comentario en
// reservations.types.ts). El resto del archivo ya no vuelve a castear nada.
export function procesarReservasPublicas(
  data: ReservaPublica[] | null,
  ahora: number = Date.now(),
  minVencimientoMs: number = 15 * 60 * 1000,
): ReservaProcesada[] {
  return (data ?? [])
    .filter((r) =>
      esReservaPublicaVigente(
        r as unknown as { confirmada: boolean; creado: string },
        ahora,
        minVencimientoMs,
      ),
    )
    .map((r) => ({
      id: r.id as string,
      fecha: r.fecha as string,
      horaInicio: recortarHora(r.hora_inicio) as string,
      horaFin: recortarHora(r.hora_fin) as string,
    }));
}

// C4 — normaliza la fila cruda de franja_operativa (recortarHora sobre las
// horas, igual que el resto de este archivo). Devuelve null si el RPC no
// trajo fila (no debería pasar nunca: siempre hay un horarios_semana por
// día) — quien llame decide cómo tratar ese caso (loading/error), no acá.
export function procesarFranjaOperativa(data: FranjaOperativaRow[] | null): FranjaOperativa | null {
  const fila = data?.[0];
  if (!fila) return null;
  return {
    cerrado: fila.cerrado,
    horaApertura: recortarHora(fila.hora_apertura) ?? null,
    horaCierre: recortarHora(fila.hora_cierre) ?? null,
  };
}

// PUBLIC-R5 — normaliza las filas crudas de horarios_semana_publica (0 a 7
// filas, según lo que haya devuelto el fetch). Filtra cualquier fila con
// dia_semana/abierto null (la vista los marca nullable porque es una vista,
// no la tabla base con sus NOT NULL — nunca debería pasar en la práctica) en
// vez de asumir un valor por defecto que podría mentir sobre si ese día está
// abierto o no.
export function procesarHorariosSemana(data: HorarioSemanaRow[] | null): HorarioSemanaDia[] {
  if (!data) return [];
  const out: HorarioSemanaDia[] = [];
  for (const fila of data) {
    if (fila.dia_semana == null || fila.abierto == null) continue;
    out.push({
      diaSemana: fila.dia_semana,
      abierto: fila.abierto,
      horaApertura: recortarHora(fila.hora_apertura) ?? null,
      horaCierre: recortarHora(fila.hora_cierre) ?? null,
    });
  }
  return out;
}

// C5/C6 — normaliza la fila cruda de configuracion_cancha_publica a camelCase.
// null si el fetch falló o no trajo fila, o si algún campo vino null (no
// debería pasar: es un singleton siempre con exactamente 1 fila, todas sus
// columnas NOT NULL en la tabla base) — quien llame decide cómo tratar ese
// caso, nunca se completa con un default silencioso acá.
export function procesarConfiguracionReservas(data: ConfiguracionCanchaPublicaRow | null): ConfiguracionReservas | null {
  if (
    !data ||
    data.duracion_minima_minutos == null ||
    data.duracion_maxima_minutos == null ||
    data.anticipacion_maxima_dias == null ||
    data.anticipacion_minima_minutos == null ||
    data.limite_reservas_activas_telefono == null
  ) {
    return null;
  }
  return {
    duracionMinima: data.duracion_minima_minutos,
    duracionMaxima: data.duracion_maxima_minutos,
    anticipacionMaximaDias: data.anticipacion_maxima_dias,
    anticipacionMinimaMinutos: data.anticipacion_minima_minutos,
    limiteReservasActivasTelefono: data.limite_reservas_activas_telefono,
  };
}

// Mismo cruce nullable -> no-nullable, para turnos_fijos_publicos.
export function procesarTurnosFijos(data: TurnoFijoPublico[] | null): TurnoFijoProcesado[] {
  return (data ?? []).map((t) => ({
    id: t.id as string,
    dia_semana: t.dia_semana as number,
    horaInicio: recortarHora(t.hora_inicio) as string,
    horaFin: recortarHora(t.hora_fin) as string,
  }));
}

// index.html:350-354
export function ocurrenciasTurnoFijoDelDia(
  fecha: string,
  turnosFijos: TurnoFijoProcesado[],
  excepciones: ExcepcionTurnoFijo[],
): TurnoFijoOcurrencia[] {
  const diaSemanaFecha = new Date(`${fecha}T00:00:00`).getDay();
  return turnosFijos
    .filter(
      (t) =>
        t.dia_semana === diaSemanaFecha &&
        !excepciones.some((e) => e.turno_fijo_id === t.id && e.fecha === fecha),
    )
    .map((t) => ({ ...t, fecha }));
}

// index.html:349 (reservasNormales) + 355 (reservasDelDia)
export function reservasDelDia(
  fecha: string,
  reservas: ReservaProcesada[],
  turnosFijos: TurnoFijoProcesado[],
  excepciones: ExcepcionTurnoFijo[],
): OcupacionDelDia[] {
  const reservasNormales = reservas.filter((r) => r.fecha === fecha);
  return [...reservasNormales, ...ocurrenciasTurnoFijoDelDia(fecha, turnosFijos, excepciones)];
}

// index.html:361-367 — regla EXACTA del legacy para "cancha abierta ahora",
// incluido el ajuste de madrugada (`m < aperturaMin` empuja al día extendido,
// igual que hace extenderReserva con los horarios de las reservas). `cierreExt`
// ya viene resuelto por calcularCierreExtendido — esta función no repite esa
// cuenta. horaActualMin explícito (no Date) para que sea 100% determinística.
export function estaAbierta(horaActualMin: number, aperturaMin: number, cierreExt: number): boolean {
  let m = horaActualMin;
  if (m < aperturaMin) m += 1440;
  return m >= aperturaMin && m < cierreExt;
}

// index.html:369-376
export function haySolape(
  fecha: string,
  inicio: string,
  fin: string,
  ocupacion: OcupacionDelDia[],
  aperturaMin: number,
): boolean {
  const { ini: nuevoIni, fin: nuevoFin } = extenderReserva(inicio, fin, aperturaMin);
  return ocupacion.some((r) => {
    if (r.fecha !== fecha) return false;
    const { ini: ri, fin: rf } = extenderReserva(r.horaInicio, r.horaFin, aperturaMin);
    return nuevoIni < rf && ri < nuevoFin;
  });
}

// index.html:378-391. aperturaMin/cierreExt/duracionMinima explícitos (antes
// closures); `ahora` inyectable — antes se leía dos veces (`new Date()` para
// ahoraMin y otra vez adentro de hoyISO() para esHoy). Se unifica en una sola
// lectura para que la función sea determinística, sin cambiar el comportamiento
// observable normal (en producción ambas lecturas ocurren a milisegundos de
// diferencia igual).
//
// C6 — `anticipacionMinimaMinutos` (nuevo, default 0: mismo comportamiento
// que antes de C6) empuja el corte de "ya pasó" de hoy hacia adelante, solo
// para PRESENTACIÓN/UX (qué horarios se ofrecen) — usa la hora del
// NAVEGADOR, igual que `ahoraMin` ya hacía antes de C6, así que hereda la
// misma limitación de siempre (no es la fuente de verdad). La autoridad real
// es crear_reserva (ANTICIPACION_MINIMA_NO_CUMPLIDA), que compara contra el
// instante real del servidor.
export function horasInicioDisponibles(
  fecha: string,
  ocupacion: OcupacionDelDia[],
  aperturaMin: number,
  cierreExt: number,
  duracionMinima: number,
  ahora: Date = new Date(),
  anticipacionMinimaMinutos: number = 0,
): string[] {
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const esHoy = fecha === formatearISO(ahora);
  const corteMin = ahoraMin + anticipacionMinimaMinutos;

  const candidatos: string[] = [];
  for (let t = aperturaMin; t + duracionMinima <= cierreExt; t += 30) {
    if (esHoy && t < corteMin) continue;
    const inicio = minutosToHora(t);
    const fin = minutosToHora(t + duracionMinima);
    if (!haySolape(fecha, inicio, fin, ocupacion, aperturaMin)) candidatos.push(inicio);
  }
  return candidatos;
}

// index.html:393-407
export function horasFinDisponibles(
  inicioElegido: string,
  ocupacion: OcupacionDelDia[],
  aperturaMin: number,
  cierreExt: number,
  duracionMinima: number,
  duracionMaxima: number,
): string[] {
  if (!inicioElegido) return [];
  let inicioExt = horaToMinutos(inicioElegido);
  if (inicioExt < aperturaMin) inicioExt += 1440;
  const proximaReservaExt = ocupacion
    .map((r) => extenderReserva(r.horaInicio, r.horaFin, aperturaMin).ini)
    .filter((min) => min > inicioExt)
    .sort((a, b) => a - b)[0];
  const limiteCierre = proximaReservaExt !== undefined ? Math.min(proximaReservaExt, cierreExt) : cierreExt;
  const limite = Math.min(limiteCierre, inicioExt + duracionMaxima);
  const candidatos: string[] = [];
  for (let t = inicioExt + duracionMinima; t <= limite; t += 30) candidatos.push(minutosToHora(t));
  return candidatos;
}
