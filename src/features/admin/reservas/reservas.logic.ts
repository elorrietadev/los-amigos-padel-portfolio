// Lógica pura de reservas del admin, extraída de admin.html real (líneas citadas
// en cada función). Reutiliza lib/datetime.ts y lib/format.ts donde la semántica
// coincide exacto (recortarHora, horaToMinutos, formatearISO, hoyISO,
// esReservaVigente, esPasado) — no se duplicó ninguna de esas. Ver reporte de
// sesión para el detalle de qué se comparó y por qué el resto sí se escribió acá.
//
// Todas las funciones que dependen del reloj reciben `ahora` (epoch ms) como
// parámetro explícito — ninguna lee `new Date()`/`Date.now()` internamente —
// para ser 100% determinísticas en tests.

import {
  esPasado,
  esReservaVigente,
  formatearISO,
  horaToMinutos,
  ocurrenciaEsPosteriorACreacion,
  recortarHora,
} from "../../../lib/datetime";
import { limpiarTelefonoWa } from "../../../lib/format";
import type {
  ExcepcionTurnoFijoRow,
  FiltrosReservas,
  ItemListaProximas,
  ModoPago,
  EstadoInicialPagoModal,
  OcupacionHoy,
  OrdenJugadas,
  ResultadoProcesarReservas,
  ReservaProcesada,
  ReservaRow,
  ReservaVirtual,
  SplitPago,
  TurnoFijoConHorario,
} from "./reservas.types";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// CFG-F2 — apertura vigente AL MOMENTO de cada reserva real (columna
// hora_apertura_vigente, poblada por trigger desde C4.1), nunca un
// aperturaMin global de "ahora": si el horario configurado cambia después de
// jugado un turno, reinterpretarlo con el horario de HOY correría de día una
// reserva vieja que en su momento no cruzaba medianoche (o viceversa). Mismo
// criterio que ya usa ventas.logic.ts (aperturaMinDe) — duplicado acá porque
// Reservas no depende de Ventas (ver comentario de cabecera). `null` (día
// cerrado en su momento, o fila vieja sin resolver) se propaga tal cual.
export function aperturaVigenteMin(r: { hora_apertura_vigente: string | null }): number | null {
  return r.hora_apertura_vigente != null ? horaToMinutos(r.hora_apertura_vigente) : null;
}

// Mismos 3 caracteres que el DIAS_ABREV interno (no exportado) de lib/datetime.ts
// — no se puede importar sin tocar ese archivo, así que se repite el array acá
// (son 7 strings, no lógica).
const DIAS_SEMANA_ABREV = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

// --- Vigencia / procesamiento -----------------------------------------------

// Commercial validity and accounting retention are separate. Only vigentes
// can occupy the court; admin lists/accounting use visibles. F4 owns cleanup.
export function tieneMovimientoContable(r: ReservaRow): boolean {
  return Number(r.pago_efectivo) > 0 || Number(r.pago_transferencia) > 0 || (r.ventas?.some((v) => v.count > 0) ?? false);
}

export function ocupaCancha(r: ReservaRow, ahora: number): boolean {
  return esReservaVigente({ ...r, creado: r.creado ?? new Date(0).toISOString() }, { ahora });
}

export function procesarReservas(data: ReservaRow[] | null, ahora: number): ResultadoProcesarReservas {
  const filas = data ?? [];
  const vigentes: ReservaProcesada[] = [];
  const vencidas: ReservaRow[] = [];
  const conservadas: ReservaProcesada[] = [];
  const visibles: ReservaProcesada[] = [];
  for (const fila of filas) {
    // `creado` es nullable en el schema pero tiene default now() y en la práctica
    // siempre viene poblado. El `?? epoch` solo evita romper el tipado ante ese
    // caso extremo, reproduciendo el mismo resultado práctico que el legacy
    // (new Date(null) -> Invalid Date -> diferencia NaN -> nunca "reciente"),
    // sin inventar ninguna regla nueva.
    const vigencia = {
      bloqueado: fila.bloqueado,
      confirmada: fila.confirmada,
      creado: fila.creado ?? new Date(0).toISOString(),
    };
    const procesada = { ...fila, horaInicio: recortarHora(fila.hora_inicio)!, horaFin: recortarHora(fila.hora_fin)! };
    if (esReservaVigente(vigencia, { ahora })) {
      vigentes.push(procesada);
      visibles.push(procesada);
    } else {
      vencidas.push(fila);
      if (tieneMovimientoContable(fila)) {
        conservadas.push(procesada);
        visibles.push(procesada);
      }
    }
  }
  return { vigentes, vencidas, conservadas, visibles };
}

// --- Patch local tras mutación (B4.2) -----------------------------------------
//
// Puras a propósito: ReservasView decide a qué dataset(s) local(es) aplicarlas
// (próximas/jugadas) después de que la mutación remota ya confirmó éxito — acá
// no hay Supabase ni estado de React, solo la transformación del array.

// admin.html:843 (confirmarReservaPendiente, rama de éxito).
export function marcarConfirmada(reservas: ReservaProcesada[], id: string): ReservaProcesada[] {
  return reservas.map((r) => (r.id === id ? { ...r, confirmada: true } : r));
}

// admin.html:1904 (cancelarReserva, rama de éxito).
export function quitarPorId(reservas: ReservaProcesada[], id: string): ReservaProcesada[] {
  return reservas.filter((r) => r.id !== id);
}

// --- Horarios ----------------------------------------------------------------

// admin.html:243-247
export function duracionHoras(inicio: string, fin: string): number {
  const ini = horaToMinutos(inicio);
  let f = horaToMinutos(fin);
  if (f <= ini) f += 1440;
  return (f - ini) / 60;
}

// --- Fechas propias del admin (formatearBadgeFecha/obtenerLunes/obtenerRangoSemana
// no están cubiertas por lib/datetime.ts ni por reservations-public: formatearCorta
// de reservations.form.logic.ts es visualmente parecida pero NO rellena con cero
// (ej. "LUN 6/9" en vez de "LUN 06/09") — semántica distinta, se reportó en vez de
// reusarla a ciegas.) --------------------------------------------------------

// admin.html:341-347
export function formatearBadgeFecha(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`);
  const dia = DIAS_SEMANA_ABREV[d.getDay()];
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${dia} ${dd}/${mm}`;
}

// E5 (Reportes) — solo la abreviatura del día, sin fecha pegada al lado (a
// diferencia de formatearBadgeFecha). Reusa el mismo array que ya vive acá en
// vez de que reportes.logic.ts declare una tercera copia de los 7 strings.
export function abreviarDia(fechaISO: string): string {
  return DIAS_SEMANA_ABREV[new Date(`${fechaISO}T00:00:00`).getDay()];
}

// Notificaciones — cuántas semanas ANTERIORES a la actual se miran para avisar
// de turnos jugados sin cobrar. 8 semanas (~2 meses): cubre un cobro olvidado
// durante bastante tiempo sin traer historial ilimitado; un turno más viejo
// que eso ya no es una "pendiente" accionable sino una deuda histórica, que
// sigue visible en Reservas > Jugadas y en Caja.
export const SEMANAS_HISTORICO_SIN_PAGO = 8;

// admin.html:2148-2155 (offset relativo a la semana actual). offsetSemanas=0
// reproduce obtenerRangoSemana (admin.html:349-356) — B6/agenda.logic.ts (a
// futuro) importa esta misma función con offset != 0 en vez de duplicarla.
export function obtenerLunes(ahora: number, offsetSemanas: number = 0): Date {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const diaSemana = hoy.getDay();
  const offsetDias = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + offsetDias + offsetSemanas * 7);
  return lunes;
}

// `offsetSemanas` (D7) — 0 = semana actual (default, compatible con todos los
// llamadores existentes), -1 = semana anterior. Mismo parámetro que ya recibe
// obtenerLunes, solo faltaba exponerlo acá — lo necesita caja/useCajaSemana.ts
// para el toggle "semana actual/anterior" de Caja.
export function obtenerRangoSemana(ahora: number, offsetSemanas: number = 0): { inicio: string; fin: string } {
  const lunes = obtenerLunes(ahora, offsetSemanas);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  return { inicio: formatearISO(lunes), fin: formatearISO(domingo) };
}

// D4 (venta atada a reserva) — rango rolling de `dias` fechas calendario que
// termina hoy (hoy + los `dias - 1` días anteriores), no una resta de
// milisegundos: usa `setDate` como el resto de los rangos de este archivo
// (obtenerLunes/obtenerRangoSemana) en vez de aritmética cruda de epoch, para
// no depender de la hora exacta de `ahora` dentro del día.
export function obtenerRangoUltimosDias(ahora: number, dias: number): { inicio: string; fin: string } {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - (dias - 1));
  return { inicio: formatearISO(inicio), fin: formatearISO(hoy) };
}

// admin.html:723-730 (fechaFueraDeRangoCargado) — decide si una fecha pasada
// ya está cubierta por lo que useReservasJugadas tiene cargado en memoria
// (semanaMasAntiguaJugados), o si hace falta ir a buscarla al servidor
// (B4.5.2). Una fecha de hoy en adelante nunca está "fuera de rango": siempre
// la cubre Próximos sin tope.
export function fechaFueraDeRangoCargado(fecha: string, semanaMasAntiguaJugados: string | null, hoy: string): boolean {
  if (!fecha) return false;
  if (fecha >= hoy) return false;
  return !semanaMasAntiguaJugados || fecha < semanaMasAntiguaJugados;
}

// admin.html:832-838 (linkWhatsappJugador) — mensaje pre-armado exacto del
// legacy, no solo abrir WhatsApp en blanco. Reusa limpiarTelefonoWa de
// lib/format.ts en vez de reimplementar la limpieza del teléfono.
export function construirLinkWhatsapp(
  r: { nombre: string; fecha: string; horaInicio: string; horaFin: string; telefono: string },
  nombreCancha: string,
): string {
  const texto = encodeURIComponent(
    `Hola ${r.nombre}! Te escribo por tu turno del ${formatearBadgeFecha(r.fecha)} de ${r.horaInicio} a ${r.horaFin} en ${nombreCancha}. ` +
      `Te confirmo el turno. ¡Gracias!`,
  );
  return `https://wa.me/${limpiarTelefonoWa(r.telefono)}?text=${texto}`;
}

// --- Filtros -------------------------------------------------------------

// Shape mínimo que necesita pasaFiltros — lo satisfacen tanto ReservaProcesada
// como ReservaVirtual (esta última no tiene bloqueado/confirmada, por eso son
// opcionales acá: el filtro "pendientes" nunca llega a evaluarlos para un
// virtual porque pasaFiltrosVirtual corta antes, admin.html:1087-1090).
interface ItemFiltrable {
  fecha: string;
  nombre: string;
  bloqueado?: boolean;
  confirmada?: boolean;
}

// admin.html:1075-1083
export function pasaFiltros(r: ItemFiltrable, filtros: FiltrosReservas, ahora: number): boolean {
  if (filtros.filtroFecha && r.fecha !== filtros.filtroFecha) return false;
  if (filtros.filtroNombre && !r.nombre.toLowerCase().includes(filtros.filtroNombre.toLowerCase())) return false;
  if (filtros.filtroRapido === "hoy" && r.fecha !== formatearISO(new Date(ahora))) return false;
  if (filtros.filtroRapido === "manana" && r.fecha !== formatearISO(new Date(ahora + MS_POR_DIA))) return false;
  if (filtros.filtroRapido === "semana") {
    const { inicio, fin } = obtenerRangoSemana(ahora);
    if (r.fecha < inicio || r.fecha > fin) return false;
  }
  if (filtros.filtroRapido === "pendientes" && (r.bloqueado || r.confirmada)) return false;
  return true;
}

// admin.html:1087-1090 — "Solo pendientes" no tiene sentido para un turno fijo
// virtual (no tiene estado de confirmación), se excluye directo en vez de
// forzarlo a pendiente o confirmado.
export function pasaFiltrosVirtual(o: ReservaVirtual, filtros: FiltrosReservas, ahora: number): boolean {
  if (filtros.filtroRapido === "pendientes") return false;
  return pasaFiltros(o, filtros, ahora);
}

// admin.html:1131-1132
export function ordenarProximas(items: ItemListaProximas[]): ItemListaProximas[] {
  return [...items].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
}

// admin.html:1133-1136
export function ordenarJugadas(items: ReservaProcesada[], orden: OrdenJugadas): ReservaProcesada[] {
  return [...items].sort((a, b) =>
    orden === "recientes"
      ? (b.fecha + b.horaInicio).localeCompare(a.fecha + a.horaInicio)
      : (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio),
  );
}

// admin.html:1126, 1129, 1131-1132. `mostrarTurnosFijos` no es un parámetro acá
// a propósito: la decidió de calcular o no `virtuales` (con
// ocurrenciasFijasVirtuales) queda del lado del llamador — si no se quieren
// mostrar, se le pasa un array vacío.
//
// CFG-F2 — `fuente` (reservas reales) usa su propia `hora_apertura_vigente`
// por fila (aperturaVigenteMin), nunca un aperturaMin global. `virtuales` son
// ocurrencias de turno fijo que todavía no existen como fila real — no tienen
// apertura vigente propia que preservar, así que para ellas sí corresponde
// `aperturaHoyMin`: la apertura REAL de hoy (horarios_semana/franja_operativa
// vigente, nunca configCancha), que el llamador resuelve. En la práctica solo
// afecta la ocurrencia de HOY (cualquier ocurrencia futura da esPasado=false
// sin importar la apertura usada), pero sigue sin ser un fallback inventado.
export function construirListaProximas(
  fuente: ReservaProcesada[],
  virtuales: ReservaVirtual[],
  filtros: FiltrosReservas,
  aperturaHoyMin: number | null,
  ahora: number,
): ItemListaProximas[] {
  const reales = fuente
    .filter((r) => !esPasado(r, aperturaVigenteMin(r), ahora))
    .filter((r) => pasaFiltros(r, filtros, ahora));
  const virtualesVisibles = virtuales
    .filter((o) => !esPasado(o, aperturaHoyMin, ahora))
    .filter((o) => pasaFiltrosVirtual(o, filtros, ahora));
  return ordenarProximas([...reales, ...virtualesVisibles]);
}

// admin.html:1127, 1133-1136 — `fuente` son siempre reservas reales, cada una
// con su propia hora_apertura_vigente (ver construirListaProximas arriba).
export function construirListaJugadas(
  fuente: ReservaProcesada[],
  filtros: FiltrosReservas,
  ahora: number,
  orden: OrdenJugadas,
): ReservaProcesada[] {
  const jugadas = fuente
    .filter((r) => esPasado(r, aperturaVigenteMin(r), ahora))
    .filter((r) => pasaFiltros(r, filtros, ahora));
  return ordenarJugadas(jugadas, orden);
}

// --- Turnos fijos virtuales (solo lectura — B administra reservas, C administrará
// turnos fijos; acá no hay CRUD ni API de turnos fijos, solo se consume su forma
// ya procesada como dato de entrada) -----------------------------------------

// admin.html:1099-1124. `ahora` reemplaza el `new Date()` interno del legacy —
// mismo horizonte de 90 días que ya usa buscarChoquesConReservas.
//
// FINAL-F3 (M5) — no proyecta ocurrencias que empiezan antes de que el turno
// fijo existiera (ocurrenciaEsPosteriorACreacion). Solo puede pasar HOY: desde
// mañana el inicio real siempre es posterior a cualquier `creado`. Por eso
// `aperturaHoyMin` (la apertura real de hoy, la misma que ya usa
// construirListaProximas) se aplica solo al día de hoy y el resto va con
// `null`. Sin `aperturaHoyMin` (día cerrado/desconocido) no se corre el día,
// igual que en el servidor cuando la fecha no resuelve apertura.
export function ocurrenciasFijasVirtuales(
  turnosFijos: TurnoFijoConHorario[],
  excepciones: ExcepcionTurnoFijoRow[],
  reservasProximasRaw: ReservaProcesada[],
  ahora: number,
  horizonteDias: number = 90,
  aperturaHoyMin: number | null = null,
): ReservaVirtual[] {
  const out: ReservaVirtual[] = [];
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  for (let i = 0; i < horizonteDias; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    const iso = formatearISO(d);
    const diaSemana = d.getDay();
    for (const t of turnosFijos) {
      if (t.dia_semana !== diaSemana) continue;
      const cancelada = excepciones.some((e) => e.turno_fijo_id === t.id && e.fecha === iso);
      if (cancelada) continue;
      if (!ocurrenciaEsPosteriorACreacion(iso, t.horaInicio, i === 0 ? aperturaHoyMin : null, t.creado)) continue;
      // Solo puede pasar para hoy: si el turno de hoy ya se jugó, ya está
      // materializado como fila real y no hay que mostrarlo también como virtual.
      const yaExiste = reservasProximasRaw.some((r) => r.turno_fijo_id === t.id && r.fecha === iso);
      if (yaExiste) continue;
      out.push({
        virtual: true,
        turnoFijoId: t.id,
        fecha: iso,
        horaInicio: t.horaInicio,
        horaFin: t.horaFin,
        nombre: t.nombre,
        telefono: t.telefono,
      });
    }
  }
  return out;
}

// --- KPIs -------------------------------------------------------------------
//
// D7 separó la lógica monetaria (caja/caja.logic.ts, calcularCajaSemana) de
// este archivo — reservas.logic.ts no calcula plata de ventas/devoluciones,
// ni falta que hace: "Horas jugadas" y "Ocupación hoy" son las dos preguntas
// que le quedan a Reservas sobre sus propias filas, cada una sobre su propia
// ventana de fecha (semana / hoy), y siguen como dos funciones separadas por
// el mismo motivo de antes — no fusionarlas mezclaría esas dos ventanas.

// admin.html:2127-2135 (horasSemana). Antes vivía junto a los campos de plata
// en calcularResumenSemana — D7 la separó. Primera versión separada sumaba
// TODAS las reservas de la semana, jugadas o no — desalineado con el nombre
// real del tile ("Horas jugadas"): una reserva del sábado ya sumaba horas el
// miércoles, antes de jugarse. Corregido: mismo criterio `esPasado` que ya
// usa Caja (caja.logic.ts) y calcularOcupacionHoy, para que el nombre y el
// cálculo coincidan.
export function calcularHorasSemana(
  reservasJugadasRaw: ReservaProcesada[],
  semanaInicio: string,
  semanaFin: string,
  ahora: number,
): number {
  const reservasSemana = reservasJugadasRaw.filter(
    (r) => !r.bloqueado && ocupaCancha(r, ahora) && r.fecha >= semanaInicio && r.fecha <= semanaFin && esPasado(r, aperturaVigenteMin(r), ahora),
  );
  return reservasSemana.reduce((acc, r) => acc + duracionHoras(r.horaInicio, r.horaFin), 0);
}

// admin.html:2137-2139
export function calcularOcupacionHoy(
  reservasJugadasRaw: ReservaProcesada[],
  hoy: string,
  ahora: number,
): OcupacionHoy {
  const reservasHoy = reservasJugadasRaw.filter((r) => !r.bloqueado && ocupaCancha(r, ahora) && r.fecha === hoy);
  const reservasHoyJugadas = reservasHoy.filter((r) => esPasado(r, aperturaVigenteMin(r), ahora));
  const ocupacionHoyPct =
    reservasHoy.length > 0 ? Math.round((reservasHoyJugadas.length / reservasHoy.length) * 100) : 0;
  return { reservasHoy, reservasHoyJugadas, ocupacionHoyPct };
}

// admin.html:2141
export function calcularPendientesUrgentes(
  reservasProximasRaw: ReservaProcesada[],
  ahora: number,
): ReservaProcesada[] {
  return reservasProximasRaw.filter((r) => !r.bloqueado && !r.confirmada && !esPasado(r, aperturaVigenteMin(r), ahora));
}

// --- Pago (solo la decisión pura — sin Supabase, sin estado de modal) --------

// E4.3.1 — único límite nuevo sobre el pago: el sobrepago. Pago $0 (pendiente),
// parcial y exacto siguen siendo válidos (ver auditoría: Caja ya modela
// faltante/sin-registrar como estados legítimos, así que calcularSplitPago de
// abajo sigue sin tocarse). Misma regla que ahora exige la DB
// (reservas_pago_no_supera_precio_check) — esta función es el espejo del lado
// del cliente, para bloquear ANTES de llamar a Supabase.
export function esSobrepago(precio: number, montoEfectivo: number, montoTransferencia: number): boolean {
  return montoEfectivo + montoTransferencia > precio;
}

// admin.html:863-871. Sin validación de que efectivo+transferencia sumen
// `precio` en modo "mixto" — el legacy no la tiene (guarda lo que sea que haya
// en los inputs), así que acá tampoco se inventa esa regla.
export function calcularSplitPago(
  modo: ModoPago,
  precio: number,
  montoEfectivo: number,
  montoTransferencia: number,
): SplitPago {
  if (modo === "efectivo") return { efectivo: precio, transferencia: 0 };
  if (modo === "transferencia") return { efectivo: 0, transferencia: precio };
  return { efectivo: Number(montoEfectivo) || 0, transferencia: Number(montoTransferencia) || 0 };
}

// admin.html:874 (guardarPago, rama de éxito) — patch local tras guardar pago
// (B4.4). Único dataset afectado además del que llama: preserva el resto del
// objeto, no toca reservas con otro id.
export function aplicarPago(reservas: ReservaProcesada[], id: string, split: SplitPago): ReservaProcesada[] {
  return reservas.map((r) =>
    r.id === id ? { ...r, pago_efectivo: split.efectivo, pago_transferencia: split.transferencia } : r,
  );
}

// admin.html:1051-1057 (textoPago) — texto read-only para Jugados (B4.3). La
// acción de cargar/editar pago (guardarPago) es B4.4, esto solo lo muestra.
export function textoPago(r: { pago_efectivo: number; pago_transferencia: number }): string {
  const ef = Number(r.pago_efectivo || 0);
  const tr = Number(r.pago_transferencia || 0);
  if (ef === 0 && tr === 0) return "Pago sin registrar";
  if (ef > 0 && tr > 0) return `Mixto: $${ef.toLocaleString("es-AR")} ef. + $${tr.toLocaleString("es-AR")} transf.`;
  if (tr > 0) return `Transferencia $${tr.toLocaleString("es-AR")}`;
  return `Efectivo $${ef.toLocaleString("es-AR")}`;
}

// admin.html:848-861 — estado inicial del modal de pago a partir de lo ya
// guardado en la reserva.
export function determinarEstadoInicialPago(r: {
  precio: number;
  pago_efectivo: number;
  pago_transferencia: number;
}): EstadoInicialPagoModal {
  const efectivo = Number(r.pago_efectivo || 0);
  const transferencia = Number(r.pago_transferencia || 0);
  let modo: ModoPago = "efectivo";
  if (efectivo > 0 && transferencia > 0) modo = "mixto";
  else if (transferencia > 0) modo = "transferencia";
  return {
    modo,
    montoEfectivo: efectivo > 0 ? efectivo : Number(r.precio || 0),
    montoTransferencia: transferencia > 0 ? transferencia : 0,
  };
}

// --- Errores de mutación de reservas (FINAL-F4) --------------------------------

// Marca que reservas.api.ts devuelve cuando un UPDATE/RPC no encontró la fila
// (M6): la reserva ya no existe (purgada por el cron, borrada por otro admin).
// Vive acá y no en la api para que la lógica pura no arrastre supabase.
export const ERROR_RESERVA_INEXISTENTE = "reserva_inexistente";

export type AccionReserva = "confirmar" | "cancelar" | "desbloquear" | "pago";

const MENSAJES_ERROR_GENERICO: Record<AccionReserva, string> = {
  confirmar: "No se pudo confirmar. Probá de nuevo.",
  cancelar: "No se pudo cancelar. Probá de nuevo.",
  desbloquear: "No se pudo desbloquear. Probá de nuevo.",
  pago: "No se pudo guardar el pago. Probá de nuevo.",
};

const MENSAJES_RESERVA_INEXISTENTE: Record<AccionReserva, string> = {
  confirmar: "Esa reserva ya no existe (venció o fue eliminada). No se confirmó. Recargá la lista.",
  cancelar: "Esa reserva ya no existe. Recargá la lista.",
  desbloquear: "Ese bloqueo ya no existe. Recargá la lista.",
  pago: "Esa reserva ya no existe: el pago no se guardó. Recargá la lista.",
};

// El servidor (trigger reservas_bloquear_borrado_con_dinero) rechaza el borrado
// con message 'reserva_con_ventas' (RD001, tiene prioridad si hay ambos) o
// 'reserva_con_pagos' (RD002). Las ventas NO se pueden desvincular hoy, así que
// ese mensaje no promete una salida; los pagos sí se pueden ajustar.
export const MENSAJE_RESERVA_CON_VENTAS =
  "Esta reserva tiene ventas asociadas y no puede eliminarse para preservar la trazabilidad.";
export const MENSAJE_RESERVA_CON_PAGOS =
  "Esta reserva tiene dinero cobrado. Registrá el reintegro desde Pago antes de cancelarla (el historial se conserva).";

// Mensaje de toast para un error de confirmar / cancelar / desbloquear / guardar
// pago. `error.message` es lo único que se mira (PostgrestError o el error
// sintético de reservas.api).
export function mensajeErrorReserva(error: { message?: string } | null | undefined, accion: AccionReserva): string {
  const msg = error?.message ?? "";
  if (msg === ERROR_RESERVA_INEXISTENTE) return MENSAJES_RESERVA_INEXISTENTE[accion];
  if (accion === "cancelar" || accion === "desbloquear") {
    if (msg.includes("reserva_con_ventas")) return MENSAJE_RESERVA_CON_VENTAS;
    if (msg.includes("reserva_con_pagos")) return MENSAJE_RESERVA_CON_PAGOS;
  }
  // E4.3.1 — la DB (reservas_pago_no_supera_precio_check) es la fuente de verdad
  // del tope de pago: reintentar con los mismos valores fallaría igual, así que
  // se explica el motivo real en vez del genérico.
  if (accion === "pago" && msg.includes("reservas_pago_no_supera_precio_check")) {
    return "El pago no puede superar el precio de la reserva.";
  }
  return MENSAJES_ERROR_GENERICO[accion];
}
