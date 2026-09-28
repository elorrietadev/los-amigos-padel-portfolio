// Lógica pura del Reporte de Productos/Stock (E6) — sin Supabase, sin XLSX,
// sin estado de componente. Auditado antes de escribir esto (ver informe de
// la sesión): `productos` no tiene ninguna columna de costo, y el sistema es
// FIFO estricto por lote (registrar_venta consume lotes por `creado asc` y
// congela el costo en venta_items al vender) — no existe un "costo promedio
// oficial" a nivel producto. El costo que este reporte muestra por producto
// es el promedio ponderado de los LOTES con stock remanente hoy, derivado de
// costos reales, no una cifra inventada.

import type { LoteStockCrudo } from "./stock.api";
import type {
  FilaLoteStock,
  FilaProductoStock,
  Producto,
  TotalesLotesStock,
  TotalesProductosStock,
} from "./stock.types";

function num(v: number | null | undefined): number {
  return Number(v || 0);
}

// Mismo criterio de redondeo que calcularCostoUnitario (productos.logic.ts)
// y la columna generada lotes.costo_unitario: 2 decimales, moneda ARS.
function redondear2(v: number): number {
  return Math.round(v * 100) / 100;
}

// --- Hoja Productos -----------------------------------------------------

// stock/precio siempre ganan aunque un producto no tenga ningún lote (alta
// manual sin reposición todavía, o legado sin lotes): costo/valor/margen
// quedan en 0 en vez de indefinido, para que sumen limpio en los totales sin
// requerir un caso especial "sin dato" en la celda del Excel.
export function construirFilasProductosStock(
  productos: Producto[],
  lotes: LoteStockCrudo[],
): FilaProductoStock[] {
  const valorStockCostoPorProducto = new Map<string, number>();
  for (const l of lotes) {
    const actual = valorStockCostoPorProducto.get(l.producto_id) ?? 0;
    valorStockCostoPorProducto.set(l.producto_id, actual + l.cantidad_restante * num(l.costo_unitario));
  }

  return productos
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((p) => {
      const stock = p.stock_actual;
      const precioVenta = num(p.precio_venta);
      const valorStockCosto = redondear2(valorStockCostoPorProducto.get(p.id) ?? 0);
      const costoUnitarioStock = stock > 0 ? redondear2(valorStockCosto / stock) : 0;
      const valorPotencialVenta = stock * precioVenta;
      const margenUnitario = redondear2(precioVenta - costoUnitarioStock);
      const margenPotencial = valorPotencialVenta - valorStockCosto;
      return {
        nombre: p.nombre,
        activo: p.activo,
        stock,
        precioVenta,
        costoUnitarioStock,
        valorStockCosto,
        valorPotencialVenta,
        margenUnitario,
        margenPotencial,
      };
    });
}

// Sobre TODOS los productos recibidos (activos e inactivos incluidos): el
// stock físico existe sin importar si el producto sigue a la venta — pedido
// explícito de D6/E6, distinto del banner de stock bajo de ProductosView
// (que sí excluye inactivos, pero es una decisión de esa vista, no de este
// reporte de inventario).
export function calcularTotalesProductosStock(filas: FilaProductoStock[]): TotalesProductosStock {
  return filas.reduce<TotalesProductosStock>(
    (acc, f) => ({
      stock: acc.stock + f.stock,
      valorStockCosto: acc.valorStockCosto + f.valorStockCosto,
      valorPotencialVenta: acc.valorPotencialVenta + f.valorPotencialVenta,
      margenPotencial: acc.margenPotencial + f.margenPotencial,
    }),
    { stock: 0, valorStockCosto: 0, valorPotencialVenta: 0, margenPotencial: 0 },
  );
}

// --- Hoja Lotes ----------------------------------------------------------

// Orden: producto (nombre) y dentro de cada producto por fecha de creación
// ascendente — el mismo orden FIFO que usa registrar_venta (`order by creado
// asc`) para decidir qué lote se consume primero, así la hoja se lee en el
// mismo orden en que efectivamente se va a descontar.
export function construirFilasLotesStock(lotes: LoteStockCrudo[]): FilaLoteStock[] {
  return lotes
    .slice()
    .sort((a, b) => a.productoNombre.localeCompare(b.productoNombre) || a.creado.localeCompare(b.creado))
    .map((l) => {
      const costoUnitario = num(l.costo_unitario);
      return {
        producto: l.productoNombre,
        fecha: l.creado.slice(0, 10),
        cantidadInicial: l.cantidad_inicial,
        cantidadRestante: l.cantidad_restante,
        cantidadConsumida: l.cantidad_inicial - l.cantidad_restante,
        costoUnitario,
        valorRestante: redondear2(l.cantidad_restante * costoUnitario),
      };
    });
}

export function calcularTotalesLotesStock(filas: FilaLoteStock[]): TotalesLotesStock {
  return filas.reduce<TotalesLotesStock>(
    (acc, f) => ({
      cantidadRestante: acc.cantidadRestante + f.cantidadRestante,
      valorRestante: acc.valorRestante + f.valorRestante,
    }),
    { cantidadRestante: 0, valorRestante: 0 },
  );
}
