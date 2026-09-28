// Capa de transporte de Caja — FINAL-F6. Tres fuentes de MOVIMIENTOS REALES,
// cada una filtrada por SU PROPIA fecha contable (día de Buenos Aires del
// instante real en que se registró):
//   * reserva_pago_movimientos.fecha  (cobros / reintegros / correcciones)
//   * ventas.fecha                    (cobro de la venta)
//   * devoluciones.fecha              (reembolso)
// La fecha del turno (reservas.fecha) NO participa: una seña cobrada hoy para
// un turno futuro entra hoy; una venta cobrada el lunes 00:20 entra el lunes.
//
// Todas paginan hasta agotar el rango (PostgREST corta en max-rows) con un
// orden total, para no perder ni repetir filas entre páginas.

import { supabase } from "../../../lib/supabase";
import { obtenerTodasLasPaginas, type ResultadoPaginado } from "../../../lib/paginacion";

export const SELECT_MOVIMIENTO_CAJA = "id, creado, fecha, medio, importe, tipo";
export const SELECT_VENTA_CAJA = "id, creado, fecha, pago_efectivo, pago_transferencia, total";
export const SELECT_DEVOLUCION_CAJA = "id, creado, cantidad, medio_reembolso, fecha, venta_items ( precio_unitario_snapshot )";

export interface MovimientoCaja {
  id: string;
  creado: string;
  fecha: string | null;
  medio: string;
  importe: number;
  tipo: string;
}
export interface VentaCaja {
  id: string;
  creado: string;
  fecha: string;
  pago_efectivo: number;
  pago_transferencia: number;
  total: number;
}
export interface DevolucionCaja {
  id: string;
  creado: string;
  cantidad: number;
  medio_reembolso: string;
  fecha: string | null;
  venta_items: { precio_unitario_snapshot: number } | null;
}

export function obtenerMovimientosPagoParaCaja(desde: string, hasta: string): Promise<ResultadoPaginado<MovimientoCaja>> {
  return obtenerTodasLasPaginas<MovimientoCaja>(async (offset, limite) =>
    supabase
      .from("reserva_pago_movimientos")
      .select(SELECT_MOVIMIENTO_CAJA)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("creado", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limite - 1) as unknown as ResultadoPaginado<MovimientoCaja>,
  );
}

export function obtenerVentasParaCaja(desde: string, hasta: string): Promise<ResultadoPaginado<VentaCaja>> {
  return obtenerTodasLasPaginas<VentaCaja>(async (offset, limite) =>
    supabase
      .from("ventas")
      .select(SELECT_VENTA_CAJA)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("creado", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limite - 1) as unknown as ResultadoPaginado<VentaCaja>,
  );
}

// Embed a-uno de venta_items (FK única devoluciones.venta_item_id): PostgREST
// lo trae como objeto, no array.
export function obtenerDevolucionesParaCaja(desde: string, hasta: string): Promise<ResultadoPaginado<DevolucionCaja>> {
  return obtenerTodasLasPaginas<DevolucionCaja>(async (offset, limite) =>
    supabase
      .from("devoluciones")
      .select(SELECT_DEVOLUCION_CAJA)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("creado", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limite - 1) as unknown as ResultadoPaginado<DevolucionCaja>,
  );
}
