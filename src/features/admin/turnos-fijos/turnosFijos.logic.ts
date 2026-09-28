// Lógica pura de Turnos Fijos (C1) — puerto de admin.html:1962-1966 (solape
// entre turnos fijos, dentro de agregarTurnoFijo), 1912-1927
// (buscarChoquesConReservas) y 1987-1994 (cálculo de fechaInicioReal, dentro
// de la misma agregarTurnoFijo). Sin fetch/hooks/UI/mutaciones.
//
// Turnos Fijos es su propio dominio (tendrá API/hooks/UI propios en C2), no
// una extensión de Agenda — por eso vive en su propia carpeta y no dentro de
// `agenda/`. Solo importa `TurnoFijoConHorario` de agenda.logic.ts porque hoy
// es literalmente el mismo shape que ya existe ahí (leído por
// useTurnosFijos/AgendaView) — no se duplica un tipo idéntico solo por
// prolijidad arquitectónica todavía. El resto de las funciones de acá son
// genéricas sobre el shape mínimo que necesitan, sin importar tipos de Agenda
// ni de Reservas (esos datasets reales viven en reservas.types.ts, que este
// archivo no conoce a propósito).

import { extenderReserva, formatearISO, ocurrenciaEsPosteriorACreacion } from "../../../lib/datetime";
import type { TurnoFijoConHorario } from "../agenda/agenda.logic";

// admin.html:1962-1966 (dentro de agregarTurnoFijo) — mismo día de semana +
// rangos extendidos (para turnos que cruzan medianoche, vía extenderReserva)
// que se cruzan. Rangos adyacentes (el fin de uno == el inicio del otro) NO
// cuentan como solape, igual que el legacy (comparación estricta `<` en
// ambos lados).
export function haySolapeTurnoFijo(
  diaSemana: number,
  horaInicio: string,
  horaFin: string,
  turnosFijos: TurnoFijoConHorario[],
  aperturaMin: number,
): boolean {
  const { ini: nuevoIni, fin: nuevoFin } = extenderReserva(horaInicio, horaFin, aperturaMin);
  return turnosFijos.some((t) => {
    if (t.dia_semana !== diaSemana) return false;
    const { ini: tIni, fin: tFin } = extenderReserva(t.horaInicio, t.horaFin, aperturaMin);
    return nuevoIni < tFin && tIni < nuevoFin;
  });
}

// TF-R3.1 — alta de un titular con VARIOS horarios en un solo modal: antes de
// mandar nada al servidor, se detectan acá los horarios repetidos/superpuestos
// DENTRO de la lista que la persona está cargando (el servidor es la
// autoridad real — crear_titular_turno_fijo inserta un horario por vez dentro
// de la misma transacción, así que el trigger turnos_fijos_check_overlap ya
// existente también los detectaría entre sí — esto es solo feedback
// inmediato en el formulario, mismo criterio que haySolapeTurnoFijo de abajo
// contra los turnos ya existentes).
//
// Exacto (mismo día+horaInicio+horaFin) — chequeo aparte de haySolapeEntreHorarios
// porque no necesita resolver la apertura del día (más barato, y el mensaje
// que arma TurnosFijosView es más específico: "horarios repetidos" vs
// "horarios superpuestos").
export function hayHorariosDuplicados(
  horarios: { diaSemana: number; horaInicio: string; horaFin: string }[],
): boolean {
  const claves = horarios.map((h) => `${h.diaSemana}|${h.horaInicio}|${h.horaFin}`);
  return new Set(claves).size !== claves.length;
}

// Solape parcial (no necesariamente idéntico) entre dos horarios de la
// misma lista — mismo criterio de extenderReserva que haySolapeTurnoFijo
// (rangos adyacentes no cuentan como solape), pero comparando la lista
// contra sí misma en vez de contra turnosFijos ya cargados de la base.
// `aperturaMinPorDia` resuelve la apertura real de CADA día (horarios_semana
// puede diferir entre días) — un solape solo se evalúa entre horarios del
// mismo día, así que siempre se usa la apertura de ESE día para ambos lados.
// Si esa función devuelve null (día cerrado), esos horarios se saltan acá —
// ese caso ya lo cubre por separado la validación de "horario operativo".
export function haySolapeEntreHorarios(
  horarios: { diaSemana: number; horaInicio: string; horaFin: string }[],
  aperturaMinPorDia: (diaSemana: number) => number | null,
): boolean {
  for (let i = 0; i < horarios.length; i++) {
    const a = horarios[i];
    const aperturaA = aperturaMinPorDia(a.diaSemana);
    if (aperturaA == null) continue;
    const { ini: aIni, fin: aFin } = extenderReserva(a.horaInicio, a.horaFin, aperturaA);
    for (let j = i + 1; j < horarios.length; j++) {
      const b = horarios[j];
      if (b.diaSemana !== a.diaSemana) continue;
      const { ini: bIni, fin: bFin } = extenderReserva(b.horaInicio, b.horaFin, aperturaA);
      if (aIni < bFin && bIni < aFin) return true;
    }
  }
  return false;
}

export interface ChoqueTurnoFijo<R> {
  fecha: string;
  reserva: R;
}

// admin.html:1912-1927 (buscarChoquesConReservas) — recorre `horizonteDias`
// días desde `ahora` buscando, en cada fecha del mismo día de semana, reservas
// cuyo horario se cruce con el propuesto para el turno fijo. Genérico sobre
// `R`: el shape real de "reserva próxima" vive en reservas.types.ts, que este
// archivo no importa a propósito (ver comentario de cabecera) — alcanza con
// fecha/horaInicio/horaFin para detectar el cruce, y el resto del objeto
// original se devuelve intacto en `reserva` para que el llamador arme su
// propio mensaje (ej. distinguir "horario bloqueado" de una reserva real, como
// hace admin.html:1983 con `r.bloqueado`).
export function buscarChoquesTurnoFijoConReservas<R extends { fecha: string; horaInicio: string; horaFin: string }>(
  diaSemana: number,
  horaInicio: string,
  horaFin: string,
  reservas: R[],
  aperturaMin: number,
  ahora: number,
  horizonteDias: number = 90,
): ChoqueTurnoFijo<R>[] {
  const { ini: nIni, fin: nFin } = extenderReserva(horaInicio, horaFin, aperturaMin);
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  // FINAL-F3 (M5) — el turno fijo nuevo va a tener `creado` ≈ ahora, así que
  // una ocurrencia que ya empezó no va a existir: no puede "chocar" con nada
  // (ni hay que excluir esa fecha del turno). Misma regla que el resto.
  const creadoEstimado = new Date(ahora).toISOString();
  const choques: ChoqueTurnoFijo<R>[] = [];
  for (let i = 0; i < horizonteDias; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    if (d.getDay() !== diaSemana) continue;
    const fechaISO = formatearISO(d);
    if (!ocurrenciaEsPosteriorACreacion(fechaISO, horaInicio, aperturaMin, creadoEstimado)) continue;
    for (const r of reservas) {
      if (r.fecha !== fechaISO) continue;
      const { ini: rIni, fin: rFin } = extenderReserva(r.horaInicio, r.horaFin, aperturaMin);
      if (nIni < rFin && rIni < nFin) choques.push({ fecha: fechaISO, reserva: r });
    }
  }
  return choques;
}

// admin.html:1987-1994 (dentro de agregarTurnoFijo, cálculo de
// fechaInicioReal) — primera fecha futura (incluyendo hoy) de `diaSemana` que
// NO esté en `fechasExcluidas`. `null` si las `horizonteDias` fechas de ese
// día de semana están todas excluidas (mismo caso límite que ya cubre el
// mensaje del legacy: "No queda ninguna fecha libre para este turno en los
// próximos 90 días"). No existía un helper de calendario equivalente en el
// proyecto (se revisó baja.logic.ts, reservas.logic.ts y agenda.logic.ts:
// ninguno resuelve "próxima fecha de un día de semana que no esté en una
// lista de exclusión") — puerto nuevo, con `ahora` explícito en vez de `new
// Date()` interno, mismo criterio que el resto del código ya migrado.
//
// FINAL-F3 (M5) — con `horario` (hora de inicio + apertura real de ese día), la
// ocurrencia de HOY solo cuenta si todavía no empezó: un turno fijo creado hoy
// a las 20:00 para las 18:00 arranca la semana que viene, no hoy. Sin `horario`
// se conserva el comportamiento original (compatibilidad de firma).
export function calcularFechaInicioReal(
  diaSemana: number,
  fechasExcluidas: string[],
  ahora: number,
  horizonteDias: number = 90,
  horario?: { horaInicio: string; aperturaMin: number | null },
): string | null {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const creadoEstimado = new Date(ahora).toISOString();
  for (let i = 0; i < horizonteDias; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    if (d.getDay() !== diaSemana) continue;
    const iso = formatearISO(d);
    if (horario && !ocurrenciaEsPosteriorACreacion(iso, horario.horaInicio, horario.aperturaMin, creadoEstimado)) continue;
    if (!fechasExcluidas.includes(iso)) return iso;
  }
  return null;
}

// TF-R3 — admin.html no tenía equivalente (la lista plana de acá nunca
// existió antes): agrupa la lista plana de turnos_fijos (uno por horario,
// con nombre/telefono/titular_id ya aplanados por useTurnosFijos) por
// titular_id, para que TurnosFijosView pinte una tarjeta por titular con
// todos sus horarios debajo, en vez de una fila por horario. Pura — sin
// fetch nuevo, opera sobre el mismo array que ya carga useTurnosFijos.
export interface TitularAgrupado {
  titularId: string;
  nombre: string;
  telefono: string;
  horarios: TurnoFijoConHorario[];
}

export function agruparPorTitular(turnosFijos: TurnoFijoConHorario[]): TitularAgrupado[] {
  const grupos = new Map<string, TitularAgrupado>();
  for (const t of turnosFijos) {
    let grupo = grupos.get(t.titular_id);
    if (!grupo) {
      grupo = { titularId: t.titular_id, nombre: t.nombre, telefono: t.telefono, horarios: [] };
      grupos.set(t.titular_id, grupo);
    }
    grupo.horarios.push(t);
  }
  for (const grupo of grupos.values()) {
    grupo.horarios.sort((a, b) => a.dia_semana - b.dia_semana || a.horaInicio.localeCompare(b.horaInicio));
  }
  return [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}
