// Capa de transporte de Ventas — mismo patrón que productos.api.ts/
// reservas.api.ts: una sola función, sin decidir loading/cache/guards/patch
// local — eso vive en VenderView.tsx. admin.html:1006-1015 (registrarVenta)
// — sin tocar el RPC.
//
// D4: `reservaId` viaja explícito desde el llamador (`null` en venta suelta,
// el id elegido en venta atada a una reserva) — ya no se hardcodea acá como
// en D3.

import { supabase } from "../../../lib/supabase";
import type { Json } from "../../../types/database.types";
import { SELECT_VENTA_CON_DETALLE } from "../historial/historial.api";
import type { ItemVentaRpc } from "./ventas.logic";

export function registrarVenta(
  items: ItemVentaRpc[],
  pagoEfectivo: number,
  pagoTransferencia: number,
  forzarStockInsuficiente: boolean,
  reservaId: string | null,
  // FINAL-F6 — clave de idempotencia de la operación (se reusa en reintentos:
  // el servidor devuelve la venta original en vez de registrar otra).
  idempotencyKey: string,
) {
  return supabase.rpc("registrar_venta", {
    p_reserva_id: reservaId,
    p_idempotency_key: idempotencyKey,
    // `ItemVentaRpc[]` es estructuralmente un `Json[]` válido (cada campo es
    // string/number), pero TS exige una index signature explícita para
    // aceptarlo como `Json` sin cast — mismo tipo de desajuste de los Args
    // generados que ya se documentó arriba para p_reserva_id.
    p_items: items as unknown as Json,
    p_pago_efectivo: pagoEfectivo,
    p_pago_transferencia: pagoTransferencia,
    p_forzar_stock_insuficiente: forzarStockInsuficiente,
  });
}

// P3 (detalle de reserva) — mismo `select` exacto que ya usa Historial
// (`SELECT_VENTA_CON_DETALLE`, con `venta_items`/`productos`/`devoluciones`
// embebidos), filtrado por `reserva_id` en vez de por rango de fecha. Sin
// SQL/RPC nueva: `ventas`/`venta_items`/`devoluciones` ya tienen policy
// SELECT gateada por `is_admin()` (verificado vía Supabase MCP), igual que
// `reservas`. `procesarVenta` (historial.logic.ts) sabe consumir el shape
// resultante tal cual — no se declara un tipo de fila aparte para esto.
export function obtenerVentasPorReserva(reservaId: string) {
  return supabase.from("ventas").select(SELECT_VENTA_CON_DETALLE).eq("reserva_id", reservaId).order("creado", { ascending: true });
}
