// Tipos del catálogo público (PUBLIC-R4). ProductoPublicoRow sale directo de
// database.types.ts (generado desde la vista real productos_publicos, sin
// escribir nada a mano); ProductoPublico es la forma ya procesada y
// no-nullable que consume el resto de esta feature — mismo criterio que
// reservations.types.ts (ReservaProcesada a partir de ReservaPublica).
import type { Tables } from "../../types/database.types";

export type ProductoPublicoRow = Tables<"productos_publicos">;

// La vista es una fuente derivada sin NOT NULL declarado en el tipo
// generado, pero una fila real nunca puede tener id/nombre/precio_venta
// nulos (son NOT NULL en la tabla base `productos`) — procesarProductosPublicos
// en catalogo.logic.ts es el único lugar donde se cruza ese nullable ->
// no-nullable, con un filtro explícito (nunca un cast a ciegas).
export interface ProductoPublico {
  id: string;
  nombre: string;
  precioVenta: number;
  categoriaPublica: string | null;
  descripcionPublica: string | null;
  imagenPath: string | null;
  destacado: boolean;
  ordenPublico: number | null;
  // Booleano derivado server-side (stock_actual > 0) — nunca el número real
  // de stock, que es información interna (ver r4_catalogo_publico_productos.sql).
  enStock: boolean;
}
