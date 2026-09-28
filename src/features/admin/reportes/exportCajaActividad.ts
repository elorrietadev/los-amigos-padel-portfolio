// Orquestación del Reporte de Caja y Actividad — FINAL-F6. Único archivo del
// reporte que toca Supabase.
//
// Cada fuente se lee UNA vez y alimenta a la vez su hoja de detalle y el
// Resumen: el Resumen es calcularCajaRango (la MISMA función que usa la
// pantalla de Caja) sobre exactamente las filas que se escriben en las hojas
// financieras. Así Resumen = Caja = suma de las hojas por construcción, y el
// test de reconciliación lo verifica contra la base al centavo.
//
// Todo-o-nada: si CUALQUIER fuente falla, no se genera archivo.

import { calcularCajaRango } from "../caja/caja.logic";
import {
  obtenerDevolucionesReporte,
  obtenerMovimientosReporte,
  obtenerReservasActividad,
  obtenerVentasReporteCompleto,
} from "./reportes.api";
import {
  construirFilasActividad,
  construirFilasDevoluciones,
  construirFilasPagos,
  construirFilasVentas,
  devolucionesParaCaja,
  movimientosParaCaja,
  ventasParaCaja,
} from "./reportes.logic";
import type { DatosReporte, RangoFechas, ResultadoExportarReporte } from "./reportes.types";

const MENSAJE_ERROR = "No se pudo generar el reporte. Probá de nuevo.";

export async function armarDatosReporte(rango: RangoFechas, ahora: number, nombreCancha: string): Promise<DatosReporte | null> {
  const { desde, hasta } = rango;
  const [movsRes, ventasRes, devolucionesRes, reservasRes] = await Promise.all([
    obtenerMovimientosReporte(desde, hasta),
    obtenerVentasReporteCompleto(desde, hasta),
    obtenerDevolucionesReporte(desde, hasta),
    obtenerReservasActividad(desde, hasta),
  ]);
  if (movsRes.error || ventasRes.error || devolucionesRes.error || reservasRes.error) return null;

  const movs = movsRes.data ?? [];
  const ventas = ventasRes.data ?? [];
  const devoluciones = devolucionesRes.data ?? [];
  return {
    desde,
    hasta,
    nombreCancha,
    resumen: calcularCajaRango(movimientosParaCaja(movs), ventasParaCaja(ventas), devolucionesParaCaja(devoluciones), desde, hasta),
    filasPagos: construirFilasPagos(movs),
    filasVentas: construirFilasVentas(ventas),
    filasDevoluciones: construirFilasDevoluciones(devoluciones),
    filasActividad: construirFilasActividad(reservasRes.data ?? [], ahora),
  };
}

export async function exportarCajaActividad(
  rango: RangoFechas,
  ahora: number,
  nombreCancha: string,
  generarArchivo: (datos: DatosReporte) => void | Promise<void> = async (datos) => {
    const { construirWorkbook, descargarWorkbook } = await import("./construirReporteExcel");
    descargarWorkbook(construirWorkbook(datos), rango);
  },
): Promise<ResultadoExportarReporte> {
  const datos = await armarDatosReporte(rango, ahora, nombreCancha);
  if (!datos) return { ok: false, error: MENSAJE_ERROR };
  await generarArchivo(datos);
  return { ok: true };
}
