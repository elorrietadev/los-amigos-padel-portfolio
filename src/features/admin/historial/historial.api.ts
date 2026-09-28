// Capa de transporte de Historial (D5) — mismo patrón que reservas.api.ts/
// ventas.api.ts: una sola función, sin decidir loading/cache/guards/paginación
// — eso vive en useHistorialVentas.ts.
//
// Query pivotada desde `ventas` (una fila por venta, no por línea) embebiendo
// `reservas` (a-uno, FK `ventas.reserva_id` — null si es venta suelta),
// `venta_items` (a-muchos, FK `venta_items.venta_id`) y, dentro de cada item,
// `productos` (a-uno, FK `venta_items.producto_id`) y `devoluciones` (a-muchos,
// FK `devoluciones.venta_item_id`). Deliberadamente NO se usa la vista
// `venta_items_detalle` (confirmado leyendo su definición real vía Supabase
// MCP, solo lectura: no trae fecha/total/pago/reserva_id de la venta ni el
// nombre del producto, y pivotear desde ahí devolvería una fila por línea en
// vez de por venta) — `cantidad_devuelta`/`cantidad_vigente`/`subtotal_vigente`
// se calculan en TS a partir de `devoluciones` embebido (historial.logic.ts),
// mismo criterio que el resto del proyecto (vigencia siempre derivada en
// cliente, nunca delegada a una columna/vista de SQL).
//
// Todas las FKs involucradas son 1:1 sin ambigüedad (una sola FK por par de
// tablas), así que no hace falta ningún hint `!fkey` de PostgREST.

import { supabase } from "../../../lib/supabase";

export interface ParamsObtenerVentas {
  desde: string;
  hasta: string;
  offset: number;
  limite: number;
}

// Exportado para reportes.api.ts (E5): la query completa (sin paginar) de
// Ventas del reporte usa exactamente el mismo shape/embeds que Historial, así
// que reusa esta constante en vez de declarar un segundo `select` idéntico a
// mano que se pueda desalinear del real con el tiempo.
export const SELECT_VENTA_CON_DETALLE = `
  id,
  reserva_id,
  fecha,
  pago_efectivo,
  pago_transferencia,
  total,
  creado,
  reservas ( id, nombre, fecha, hora_inicio, hora_fin, confirmada ),
  venta_items (
    id,
    producto_id,
    cantidad,
    precio_unitario_snapshot,
    costo_unitario_snapshot,
    subtotal,
    creado,
    productos ( nombre ),
    devoluciones ( cantidad, medio_reembolso )
  )
`;

// Orden determinista de 3 columnas (fecha, creado, id, todas DESC) + paginación
// por range/offset liso — sin keyset/cursor (D5, decisión explícita: cursorear
// por una sola columna secundaria mientras se ordena por otra primaria sería
// incoherente con el orden real; un keyset de 3 columnas es la solución
// correcta pero es sobrearquitectura para el volumen actual). El único riesgo
// residual de offset puro es que una venta nueva insertada justo en el borde
// de una página, mientras se pagina hacia atrás, puede duplicar o saltear una
// fila — la deduplicación por id (historial.logic.ts, `agregarVentasSinDuplicar`)
// cubre el caso de duplicado; el de salteo se acepta (ventas se registran a
// mano, una por una, no hay inserciones concurrentes reales que lo disparen).
export function obtenerVentasConDetalle({ desde, hasta, offset, limite }: ParamsObtenerVentas) {
  return supabase
    .from("ventas")
    .select(SELECT_VENTA_CON_DETALLE)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("creado", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limite - 1);
}
