// Capa de transporte del Reporte de Caja y Actividad — FINAL-F6.
//
// Las tres fuentes FINANCIERAS se filtran por su propia fecha contable (igual
// que caja.api.ts) y traen el detalle que necesitan sus hojas; el Resumen se
// calcula con calcularCajaRango sobre ESTAS MISMAS filas, así que no puede
// divergir del detalle. La hoja operativa (Actividad) usa reservas.fecha.
// Todo pagina hasta agotar el rango con un orden total.

import { supabase } from "../../../lib/supabase";
import { obtenerTodasLasPaginas, type ResultadoPaginado } from "../../../lib/paginacion";
import { SELECT_VENTA_CON_DETALLE } from "../historial/historial.api";
import type { VentaCruda } from "../historial/historial.types";
import type { ReservaRow } from "../reservas/reservas.types";
import type { MovimientoPagoRow } from "../reservas/pagos.logic";

export { obtenerTodasLasPaginas, type ResultadoPaginado } from "../../../lib/paginacion";

export const SELECT_DEVOLUCION_REPORTE = `
  id, creado, fecha, cantidad, medio_reembolso, motivo,
  venta_items ( precio_unitario_snapshot, productos ( nombre ), ventas ( id, fecha, creado ) )
`;

export interface DevolucionReporteCruda {
  id: string;
  creado: string;
  fecha: string | null;
  cantidad: number;
  medio_reembolso: string;
  motivo: string | null;
  venta_items: {
    precio_unitario_snapshot: number;
    productos: { nombre: string } | null;
    ventas: { id: string; fecha: string; creado: string } | null;
  } | null;
}

type Pagina<T> = ResultadoPaginado<T>;

export function obtenerMovimientosReporte(desde: string, hasta: string): Promise<Pagina<MovimientoPagoRow>> {
  return obtenerTodasLasPaginas<MovimientoPagoRow>(async (offset, limite) =>
    supabase
      .from("reserva_pago_movimientos")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("creado", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limite - 1) as unknown as Pagina<MovimientoPagoRow>,
  );
}

export function obtenerVentasReporteCompleto(desde: string, hasta: string): Promise<Pagina<VentaCruda>> {
  return obtenerTodasLasPaginas<VentaCruda>(async (offset, limite) =>
    supabase
      .from("ventas")
      .select(SELECT_VENTA_CON_DETALLE)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("creado", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limite - 1) as unknown as Pagina<VentaCruda>,
  );
}

export function obtenerDevolucionesReporte(desde: string, hasta: string): Promise<Pagina<DevolucionReporteCruda>> {
  return obtenerTodasLasPaginas<DevolucionReporteCruda>(async (offset, limite) =>
    supabase
      .from("devoluciones")
      .select(SELECT_DEVOLUCION_REPORTE)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("creado", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limite - 1) as unknown as Pagina<DevolucionReporteCruda>,
  );
}

export function obtenerReservasActividad(desde: string, hasta: string): Promise<Pagina<ReservaRow>> {
  return obtenerTodasLasPaginas<ReservaRow>(async (offset, limite) =>
    supabase
      .from("reservas")
      .select("*, ventas(count)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("hora_inicio", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limite - 1) as unknown as Pagina<ReservaRow>,
  );
}
