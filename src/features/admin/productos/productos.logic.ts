// Lógica pura de Productos (D1) — sin Supabase, sin estado de componente.
// Validación de formularios (nombre vacío, precio negativo, cantidad/costo
// inválidos) queda inline en los componentes, no acá: son checks de un solo
// uso, no reusados ni testeados por separado en ningún otro dominio ya
// migrado (mismo criterio que TurnosFijosView/BloqueosView).

import type { Tables } from "../../../types/database.types";

export type Producto = Tables<"productos">;

// admin.html:1142 (productosFiltrados). Substring case-insensitive sobre
// nombre, igual que el legacy — sin debounce ni servidor: catálogo chico.
export function filtrarPorNombre(productos: Producto[], filtro: string): Producto[] {
  const q = filtro.trim().toLowerCase();
  if (!q) return productos;
  return productos.filter((p) => p.nombre.toLowerCase().includes(q));
}

// admin.html:2698 (stockBajo). `<=`, no `<` — un producto con stock igual al
// mínimo ya cuenta como bajo.
export function esStockBajo(p: Pick<Producto, "stock_actual" | "stock_minimo">): boolean {
  return p.stock_actual <= p.stock_minimo;
}

// admin.html:1143 (productosStockBajo).
export function productosConStockBajo(productos: Producto[]): Producto[] {
  return productos.filter(esStockBajo);
}

// Réplica exacta de la columna generada `lotes.costo_unitario`
// (round(costo_total/cantidad_inicial, 2)) para que la calculadora en vivo
// del modal de reponer stock muestre lo mismo que el RPC va a calcular.
// `cantidad<=0` -> 0 en vez de NaN/Infinity mientras el campo está vacío o
// recién se está tipeando.
export function calcularCostoUnitario(cantidad: number, costoTotal: number): number {
  if (cantidad <= 0) return 0;
  return Math.round((costoTotal / cantidad) * 100) / 100;
}

// PUBLIC-R4 — imagen de catálogo. WebP/JPEG/PNG (mismo set que
// allowed_mime_types del bucket productos-catalogo en Supabase Storage — si
// se cambia acá, hay que cambiarlo ahí también) y 3MB máx (mismo valor que
// file_size_limit del bucket). Validar en el cliente es solo UX (feedback
// inmediato, sin esperar el roundtrip de Storage); el bucket es quien manda.
export const IMAGEN_PRODUCTO_TIPOS_PERMITIDOS = ["image/webp", "image/jpeg", "image/png"];
export const IMAGEN_PRODUCTO_TAMANO_MAXIMO_BYTES = 3 * 1024 * 1024;

export function validarImagenProducto(archivo: File): string | null {
  if (!IMAGEN_PRODUCTO_TIPOS_PERMITIDOS.includes(archivo.type)) {
    return "Formato no soportado. Usá JPG, PNG o WebP.";
  }
  if (archivo.size > IMAGEN_PRODUCTO_TAMANO_MAXIMO_BYTES) {
    return "La imagen no puede pesar más de 3 MB.";
  }
  return null;
}
