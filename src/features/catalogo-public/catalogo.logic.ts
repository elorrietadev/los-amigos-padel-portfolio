// Lógica PURA del catálogo público (PUBLIC-R4) — sin Supabase, sin estado de
// componente, mismo criterio que reservations.logic.ts.
import type { ProductoPublico, ProductoPublicoRow } from "./catalogo.types";

// Filtra defensivamente cualquier fila sin id/nombre/precio_venta (nunca
// debería pasar en la práctica — son NOT NULL en la tabla base — pero la
// vista los tipa nullable, ver catalogo.types.ts) y ordena por
// orden_publico/nombre para que el render sea estable entre cargas.
export function procesarProductosPublicos(data: ProductoPublicoRow[] | null): ProductoPublico[] {
  return (data ?? [])
    .filter(
      (p): p is ProductoPublicoRow & { id: string; nombre: string; precio_venta: number } =>
        p.id != null && p.nombre != null && p.precio_venta != null,
    )
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precioVenta: p.precio_venta,
      categoriaPublica: p.categoria_publica,
      descripcionPublica: p.descripcion_publica,
      imagenPath: p.imagen_path,
      destacado: p.destacado ?? false,
      ordenPublico: p.orden_publico,
      enStock: p.en_stock ?? false,
    }))
    .sort(compararOrdenCatalogo);
}

// orden_publico ascendente primero (los que no tienen orden asignado quedan
// al final, no intercalados al azar), nombre alfabético como desempate
// estable — así dos productos con el mismo orden (o ambos sin orden) no
// cambian de posición entre un render y otro.
function compararOrdenCatalogo(a: ProductoPublico, b: ProductoPublico): number {
  if (a.ordenPublico != null && b.ordenPublico != null && a.ordenPublico !== b.ordenPublico) {
    return a.ordenPublico - b.ordenPublico;
  }
  if (a.ordenPublico != null && b.ordenPublico == null) return -1;
  if (a.ordenPublico == null && b.ordenPublico != null) return 1;
  return a.nombre.localeCompare(b.nombre, "es");
}

export interface GrupoCatalogo {
  categoria: string;
  productos: ProductoPublico[];
}

const SIN_CATEGORIA = "Otros";

// Agrupa por categoria_publica (texto libre elegido por el admin, no un enum
// — así que se agrupa tal cual viene, sin normalizar mayúsculas/tildes: dos
// categorías escritas distinto son grupos distintos a propósito, es la señal
// más simple para que el admin note que las tiene que unificar). Los
// productos sin categoría van todos juntos al final bajo "Otros".
export function agruparPorCategoria(productos: ProductoPublico[]): GrupoCatalogo[] {
  const mapa = new Map<string, ProductoPublico[]>();
  for (const p of productos) {
    const categoria = p.categoriaPublica?.trim() || SIN_CATEGORIA;
    const lista = mapa.get(categoria);
    if (lista) lista.push(p);
    else mapa.set(categoria, [p]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a === SIN_CATEGORIA ? 1 : b === SIN_CATEGORIA ? -1 : 0))
    .map(([categoria, productosDeCategoria]) => ({ categoria, productos: productosDeCategoria }));
}

export function productosDestacados(productos: ProductoPublico[]): ProductoPublico[] {
  return productos.filter((p) => p.destacado);
}
