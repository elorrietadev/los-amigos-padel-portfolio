// Capa de transporte del catálogo público (PUBLIC-R4) — mismo patrón que
// reservations.api.ts: una función por llamada, sin decidir loading/estado
// acá (eso vive en useCatalogoPublico.ts).
import { supabase } from "../../lib/supabase";

// productos_publicos: vista mínima (id, nombre, precio_venta,
// categoria_publica, descripcion_publica, imagen_path, destacado,
// orden_publico, en_stock), filtrada server-side por
// mostrar_en_catalogo=true AND activo=true, sin stock_actual/stock_minimo/
// costo — ver r4_catalogo_publico_productos.sql.
export function obtenerProductosPublicos() {
  return supabase.from("productos_publicos").select("*");
}

// Mismo bucket que sube el admin (productos.api.ts): público de lectura, así
// que derivar la URL acá no requiere ninguna llamada de red ni credenciales
// especiales — es determinístico a partir del path guardado.
const BUCKET_CATALOGO = "productos-catalogo";

export function obtenerUrlImagenProducto(path: string): string {
  return supabase.storage.from(BUCKET_CATALOGO).getPublicUrl(path).data.publicUrl;
}
