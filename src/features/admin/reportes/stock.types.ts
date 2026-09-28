// Tipos del Reporte de Productos/Stock (E6) — foto del momento, sin rango de
// fechas. Reusa `Producto` de productos.logic.ts donde el shape es idéntico,
// igual que reportes.types.ts hace con caja/reservas.

import type { Producto } from "../productos/productos.logic";

export type { Producto };

// --- Hoja Productos ---------------------------------------------------

// No existe un "costo unitario oficial" a nivel producto en el modelo: el
// sistema es FIFO estricto por lote (ver registrar_venta), cada lote tiene su
// propio costo_unitario y no hay ninguna columna de costo en `productos`.
// costoUnitarioStock/valorStockCosto se derivan de los LOTES reales con stock
// remanente (ver stock.logic.ts::construirFilasProductosStock) — no son un
// promedio histórico de todas las compras, sino el costo real de lo que
// físicamente sigue en stock hoy.
export interface FilaProductoStock {
  nombre: string;
  activo: boolean;
  stock: number;
  precioVenta: number;
  // Σ(lote.cantidad_restante × lote.costo_unitario) / stock — 0 si stock=0
  // (ningún lote con cantidad_restante>0, no hay costo que promediar).
  costoUnitarioStock: number;
  // Σ(lote.cantidad_restante × lote.costo_unitario) de los lotes del producto.
  valorStockCosto: number;
  // stock × precioVenta.
  valorPotencialVenta: number;
  // precioVenta - costoUnitarioStock (informativo, redondeado a 2 decimales).
  margenUnitario: number;
  // valorPotencialVenta - valorStockCosto (exacto: resta de los dos totales,
  // no stock×margenUnitario, para no acumular el redondeo de margenUnitario).
  margenPotencial: number;
}

export interface TotalesProductosStock {
  stock: number;
  valorStockCosto: number;
  valorPotencialVenta: number;
  margenPotencial: number;
}

// --- Hoja Lotes ----------------------------------------------------------

// Solo lotes con cantidad_restante > 0: es un reporte de INVENTARIO ACTUAL,
// no un historial de compras — un lote agotado no aporta a "qué hay en
// stock hoy" (ver stock.api.ts::obtenerLotesStockCompleto).
export interface FilaLoteStock {
  producto: string;
  fecha: string; // YYYY-MM-DD — construirReporteStock.ts la convierte a serial Excel
  cantidadInicial: number;
  cantidadRestante: number;
  cantidadConsumida: number;
  costoUnitario: number;
  valorRestante: number;
}

export interface TotalesLotesStock {
  cantidadRestante: number;
  valorRestante: number;
}

// --- Orquestación (exportarStock.ts) ---------------------------------------

export interface DatosReporteStock {
  fechaGeneracion: string; // YYYY-MM-DD, fecha de negocio Argentina
  filasProductos: FilaProductoStock[];
  totalesProductos: TotalesProductosStock;
  filasLotes: FilaLoteStock[];
  totalesLotes: TotalesLotesStock;
}

export interface ResultadoExportarStock {
  ok: boolean;
  error?: string;
}
