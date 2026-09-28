// Capa de transporte de Productos (D1) — mismo patrón que reservas.api.ts/
// turnosFijos.api.ts: una función por llamada, sin decidir loading/cache/
// guards/patch local — eso vive en useProductos.ts.
//
// admin.html:603-606 (cargarProductos), 898-900 (guardarProducto, alta/
// edición unificadas ahí; acá van separadas porque no hay un modal único con
// `id: null` que las una) y 945-952 (guardarReposicion -> RPC reponer_stock).
// Backend sin tocar: mismas 3 tablas relevantes (`productos`, `lotes` vía el
// RPC) y el mismo RPC `reponer_stock` que ya existía — D1 es reescritura de
// frontend únicamente (decisión ya aprobada en D0/D1).

import { supabase } from "../../../lib/supabase";

export function obtenerProductos() {
  void reintentarLimpiezaImagenes();
  return supabase.from("productos").select("*").order("nombre");
}

// admin.html:900 (rama alta de guardarProducto). `.select().single()` para
// patchear el catálogo local con la fila real (incluye `id`/`creado`/
// `stock_actual` default) sin refetch — mismo criterio que crearTurnoFijo.
export function crearProducto(nombre: string, precioVenta: number, stockMinimo: number) {
  return supabase
    .from("productos")
    .insert([{ nombre, precio_venta: precioVenta, stock_minimo: stockMinimo }])
    .select()
    .single();
}

// admin.html:899 (rama edición de guardarProducto). Nunca toca `stock_actual`
// (eso es exclusivo de reponerStock) ni `activo` (eso es cambiarActivoProducto,
// D2 — una acción de propósito único, separada de esta edición).
export function actualizarProducto(id: string, nombre: string, precioVenta: number, stockMinimo: number) {
  return supabase
    .from("productos")
    .update({ nombre, precio_venta: precioVenta, stock_minimo: stockMinimo })
    .eq("id", id)
    .select()
    .single();
}

// D2 — activar/desactivar un producto (toggle, sin RPC: RLS ya permite este
// UPDATE a `authenticated` sin restricción por columna, mismo `.update()`
// directo que actualizarProducto). Nunca borra la fila ni toca ningún otro
// campo — reversible con un segundo llamado.
export function cambiarActivoProducto(id: string, activo: boolean) {
  return supabase.from("productos").update({ activo }).eq("id", id).select().single();
}

// admin.html:945-952 (guardarReposicion). El RPC devuelve solo el id del lote
// nuevo (uuid) — no se usa para nada en la UI, así que no hace falta pedirlo
// de vuelta con ningún select adicional.
//
// `nota`/`precioVentaSimulado` viajan como `string | null`/`number | null`
// (así los maneja el resto del dominio), pero los Args generados del RPC
// (`p_nota?: string`, `p_precio_venta_simulado?: number`, sin `| null`) no
// aceptan `null` explícito — se traducen acá a `undefined` (clave omitida),
// que para Postgres equivale exactamente a su propio DEFAULT NULL.
export function reponerStock(
  productoId: string,
  cantidad: number,
  costoTotal: number,
  nota: string | null,
  precioVentaSimulado: number | null,
  actualizarPrecioVenta: boolean,
) {
  return supabase.rpc("reponer_stock", {
    p_producto_id: productoId,
    p_cantidad: cantidad,
    p_costo_total: costoTotal,
    p_nota: nota ?? undefined,
    p_precio_venta_simulado: precioVentaSimulado ?? undefined,
    p_actualizar_precio_venta: actualizarPrecioVenta,
  });
}

// PUBLIC-R4 — campos de catálogo público, separados de actualizarProducto
// (mismo criterio que cambiarActivoProducto: una acción de propósito único
// en vez de agrandar la firma de la edición base). ProductoFormModal llama a
// ambas funciones en un solo "Guardar" (ver confirmarGuardarProducto en
// ProductosView) — dos UPDATE separados, pero una sola interacción del
// admin.
export interface DatosCatalogoPublico {
  mostrarEnCatalogo: boolean;
  imagenPath: string | null;
  categoriaPublica: string | null;
  descripcionPublica: string | null;
  destacado: boolean;
  ordenPublico: number | null;
}

export function actualizarCatalogoPublico(id: string, datos: DatosCatalogoPublico) {
  return supabase
    .from("productos")
    .update({
      mostrar_en_catalogo: datos.mostrarEnCatalogo,
      imagen_path: datos.imagenPath,
      categoria_publica: datos.categoriaPublica,
      descripcion_publica: datos.descripcionPublica,
      destacado: datos.destacado,
      orden_publico: datos.ordenPublico,
    })
    .eq("id", id)
    .select()
    .single();
}

// PUBLIC-R4 — Storage del catálogo. Bucket público de solo-lectura
// (productos-catalogo, ver r4_catalogo_publico_productos.sql); subir/
// reemplazar/borrar están gateados por RLS de storage.objects a is_admin()
// (nunca por este código de cliente, que es solo transporte).
//
// Nombre de archivo generado (nunca el nombre original del usuario): evita
// colisiones entre productos distintos y cualquier caracter problemático en
// el path. Un producto nuevo (sin id todavía) puede subir imagen antes de
// guardar porque el path no depende de producto_id.
const BUCKET_CATALOGO = "productos-catalogo";

function extensionDeArchivo(nombre: string): string {
  const punto = nombre.lastIndexOf(".");
  return punto === -1 ? "jpg" : nombre.slice(punto + 1).toLowerCase();
}

export function obtenerUrlImagenProducto(path: string): string {
  return supabase.storage.from(BUCKET_CATALOGO).getPublicUrl(path).data.publicUrl;
}

export async function subirImagenProducto(archivo: File): Promise<{ path: string | null; error: string | null }> {
  const path = `${crypto.randomUUID()}.${extensionDeArchivo(archivo.name)}`;
  try {
  const { error } = await supabase.storage
    .from(BUCKET_CATALOGO)
    .upload(path, archivo, { contentType: archivo.type, upsert: false });
  if (error) {
    await borrarImagenProducto(path);
    return { path: null, error: error.message };
  }
  return { path, error: null };
  } catch {
    await borrarImagenProducto(path);
    return { path: null, error: "No se pudo subir la imagen." };
  }
}

// Storage and product writes are not one transaction. Only discarded
// temporaries / confirmed obsolete paths enter this queue. Failed removals
// survive a reload and are retried on the next catalogue load or reconnect.
const LIMPIEZA_KEY = "admin:imagenes-productos:limpieza";
const pendientes = new Set<string>();
const borrando = new Set<string>();
function guardarPendientes() {
  try { localStorage.setItem(LIMPIEZA_KEY, JSON.stringify([...pendientes])); } catch { /* storage unavailable */ }
}
async function eliminarPendiente(path: string) {
  if (borrando.has(path)) return;
  borrando.add(path);
  try {
    const { error } = await supabase.storage.from(BUCKET_CATALOGO).remove([path]);
    if (error) throw error;
    pendientes.delete(path);
  } catch {
    console.warn("Limpieza de imagen pendiente; se reintentará al cargar el catálogo.");
  } finally { borrando.delete(path); guardarPendientes(); }
}
async function reintentarLimpiezaImagenes() {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(LIMPIEZA_KEY) ?? "[]");
    if (Array.isArray(saved)) saved.forEach((path) => { if (typeof path === "string") pendientes.add(path); });
  } catch { /* storage unavailable */ }
  await Promise.all([...pendientes].map(eliminarPendiente));
}
if (typeof window !== "undefined") window.addEventListener("online", () => { void reintentarLimpiezaImagenes(); });

export async function borrarImagenProducto(path: string): Promise<void> {
  pendientes.add(path);
  guardarPendientes();
  await eliminarPendiente(path);
}
