// Capa de transporte del dominio de reservas del admin — mismo patrón que
// reservations-public/reservations.api.ts: cada función hace una sola llamada
// a Supabase y devuelve el query builder tal cual (sin envolver { data, error }
// en un tipo propio), sin decidir loading/cache/guards/merge — eso es de los
// hooks de B3/B5, que todavía no existen. Ninguna hace `select` de columnas
// específicas porque el legacy tampoco lo hace (siempre `select("*")`); no se
// optimiza nada que el legacy no optimizaba.

import { supabase } from "../../../lib/supabase";
import { obtenerTodasLasPaginas, type ResultadoPaginado } from "../../../lib/paginacion";
import { ERROR_RESERVA_INEXISTENTE } from "./reservas.logic";
import type { ResultadoMovimientoPago, TipoMovimientoPago } from "./pagos.logic";
import type { ReservaRow } from "./reservas.types";

// admin.html:533 (cargarProximos)
export function obtenerReservasProximas(desde: string) {
  return supabase.from("reservas").select("*, ventas(count)").gte("fecha", desde).order("fecha").order("hora_inicio");
}

// admin.html:557 (cargarJugadosSemanaActual) y 581 (cargarSemanaAnteriorJugados)
// — misma query exacta con distinto rango de fechas, unificada en una sola
// función. También es la query de cargarSemanaGrilla (admin.html:654-660,
// dominio de Agenda/B7): se reusará desde ahí en vez de triplicarla.
export function obtenerReservasPorRango(inicio: string, fin: string) {
  return supabase.from("reservas").select("*, ventas(count)").gte("fecha", inicio).lte("fecha", fin).order("fecha").order("hora_inicio");
}

// Misma query que obtenerReservasPorRango pero agotando TODAS las páginas: para
// rangos largos (las 8 semanas de la campana) PostgREST corta en max-rows (1000)
// y perdía en silencio las semanas más recientes. Orden total (fecha,
// hora_inicio, id) para que las páginas no se solapen; el filtro por id cubre
// el corrimiento de offset si entra una fila entre página y página.
export async function obtenerReservasPorRangoCompleto(inicio: string, fin: string): Promise<ResultadoPaginado<ReservaRow>> {
  const { data, error } = await obtenerTodasLasPaginas<ReservaRow>(async (offset, limite) =>
    supabase
      .from("reservas")
      .select("*, ventas(count)")
      .gte("fecha", inicio)
      .lte("fecha", fin)
      .order("fecha")
      .order("hora_inicio")
      .order("id")
      .range(offset, offset + limite - 1) as unknown as ResultadoPaginado<ReservaRow>,
  );
  if (error || !data) return { data: null, error };
  const vistos = new Set<string>();
  return { data: data.filter((r) => !vistos.has(r.id) && vistos.add(r.id)), error: null };
}

// admin.html:746-761 (búsqueda debounced). Mismos filtros condicionales
// exactos: nombre por ilike solo con 3+ caracteres, fecha por igualdad exacta,
// límite de 50, orden por fecha descendente — nada agregado ni quitado.
export interface FiltrosBusquedaReservas {
  nombre?: string;
  fecha?: string;
}

export function buscarReservas(filtros: FiltrosBusquedaReservas) {
  let query = supabase.from("reservas").select("*, ventas(count)").order("fecha", { ascending: false }).limit(50);
  if (filtros.nombre && filtros.nombre.trim().length >= 3) {
    query = query.ilike("nombre", `%${filtros.nombre.trim()}%`);
  }
  if (filtros.fecha) {
    query = query.eq("fecha", filtros.fecha);
  }
  return query;
}

// FINAL-F4 (M6) — PostgREST devuelve `error: null` cuando un UPDATE/DELETE no
// toca ninguna fila (la reserva ya no existe: la purgó el cron, la borró otro
// admin, o RLS la filtró). Sin este chequeo la UI mostraba éxito y parcheaba el
// estado local sobre una fila fantasma. Estas funciones exigen EXACTAMENTE una
// fila afectada y, si no, devuelven `{ error }` con ERROR_RESERVA_INEXISTENTE.
export interface ErrorMutacionReserva {
  message: string;
  code?: string;
}

const errorReservaInexistente = (): ErrorMutacionReserva => ({ message: ERROR_RESERVA_INEXISTENTE });

// admin.html:841 (confirmarReservaPendiente)
export async function confirmarReserva(id: string): Promise<{ error: ErrorMutacionReserva | null }> {
  const { data, error } = await supabase.from("reservas").update({ confirmada: true }).eq("id", id).select("id");
  if (error) return { error };
  if (!data || data.length !== 1) return { error: errorReservaInexistente() };
  return { error: null };
}

// admin.html:1902 (cancelarReserva) — FINAL-F4 (M8): ya no es un .delete()
// directo. La RPC admin_eliminar_reserva bloquea la fila (serializa contra
// pagos/ventas concurrentes), devuelve false si no existe y deja que el trigger
// BEFORE DELETE rechace el borrado si hay dinero: error con message
// 'reserva_con_pagos' (RD002) o 'reserva_con_ventas' (RD001) — ver
// mensajeErrorCancelarReserva en reservas.logic.ts. También la usa desbloquear
// (un bloqueo nunca tiene dinero, así que nunca se rechaza por eso).
export async function cancelarReserva(id: string): Promise<{ error: ErrorMutacionReserva | null }> {
  const { data, error } = await supabase.rpc("admin_eliminar_reserva", { p_reserva_id: id });
  if (error) return { error };
  if (data !== true) return { error: errorReservaInexistente() };
  return { error: null };
}

// FINAL-F6 — los pagos de reservas ya NO se escriben con un UPDATE: cada
// cobro/reintegro/corrección es un movimiento inmutable registrado por la RPC
// (reserva_pago_movimientos), que además actualiza el snapshot
// pago_efectivo/pago_transferencia. `operacionId` es la clave de idempotencia
// (se reusa en los reintentos); `esperado*` es lo que la UI mostraba (si la
// base cambió, el servidor responde pago_desactualizado en vez de pisarlo).
export interface ParametrosMovimientoPago {
  reservaId: string;
  operacionId: string;
  tipo: TipoMovimientoPago;
  efectivo: number;
  transferencia: number;
  motivo: string | null;
  esperadoEfectivo: number;
  esperadoTransferencia: number;
}

export async function registrarMovimientoPago(
  p: ParametrosMovimientoPago,
): Promise<{ data: ResultadoMovimientoPago | null; error: ErrorMutacionReserva | null }> {
  const { data, error } = await supabase.rpc("registrar_movimiento_pago", {
    p_reserva_id: p.reservaId,
    p_operacion_id: p.operacionId,
    p_tipo: p.tipo,
    p_efectivo: p.efectivo,
    p_transferencia: p.transferencia,
    p_motivo: p.motivo,
    p_esperado_efectivo: p.esperadoEfectivo,
    p_esperado_transferencia: p.esperadoTransferencia,
  });
  if (error) return { data: null, error };
  return { data: data as unknown as ResultadoMovimientoPago, error: null };
}

// Historial inmutable de pagos de una reserva, en orden cronológico.
export function obtenerMovimientosPago(reservaId: string) {
  return supabase
    .from("reserva_pago_movimientos")
    .select("*")
    .eq("reserva_id", reservaId)
    .order("creado", { ascending: true })
    .order("medio", { ascending: true });
}

// C4 — admin.html:2076-2078 (dentro de bloquearHorario). Un bloqueo es una
// fila más de `reservas` con estos campos fijos — sin tabla ni dominio
// propios. `.select().single()` (a diferencia del insert crudo del legacy)
// para poder patchear la lista local sin refetch — mismo criterio que
// `crearTurnoFijo` en turnosFijos.api.ts.
export function crearBloqueo(fecha: string, horaInicio: string, horaFin: string) {
  return supabase
    .from("reservas")
    .insert([
      { fecha, hora_inicio: horaInicio, hora_fin: horaFin, nombre: "Bloqueado", telefono: "-", precio: 0, bloqueado: true, confirmada: true },
    ])
    .select()
    .single();
}

// C3 — el servidor cotiza cada ocurrencia individualmente contra el motor
// histórico de tarifas (calcular_precio_en_instante). Ya no recibe ni usa
// ningún precio provisto por el cliente.
export function materializarTurnosFijosJugados() {
  return supabase.rpc("materializar_turnos_fijos_jugados");
}
