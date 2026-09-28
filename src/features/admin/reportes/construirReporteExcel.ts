// Armado del workbook del Reporte de Caja y Actividad — FINAL-F6. No importa
// nada que toque Supabase (se puede ejecutar aislado en tests).
//
// Hojas:
//   1. Resumen             — CADA importe es una FÓRMULA sobre las hojas
//                            financieras (SUMIFS/SUM/COUNTA), con su valor ya
//                            calculado (el mismo de Caja, en centavos) como
//                            caché. Excel recalcula y tiene que dar lo mismo.
//   2. Pagos de reservas   — movimientos (cobro/reintegro/corrección) del rango
//   3. Ventas              — ítems vendidos del rango (pago una vez por venta)
//   4. Devoluciones        — devoluciones del rango (aunque la venta sea de otro)
//   5. Actividad operativa — turnos del rango por fecha del TURNO. No explica
//                            el cierre: sin totales de dinero.
// Todas las financieras filtran por fecha contable (día real del movimiento en
// Buenos Aires), igual que Caja.
//
// Celdas vacías = null (no ""), para que COUNTA/SUM no las cuenten.
// Montos: centavos → pesos con UNA división al escribir la celda, formato con
// 2 decimales (el formato viejo "$ #,##0" ocultaba centavos).
//
// Deuda conocida: xlsx-js-style@1.2.0 no serializa freeze panes ni
// orientación de página (ver historia de este archivo).

import XLSX from "xlsx-js-style";
import { desdeCentavos, type Centavos } from "../../../lib/dinero";
import {
  anchosColumnas,
  aplicarAutofiltro,
  aplicarEstiloFila,
  bordeFino,
  type CellStyle,
  estiloCelda,
  estiloEstado,
  estiloSubtitulo,
  estiloTitulo,
  estiloTotales,
  fechaISOaSerialExcel,
  FORMATO_FECHA,
} from "./excelStyles";
import type { DatosReporte, RangoFechas } from "./reportes.types";

export const FORMATO_MONEDA_EXACTO = "$ #,##0.00";
export const HOJAS = {
  resumen: "Resumen",
  pagos: "Pagos de reservas",
  ventas: "Ventas",
  devoluciones: "Devoluciones",
  actividad: "Actividad operativa",
} as const;

export const PRIMERA_FILA_DATOS = 5;

function formatearFechaLegible(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const estiloEncabezadoTabla = {
  font: { name: "Arial", sz: 9, bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "2E7D32" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: bordeFino,
};

// Última fila del rango de datos de una hoja con n filas: si no hay filas, el
// rango apunta a la fila en blanco que separa datos y totales (suma 0).
export function ultimaFilaRango(n: number): number {
  return Math.max(PRIMERA_FILA_DATOS, PRIMERA_FILA_DATOS + n - 1);
}

function rango(hoja: string, col: string, n: number): string {
  return `'${hoja}'!$${col}$${PRIMERA_FILA_DATOS}:$${col}$${ultimaFilaRango(n)}`;
}

type Celda = string | number | null;

interface TablaSpec {
  titulo: string;
  subtitulo: string;
  nota: string;
  encabezados: string[];
  filas: Celda[][];
  columnasMoneda: number[];
  columnasFecha: number[];
  columnasCentradas: number[];
  anchos: number[];
  // Columnas con fila TOTAL (=SUM del rango) y su valor en centavos.
  totales?: { etiquetaCol: number; columnas: Array<{ col: number; valor: Centavos }> };
  estadoCol?: number;
}

// El título va combinado a lo ancho de la hoja y sin wrap: si no entra, Excel
// lo recorta por los costados. Se achica la fuente desde el tamaño base hasta
// que entre en el ancho de sus columnas. Estimación conservadora: 1 wch ≈ 7 px
// y una mayúscula Arial bold ≈ 0,88 px por punto de fuente (medido ≈ 0,8).
function estiloTituloQueEntra(titulo: string, anchos: number[]): CellStyle {
  const base = estiloTitulo();
  const disponiblePx = anchos.reduce((a, w) => a + w, 0) * 7 - 10;
  const sz = Math.max(10, Math.min(base.font.sz, Math.floor(disponiblePx / (titulo.length * 0.88))));
  return { ...base, font: { ...base.font, sz } };
}

function armarTabla(spec: TablaSpec): XLSX.WorkSheet {
  const n = spec.filas.length;
  const cols = spec.encabezados.length;
  const aoa: Celda[][] = [[spec.titulo], [spec.subtitulo], [spec.nota], spec.encabezados, ...spec.filas];
  const ws = XLSX.utils.aoa_to_sheet(aoa as unknown[][]);
  ws["!merges"] = [0, 1, 2].map((r) => ({ s: { r, c: 0 }, e: { r, c: cols - 1 } }));
  // Las filas-banner necesitan celdas en todas las columnas para el borde.
  for (let r = 0; r < 3; r++) for (let c = 1; c < cols; c++) ws[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: "" };
  aplicarEstiloFila(ws, 1, cols, estiloTituloQueEntra(spec.titulo, spec.anchos));
  aplicarEstiloFila(ws, 2, cols, estiloSubtitulo());
  aplicarEstiloFila(ws, 3, cols, { ...estiloSubtitulo(), alignment: { horizontal: "left", vertical: "center", wrapText: true } });
  ws["!rows"] = [{ hpt: 26 }, { hpt: 16 }, { hpt: 30 }];
  aplicarEstiloFila(ws, 4, cols, estiloEncabezadoTabla);

  const centradas = new Set(spec.columnasCentradas);
  for (let i = 0; i < n; i++) {
    const r = PRIMERA_FILA_DATOS - 1 + i;
    for (let c = 0; c < cols; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const valor = spec.filas[i][c];
      if (valor === null || valor === undefined) continue;
      const cell = ws[addr];
      if (!cell) continue;
      cell.s = estiloCelda(i % 2 === 0, centradas.has(c));
      if (spec.columnasMoneda.includes(c) && typeof valor === "number") {
        cell.t = "n";
        cell.z = FORMATO_MONEDA_EXACTO;
      }
      if (spec.columnasFecha.includes(c) && typeof valor === "number") cell.z = FORMATO_FECHA;
      if (spec.estadoCol === c) cell.s = estiloEstado(String(valor));
    }
  }

  if (spec.totales) {
    const filaTot = PRIMERA_FILA_DATOS + n + 1; // una fila en blanco entre datos y totales
    const etiqueta = XLSX.utils.encode_cell({ r: filaTot - 1, c: spec.totales.etiquetaCol });
    ws[etiqueta] = { t: "s", v: "TOTAL", s: estiloTotales(false) };
    for (const { col, valor } of spec.totales.columnas) {
      const letra = XLSX.utils.encode_col(col);
      ws[XLSX.utils.encode_cell({ r: filaTot - 1, c: col })] = {
        t: "n",
        v: desdeCentavos(valor),
        f: `SUM(${letra}${PRIMERA_FILA_DATOS}:${letra}${ultimaFilaRango(n)})`,
        z: FORMATO_MONEDA_EXACTO,
        s: estiloTotales(false),
      };
    }
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filaTot - 1, c: cols - 1 } });
  }

  aplicarAutofiltro(ws, 4, Math.max(4, PRIMERA_FILA_DATOS + n - 1), cols);
  anchosColumnas(ws, spec.anchos);
  return ws;
}

const pesos = (c: Centavos | "") => (c === "" ? null : desdeCentavos(c));
const serial = (iso: string) => (iso ? fechaISOaSerialExcel(iso) : null);
const sumC = <T>(xs: ReadonlyArray<T>, f: (x: T) => Centavos | "") => xs.reduce((a, x) => a + (f(x) === "" ? 0 : (f(x) as Centavos)), 0);

// --- Hojas financieras ------------------------------------------------------

function subtitulo(datos: DatosReporte, extra: string) {
  return `${formatearFechaLegible(datos.desde)} a ${formatearFechaLegible(datos.hasta)} · ${extra}`;
}

const NOTA_CONTABLE =
  "Criterio contable: cada importe cuenta por la fecha y hora REALES del movimiento. La fecha del turno es informativa.";

function hojaPagos(datos: DatosReporte): XLSX.WorkSheet {
  const f = datos.filasPagos;
  return armarTabla({
    titulo: `${datos.nombreCancha.toUpperCase()} — PAGOS DE RESERVAS`,
    subtitulo: subtitulo(datos, `${f.length} movimiento(s)`),
    nota: `${NOTA_CONTABLE} Reintegros e importes negativos restan.`,
    encabezados: ["FECHA", "HORA", "TIPO", "MEDIO", "IMPORTE", "MOTIVO", "TURNO (FECHA)", "HORARIO", "JUGADOR", "TURNO FIJO", "RESERVA ELIMINADA", "OPERACIÓN"],
    filas: f.map((x) => [serial(x.fecha), x.hora, x.tipo, x.medio, pesos(x.importe), x.motivo || null, serial(x.turnoFecha), x.turnoHorario, x.jugador, x.turnoFijo, x.reservaEliminada || null, x.operacion]),
    columnasMoneda: [4],
    columnasFecha: [0, 6],
    columnasCentradas: [0, 1, 2, 3, 6, 7, 9, 10, 11],
    anchos: [12, 7, 12, 14, 14, 32, 13, 14, 24, 10, 10, 11],
    totales: { etiquetaCol: 3, columnas: [{ col: 4, valor: sumC(f, (x) => x.importe) }] },
  });
}

function hojaVentas(datos: DatosReporte): XLSX.WorkSheet {
  const f = datos.filasVentas;
  return armarTabla({
    titulo: `${datos.nombreCancha.toUpperCase()} — VENTAS`,
    subtitulo: subtitulo(datos, `${f.filter((x) => x.fecha !== "").length} venta(s)`),
    nota: `${NOTA_CONTABLE} El pago figura una sola vez por venta. Las devoluciones están en su propia hoja, con su propia fecha.`,
    encabezados: ["FECHA", "HORA", "VENTA", "RESERVA ASOCIADA", "PRODUCTO", "CANTIDAD", "PRECIO UNITARIO", "SUBTOTAL", "COSTO UNITARIO", "COSTO TOTAL", "MARGEN", "PAGO EFECTIVO", "PAGO TRANSFERENCIA"],
    filas: f.map((x) => [serial(x.fecha), x.hora || null, x.venta, x.reservaAsociada || null, x.producto, x.cantidad, pesos(x.precioUnitario), pesos(x.subtotal), pesos(x.costoUnitario), pesos(x.costoTotal), pesos(x.margen), pesos(x.pagoEfectivo), pesos(x.pagoTransferencia)]),
    columnasMoneda: [6, 7, 8, 9, 10, 11, 12],
    columnasFecha: [0],
    columnasCentradas: [0, 1, 2, 5],
    anchos: [12, 7, 11, 28, 22, 9, 13, 13, 13, 13, 13, 14, 16],
    totales: {
      etiquetaCol: 4,
      columnas: [
        { col: 7, valor: sumC(f, (x) => x.subtotal) },
        { col: 9, valor: sumC(f, (x) => x.costoTotal) },
        { col: 10, valor: sumC(f, (x) => x.margen) },
        { col: 11, valor: sumC(f, (x) => x.pagoEfectivo) },
        { col: 12, valor: sumC(f, (x) => x.pagoTransferencia) },
      ],
    },
  });
}

function hojaDevoluciones(datos: DatosReporte): XLSX.WorkSheet {
  const f = datos.filasDevoluciones;
  return armarTabla({
    titulo: `${datos.nombreCancha.toUpperCase()} — DEVOLUCIONES`,
    subtitulo: subtitulo(datos, `${f.length} devolución(es)`),
    nota: `${NOTA_CONTABLE} Cada devolución resta en la fecha en que se hizo, aunque la venta original sea de otro período.`,
    encabezados: ["FECHA", "HORA", "VENTA", "FECHA VENTA", "PRODUCTO", "CANTIDAD", "PRECIO UNITARIO", "IMPORTE", "MEDIO", "MOTIVO"],
    filas: f.map((x) => [serial(x.fecha), x.hora, x.venta || null, serial(x.fechaVenta), x.producto, x.cantidad, pesos(x.precioUnitario), pesos(x.importe), x.medio, x.motivo || null]),
    columnasMoneda: [6, 7],
    columnasFecha: [0, 3],
    columnasCentradas: [0, 1, 2, 3, 5, 8],
    anchos: [12, 7, 11, 12, 22, 9, 13, 13, 14, 30],
    totales: { etiquetaCol: 4, columnas: [{ col: 7, valor: sumC(f, (x) => x.importe) }] },
  });
}

function hojaActividad(datos: DatosReporte): XLSX.WorkSheet {
  const f = datos.filasActividad;
  return armarTabla({
    titulo: `${datos.nombreCancha.toUpperCase()} — ACTIVIDAD OPERATIVA (NO ES EL CIERRE DE CAJA)`,
    subtitulo: subtitulo(datos, `${f.length} turno(s) por fecha del turno`),
    nota: "Información operativa por fecha del TURNO. Los cobros entran en Caja por la fecha real del movimiento (hoja Pagos de reservas), no por la fecha del turno. Esta hoja no se suma al Resumen.",
    encabezados: ["DÍA", "FECHA", "HORARIO", "JUGADOR", "TELÉFONO", "ESTADO", "TURNO FIJO", "PRECIO", "REGISTRADO HOY", "SALDO"],
    filas: f.map((x) => [x.dia, serial(x.fecha), x.horario, x.jugador, x.telefono, x.estado, x.turnoFijo, pesos(x.precio), pesos(x.registrado), pesos(x.saldo)]),
    columnasMoneda: [7, 8, 9],
    columnasFecha: [1],
    columnasCentradas: [0, 1, 2, 5, 6],
    anchos: [7, 12, 14, 24, 15, 15, 10, 13, 14, 12],
    estadoCol: 5,
  });
}

// --- Resumen ----------------------------------------------------------------

export interface EntradaResumen {
  seccion: string;
  label: string;
  formula: string; // sin "="
  valor: number; // centavos para importes; cantidad para conteos
  esConteo?: boolean;
}

// Fórmulas del Resumen. Cada una es reproducible a mano desde las hojas.
export function entradasResumen(datos: DatosReporte): EntradaResumen[] {
  const r = datos.resumen;
  const nP = datos.filasPagos.length;
  const nV = datos.filasVentas.length;
  const nD = datos.filasDevoluciones.length;
  const P = HOJAS.pagos;
  const V = HOJAS.ventas;
  const D = HOJAS.devoluciones;
  const sumPago = (tipo: string, medio: string) =>
    `SUMIFS(${rango(P, "E", nP)},${rango(P, "C", nP)},"${tipo}",${rango(P, "D", nP)},"${medio}")`;
  const e: Omit<EntradaResumen, "formula">[] = [];
  const formulas: string[] = [];
  const add = (seccion: string, label: string, formula: string, valor: number, esConteo = false) => {
    e.push({ seccion, label, valor, esConteo });
    formulas.push(formula);
  };
  // Las referencias C{n} se resuelven con la fila real al escribir la hoja.
  add("PAGOS DE RESERVAS", "Cobros efectivo", sumPago("Cobro", "efectivo"), r.cobrosReservasEfectivo);
  add("PAGOS DE RESERVAS", "Cobros transferencia", sumPago("Cobro", "transferencia"), r.cobrosReservasTransferencia);
  add("PAGOS DE RESERVAS", "Reintegros efectivo (restan)", `-${sumPago("Reintegro", "efectivo")}`, r.reintegrosReservasEfectivo);
  add("PAGOS DE RESERVAS", "Reintegros transferencia (restan)", `-${sumPago("Reintegro", "transferencia")}`, r.reintegrosReservasTransferencia);
  add("PAGOS DE RESERVAS", "Correcciones efectivo", sumPago("Corrección", "efectivo"), r.correccionesReservasEfectivo);
  add("PAGOS DE RESERVAS", "Correcciones transferencia", sumPago("Corrección", "transferencia"), r.correccionesReservasTransferencia);
  add("PAGOS DE RESERVAS", "Neto pagos de reservas efectivo", "{Cobros efectivo}-{Reintegros efectivo (restan)}+{Correcciones efectivo}", r.reservasEfectivo);
  add("PAGOS DE RESERVAS", "Neto pagos de reservas transferencia", "{Cobros transferencia}-{Reintegros transferencia (restan)}+{Correcciones transferencia}", r.reservasTransferencia);
  add("VENTAS", "Ventas efectivo", `SUM(${rango(V, "L", nV)})`, r.ventasEfectivo);
  add("VENTAS", "Ventas transferencia", `SUM(${rango(V, "M", nV)})`, r.ventasTransferencia);
  add("DEVOLUCIONES", "Devoluciones efectivo (restan)", `SUMIFS(${rango(D, "H", nD)},${rango(D, "I", nD)},"efectivo")`, r.devolucionesEfectivo);
  add("DEVOLUCIONES", "Devoluciones transferencia (restan)", `SUMIFS(${rango(D, "H", nD)},${rango(D, "I", nD)},"transferencia")`, r.devolucionesTransferencia);
  add("TOTALES", "Neto efectivo", "{Neto pagos de reservas efectivo}+{Ventas efectivo}-{Devoluciones efectivo (restan)}", r.netoEfectivo);
  add("TOTALES", "Neto transferencia", "{Neto pagos de reservas transferencia}+{Ventas transferencia}-{Devoluciones transferencia (restan)}", r.netoTransferencia);
  add("TOTALES", "NETO", "{Neto efectivo}+{Neto transferencia}", r.netoTotal);
  add("CONTROL", "Movimientos de pago", `COUNTA(${rango(P, "L", nP)})`, r.cantidadMovimientosPago, true);
  add("CONTROL", "Ventas", `COUNTA(${rango(V, "A", nV)})`, r.cantidadVentas, true);
  add("CONTROL", "Devoluciones", `COUNTA(${rango(D, "A", nD)})`, r.cantidadDevoluciones, true);
  return e.map((x, i) => ({ ...x, formula: formulas[i] }));
}

function hojaResumen(datos: DatosReporte): { ws: XLSX.WorkSheet; ultimaFila: number; entradas: Array<EntradaResumen & { fila: number }> } {
  const entradas = entradasResumen(datos);
  const anchos = [4, 40, 20, 4];
  const aoa: Celda[][] = [
    [`${datos.nombreCancha.toUpperCase()} — RESUMEN DE CAJA`, "", "", ""],
    [`${formatearFechaLegible(datos.desde)} a ${formatearFechaLegible(datos.hasta)}`, "", "", ""],
    [NOTA_CONTABLE, "", "", ""],
  ];
  const conFila: Array<EntradaResumen & { fila: number }> = [];
  const titulos: number[] = [];
  let seccion = "";
  for (const en of entradas) {
    if (en.seccion !== seccion) {
      seccion = en.seccion;
      aoa.push([]);
      aoa.push([seccion, "", "", ""]);
      titulos.push(aoa.length);
    }
    aoa.push([null, en.label, en.esConteo ? en.valor : desdeCentavos(en.valor), null]);
    conFila.push({ ...en, fila: aoa.length });
  }
  let filaAviso: number | null = null;
  if (datos.resumen.saldoMigradoExcluido > 0) {
    aoa.push([]);
    aoa.push([`Aviso: $ ${desdeCentavos(datos.resumen.saldoMigradoExcluido).toFixed(2)} de pagos migrados sin fecha real de cobro NO se incluyen.`, "", "", ""]);
    filaAviso = aoa.length;
    titulos.push(-filaAviso);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa as unknown[][]);
  const filaDe = new Map(conFila.map((x) => [x.label, x.fila]));
  for (const en of conFila) {
    const formula = en.formula.replace(/\{([^}]+)\}/g, (_, label: string) => {
      const fila = filaDe.get(label);
      if (!fila) throw new Error(`Referencia de Resumen desconocida: ${label}`);
      return `C${fila}`;
    });
    const addr = `C${en.fila}`;
    ws[addr] = {
      t: "n",
      v: en.esConteo ? en.valor : desdeCentavos(en.valor),
      f: formula,
      z: en.esConteo ? "0" : FORMATO_MONEDA_EXACTO,
      s: { ...estiloCelda(false), font: { name: "Arial", sz: 10, bold: en.label === "NETO", color: { rgb: "1F2937" } }, alignment: { horizontal: "right", vertical: "center" } },
    };
    en.formula = formula;
    const lab = ws[`B${en.fila}`];
    if (lab) lab.s = estiloCelda(false);
  }
  ws["!merges"] = [0, 1, 2].map((r) => ({ s: { r, c: 0 }, e: { r, c: 3 } }));
  aplicarEstiloFila(ws, 1, 4, estiloTituloQueEntra(String(aoa[0][0]), anchos));
  aplicarEstiloFila(ws, 2, 4, estiloSubtitulo());
  aplicarEstiloFila(ws, 3, 4, { ...estiloSubtitulo(), alignment: { horizontal: "left", vertical: "center", wrapText: true } });
  ws["!rows"] = [{ hpt: 28 }, { hpt: 16 }, { hpt: 30 }];
  // El aviso ocupa 2 líneas con wrapText; Excel no autoajusta filas combinadas.
  if (filaAviso !== null) ws["!rows"][filaAviso - 1] = { hpt: 36 };
  for (const t of titulos) {
    const fila = Math.abs(t);
    ws["!merges"].push({ s: { r: fila - 1, c: 0 }, e: { r: fila - 1, c: 3 } });
    aplicarEstiloFila(ws, fila, 4, {
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: t > 0 ? "FFFFFF" : "92400E" } },
      fill: { fgColor: { rgb: t > 0 ? "2E7D32" : "FEF3C7" } },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      border: bordeFino,
    });
  }
  anchosColumnas(ws, anchos);
  return { ws, ultimaFila: aoa.length, entradas: conFila };
}

// --- Workbook ---------------------------------------------------------------

export function construirWorkbook(datos: DatosReporte): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const { ws, ultimaFila } = hojaResumen(datos);
  ws["!margins"] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.5, header: 0.3, footer: 0.3 };
  XLSX.utils.book_append_sheet(wb, ws, HOJAS.resumen);
  wb.Workbook = wb.Workbook ?? {};
  wb.Workbook.Names = wb.Workbook.Names ?? [];
  wb.Workbook.Names.push({ Name: "_xlnm.Print_Area", Sheet: 0, Ref: `'${HOJAS.resumen}'!$A$1:$D$${ultimaFila}` });
  XLSX.utils.book_append_sheet(wb, hojaPagos(datos), HOJAS.pagos);
  XLSX.utils.book_append_sheet(wb, hojaVentas(datos), HOJAS.ventas);
  XLSX.utils.book_append_sheet(wb, hojaDevoluciones(datos), HOJAS.devoluciones);
  XLSX.utils.book_append_sheet(wb, hojaActividad(datos), HOJAS.actividad);
  return wb;
}

const PREFIJO_ARCHIVO = "Los_Amigos_Padel";

export function nombreArchivo(rango: RangoFechas): string {
  return `${PREFIJO_ARCHIVO}_${rango.desde}_a_${rango.hasta}.xlsx`;
}

export function descargarWorkbook(wb: XLSX.WorkBook, rango: RangoFechas): void {
  XLSX.writeFile(wb, nombreArchivo(rango));
}
