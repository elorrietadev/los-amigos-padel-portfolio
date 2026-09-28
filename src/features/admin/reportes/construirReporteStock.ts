// Armado puro del workbook del Reporte de Productos/Stock (E6) — mismo
// criterio de capas que construirReporteExcel.ts (reporte de caja): sin
// Supabase, para poder ejecutarse aislado en un script de inspección. La
// construcción del workbook no está cubierta por tests unitarios (se valida
// con inspección real del .xlsx, igual que el reporte de caja) — la lógica
// de datos sí está cubierta en stock.logic.test.ts.
//
// Sin freeze panes: deuda ya conocida y aceptada de xlsx-js-style@1.2.0 (no
// serializa `!freeze`, ver construirReporteExcel.ts) — no se reintenta acá.

import XLSX from "xlsx-js-style";
import {
  anchosColumnas,
  aplicarAutofiltro,
  aplicarEstiloFila,
  aplicarFormatoColumna,
  estiloCelda,
  estiloEncabezado,
  estiloEstado,
  estiloSubtitulo,
  estiloTitulo,
  estiloTotales,
  fechaISOaSerialExcel,
  FORMATO_FECHA,
  FORMATO_MONEDA,
} from "./excelStyles";
import type { DatosReporteStock } from "./stock.types";

function formatearFechaLegible(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// --- Hoja PRODUCTOS -------------------------------------------------------

const ENCABEZADOS_PRODUCTOS = [
  "PRODUCTO",
  "ESTADO",
  "STOCK",
  "PRECIO VENTA",
  "COSTO UNITARIO (STOCK)",
  "VALOR STOCK (COSTO)",
  "VALOR POTENCIAL (VENTA)",
  "MARGEN UNITARIO",
  "MARGEN POTENCIAL",
];

function armarHojaProductos(datos: DatosReporteStock): XLSX.WorkSheet {
  const filas: unknown[][] = [];
  filas.push([`LOS AMIGOS PÁDEL — STOCK DE PRODUCTOS`]);
  filas.push([`Generado el ${formatearFechaLegible(datos.fechaGeneracion)}`]);
  filas.push([]);
  filas.push(ENCABEZADOS_PRODUCTOS);

  datos.filasProductos.forEach((f) => {
    filas.push([
      f.nombre,
      f.activo ? "Activo" : "Inactivo",
      f.stock,
      f.precioVenta,
      f.costoUnitarioStock,
      f.valorStockCosto,
      f.valorPotencialVenta,
      f.margenUnitario,
      f.margenPotencial,
    ]);
  });

  const filaEncabezado = 4;
  const primeraFilaDatos = 5;
  const ultimaFilaDatos = primeraFilaDatos + datos.filasProductos.length - 1;
  const filaTotales = ultimaFilaDatos + 1;
  const columnas = ENCABEZADOS_PRODUCTOS.length;
  const t = datos.totalesProductos;

  filas.push(["TOTALES", "", t.stock, "", "", t.valorStockCosto, t.valorPotencialVenta, "", t.margenPotencial]);

  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columnas - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnas - 1 } },
  ];
  aplicarEstiloFila(ws, 1, columnas, estiloTitulo());
  aplicarEstiloFila(ws, 2, columnas, estiloSubtitulo());
  // Encabezados en hasta 2 líneas: el botón de AutoFilter ocupa ~17 px abajo a
  // la derecha de cada celda y taparía el texto en una sola línea centrada.
  const encabezado = estiloEncabezado();
  aplicarEstiloFila(ws, filaEncabezado, columnas, { ...encabezado, alignment: { ...encabezado.alignment, wrapText: true } });
  ws["!rows"] = [];
  ws["!rows"][filaEncabezado - 1] = { hpt: 30 };

  const columnasCentradas = new Set([1]);
  for (let r = primeraFilaDatos; r <= ultimaFilaDatos; r++) {
    const alternada = (r - primeraFilaDatos) % 2 === 0;
    for (let c = 0; c < columnas; c++) {
      const celda = XLSX.utils.encode_cell({ r: r - 1, c });
      if (ws[celda]) ws[celda].s = estiloCelda(alternada, columnasCentradas.has(c));
    }
    const celdaEstado = XLSX.utils.encode_cell({ r: r - 1, c: 1 });
    if (ws[celdaEstado]) ws[celdaEstado].s = estiloEstado(String(ws[celdaEstado].v ?? ""));
  }

  [3, 4, 5, 6, 7, 8].forEach((c) => aplicarFormatoColumna(ws, c, primeraFilaDatos, filaTotales, FORMATO_MONEDA));

  for (let c = 0; c < columnas; c++) {
    const celda = XLSX.utils.encode_cell({ r: filaTotales - 1, c });
    if (ws[celda]) ws[celda].s = estiloTotales(c === 0);
  }

  aplicarAutofiltro(ws, filaEncabezado, ultimaFilaDatos, columnas);
  // Anchos medidos con Arial 10 bold + botón de filtro (ver encabezados arriba).
  anchosColumnas(ws, [28, 14, 13, 13, 18, 16, 20, 16, 18]);
  return ws;
}

// --- Hoja LOTES ------------------------------------------------------------

const ENCABEZADOS_LOTES = [
  "PRODUCTO",
  "FECHA",
  "CANT. INICIAL",
  "CANT. RESTANTE",
  "CANT. CONSUMIDA",
  "COSTO UNITARIO",
  "VALOR RESTANTE",
];

function armarHojaLotes(datos: DatosReporteStock): XLSX.WorkSheet {
  const filas: unknown[][] = [];
  filas.push([`LOS AMIGOS PÁDEL — LOTES EN STOCK`]);
  filas.push([`Generado el ${formatearFechaLegible(datos.fechaGeneracion)}`]);
  filas.push([]);
  filas.push(ENCABEZADOS_LOTES);

  datos.filasLotes.forEach((f) => {
    filas.push([
      f.producto,
      fechaISOaSerialExcel(f.fecha),
      f.cantidadInicial,
      f.cantidadRestante,
      f.cantidadConsumida,
      f.costoUnitario,
      f.valorRestante,
    ]);
  });

  const filaEncabezado = 4;
  const primeraFilaDatos = 5;
  const ultimaFilaDatos = primeraFilaDatos + datos.filasLotes.length - 1;
  const filaTotales = ultimaFilaDatos + 1;
  const columnas = ENCABEZADOS_LOTES.length;
  const t = datos.totalesLotes;

  filas.push(["TOTALES", "", "", t.cantidadRestante, "", "", t.valorRestante]);

  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columnas - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnas - 1 } },
  ];
  aplicarEstiloFila(ws, 1, columnas, estiloTitulo());
  aplicarEstiloFila(ws, 2, columnas, estiloSubtitulo());
  aplicarEstiloFila(ws, filaEncabezado, columnas, estiloEncabezado());

  for (let r = primeraFilaDatos; r <= ultimaFilaDatos; r++) {
    const alternada = (r - primeraFilaDatos) % 2 === 0;
    for (let c = 0; c < columnas; c++) {
      const celda = XLSX.utils.encode_cell({ r: r - 1, c });
      if (ws[celda]) ws[celda].s = estiloCelda(alternada, false);
    }
  }

  aplicarFormatoColumna(ws, 1, primeraFilaDatos, ultimaFilaDatos, FORMATO_FECHA);
  [5, 6].forEach((c) => aplicarFormatoColumna(ws, c, primeraFilaDatos, filaTotales, FORMATO_MONEDA));

  for (let c = 0; c < columnas; c++) {
    const celda = XLSX.utils.encode_cell({ r: filaTotales - 1, c });
    if (ws[celda]) ws[celda].s = estiloTotales(c === 0);
  }

  aplicarAutofiltro(ws, filaEncabezado, ultimaFilaDatos, columnas);
  anchosColumnas(ws, [26, 12, 12, 13, 14, 14, 15]);
  return ws;
}

// --- Workbook completo + descarga -------------------------------------------

// Hoja Lotes se agrega siempre, incluso vacía (0 lotes con stock remanente es
// información real y válida — "no hay lotes cargados todavía"), igual
// criterio que las otras hojas de este proyecto nunca ocultan una hoja por
// estar vacía.
export function construirWorkbookStock(datos: DatosReporteStock): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, armarHojaProductos(datos), "Productos");
  XLSX.utils.book_append_sheet(wb, armarHojaLotes(datos), "Lotes");
  return wb;
}

const PREFIJO_ARCHIVO = "Los_Amigos_Padel_Stock";

export function nombreArchivoStock(fechaGeneracion: string): string {
  return `${PREFIJO_ARCHIVO}_${fechaGeneracion}.xlsx`;
}

export function descargarWorkbookStock(wb: XLSX.WorkBook, fechaGeneracion: string): void {
  XLSX.writeFile(wb, nombreArchivoStock(fechaGeneracion));
}
