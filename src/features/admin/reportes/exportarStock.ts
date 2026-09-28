// Orquestación del Reporte de Productos/Stock (E6) — fetch de las 2 fuentes
// + armado de datos puros + generación del archivo. Mismo criterio todo-o-
// nada que exportCajaActividad.ts: si CUALQUIERA de las 2 queries falla, no
// se arma ni se descarga ningún archivo.

import { formatearISO } from "../../../lib/datetime";
import { obtenerLotesStockCompleto, obtenerProductos } from "./stock.api";
import {
  calcularTotalesLotesStock,
  calcularTotalesProductosStock,
  construirFilasLotesStock,
  construirFilasProductosStock,
} from "./stock.logic";
import type { DatosReporteStock, ResultadoExportarStock } from "./stock.types";

const MENSAJE_ERROR = "No se pudo generar el reporte de stock. Probá de nuevo.";

// `generarArchivo` inyectable a propósito, mismo espíritu que
// exportarCajaActividad — los tests verifican el comportamiento todo-o-nada
// sin tocar xlsx-js-style ni el DOM. Import dinámico de construirReporteStock
// (y por lo tanto de xlsx-js-style, ~grueso del chunk admin) para que solo se
// cargue cuando el usuario efectivamente exporta, no al entrar al panel.
export async function exportarStock(
  ahora: number,
  generarArchivo: (datos: DatosReporteStock) => void | Promise<void> = async (datos) => {
    const { construirWorkbookStock, descargarWorkbookStock } = await import("./construirReporteStock");
    descargarWorkbookStock(construirWorkbookStock(datos), datos.fechaGeneracion);
  },
): Promise<ResultadoExportarStock> {
  const [productosRes, lotesRes] = await Promise.all([obtenerProductos(), obtenerLotesStockCompleto()]);

  if (productosRes.error || lotesRes.error) {
    return { ok: false, error: MENSAJE_ERROR };
  }

  const filasProductos = construirFilasProductosStock(productosRes.data ?? [], lotesRes.data ?? []);
  const totalesProductos = calcularTotalesProductosStock(filasProductos);
  const filasLotes = construirFilasLotesStock(lotesRes.data ?? []);
  const totalesLotes = calcularTotalesLotesStock(filasLotes);

  const datos: DatosReporteStock = {
    fechaGeneracion: formatearISO(new Date(ahora)),
    filasProductos,
    totalesProductos,
    filasLotes,
    totalesLotes,
  };

  await generarArchivo(datos);
  return { ok: true };
}
