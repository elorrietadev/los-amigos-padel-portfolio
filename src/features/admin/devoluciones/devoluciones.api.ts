// Capa de transporte de Devoluciones (D6) — mismo patrón que productos.api.ts/
// ventas.api.ts: una sola función, sin decidir loading/patch local/toasts —
// eso vive en HistorialView.tsx (quien dispara la devolución).

import { supabase } from "../../../lib/supabase";
import type { MedioReembolso } from "./devoluciones.logic";

// `p_motivo` con `?? undefined`: mismo motivo que reponerStock en
// productos.api.ts — el Arg generado (`p_motivo?: string`, sin `| null`) no
// acepta `null` explícito, así que la clave se omite y Postgres aplica su
// propio DEFAULT NULL.
//
// FINAL-F6 — `idempotencyKey`: una por devolución (modal abierto), reusada en
// cada reintento. El servidor devuelve la devolución original en vez de
// registrar otra (nunca resta dos veces de Caja).
export function registrarDevolucion(
  ventaItemId: string,
  cantidad: number,
  motivo: string | null,
  medioReembolso: MedioReembolso,
  idempotencyKey: string,
) {
  return supabase.rpc("registrar_devolucion", {
    p_venta_item_id: ventaItemId,
    p_cantidad: cantidad,
    p_motivo: motivo,
    p_medio_reembolso: medioReembolso,
    p_idempotency_key: idempotencyKey,
  });
}
