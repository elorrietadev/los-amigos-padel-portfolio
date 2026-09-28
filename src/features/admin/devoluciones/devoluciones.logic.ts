// Lógica pura de Devoluciones (D6) — sin Supabase, sin estado de componente.
// El patch local del shape procesado (DevolucionResumen, acumulación de
// cantidad/subtotal vigente) vive en historial.logic.ts, no acá: ese shape es
// propio de cómo Historial presenta una venta, Devoluciones solo aporta la
// acción (RPC) y sus validaciones de entrada.

export type MedioReembolso = "efectivo" | "transferencia";

export function medioReembolsoValido(valor: string): valor is MedioReembolso {
  return valor === "efectivo" || valor === "transferencia";
}

// Espejo de la validación real de registrar_devolucion (cantidad > 0) más el
// tope de cliente (cantidadVigente) que el RPC valida server-side vía
// devolucion_excede_disponible — validar acá evita el viaje redondo para el
// caso común (nadie tipeó de más), sin reemplazar la validación server-side
// (que sigue siendo la autoridad final, ver esErrorDevolucionExcedeDisponible).
export function cantidadDevolucionValida(cantidad: number, maximo: number): boolean {
  return Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= maximo;
}

// registrar_devolucion hace `raise exception 'devolucion_excede_disponible'
// using detail = ...` (SQL real, verificado vía Supabase MCP) — PostgREST
// devuelve ese texto tal cual en `error.message`, sin prefijo. Mismo criterio
// que esErrorReservaInexistente/"stock_insuficiente" en ventas.logic.ts:
// detección por el string exacto del RAISE, nunca por un fragmento del
// mensaje humano (frágil, puede cambiar de fraseo).
export function esErrorDevolucionExcedeDisponible(error: { message?: string } | null | undefined): boolean {
  return error?.message === "devolucion_excede_disponible";
}
