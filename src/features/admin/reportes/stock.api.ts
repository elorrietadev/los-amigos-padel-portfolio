// Capa de transporte del Reporte de Productos/Stock (E6). Productos reusa
// obtenerProductos tal cual (productos.api.ts) — ya trae el catálogo
// completo sin paginar (`.select("*").order("nombre")`, sin `.range()`),
// suficiente para el tamaño real de este club. Sin RPC nuevo, sin
// service_role: RLS ya permite `SELECT` en `lotes`/`productos` a
// `authenticated` bajo `is_admin()` (confirmado leyendo las policies reales
// antes de escribir esto) — sesión admin normal alcanza.
//
// Lotes es la única query nueva: no existía ningún lugar del frontend que
// leyera `lotes` hasta ahora. Pagina internamente con `obtenerTodasLasPaginas`
// (ya definida en reportes.api.ts para el reporte de caja) en vez de duplicar
// esa función — mismo criterio genérico, reusado tal cual.

import { supabase } from "../../../lib/supabase";
import { obtenerTodasLasPaginas } from "./reportes.api";

export { obtenerProductos } from "../productos/productos.api";

const TAMANO_PAGINA = 500;

// Shape plano post-`.select()` con embed: `productos(nombre)` viaja como
// objeto anidado en la respuesta cruda de supabase-js — se aplana a
// `productoNombre` acá mismo, así stock.logic.ts no depende de la forma del
// embed. `costo_unitario` es `number | null` porque es una columna generada
// (round(costo_total/cantidad_inicial,2)) — nunca debería ser null en un lote
// real (cantidad_inicial > 0, forzado por reponer_stock), pero el tipo
// generado lo permite.
export interface LoteStockCrudo {
  producto_id: string;
  productoNombre: string;
  cantidad_inicial: number;
  cantidad_restante: number;
  costo_unitario: number | null;
  creado: string;
}

export interface LoteStockFila {
  producto_id: string;
  cantidad_inicial: number;
  cantidad_restante: number;
  costo_unitario: number | null;
  creado: string;
  productos: { nombre: string } | null;
}

function obtenerPaginaLotesStock(offset: number, limite: number) {
  return supabase
    .from("lotes")
    .select("producto_id, cantidad_inicial, cantidad_restante, costo_unitario, creado, productos(nombre)")
    .gt("cantidad_restante", 0)
    .order("creado", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limite - 1);
}

// Separada de obtenerLotesStockCompleto para poder testearse sin mockear
// supabase-js (mismo criterio que el resto del proyecto: transporte vs.
// transformación de shape). "Producto eliminado" nunca debería aparecer en
// la práctica: `lotes` no tiene ON DELETE CASCADE especial y nada del
// dominio borra productos (solo los desactiva) — defensa igual de barata
// que el `?.` de montoDevolucion (caja.logic.ts) ante una fila huérfana que
// el tipo estático no puede descartar del todo.
export function aplanarLoteStockFila(l: LoteStockFila): LoteStockCrudo {
  return {
    producto_id: l.producto_id,
    productoNombre: l.productos?.nombre ?? "(producto eliminado)",
    cantidad_inicial: l.cantidad_inicial,
    cantidad_restante: l.cantidad_restante,
    costo_unitario: l.costo_unitario,
    creado: l.creado,
  };
}

// Solo lotes con cantidad_restante > 0 (ver stock.types.ts — reporte de
// inventario actual, no historial de compras agotadas). Pagina hasta agotar
// el resultado completo, nunca corta en una página fija.
export async function obtenerLotesStockCompleto() {
  const { data, error } = await obtenerTodasLasPaginas<LoteStockFila>(
    async (offset, limite) => obtenerPaginaLotesStock(offset, limite),
    TAMANO_PAGINA,
  );
  if (error) return { data: null, error };
  return { data: (data ?? []).map(aplanarLoteStockFila), error: null };
}
