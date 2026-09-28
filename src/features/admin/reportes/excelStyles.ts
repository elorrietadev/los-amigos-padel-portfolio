// Estilos compartidos del Reporte de Caja y Actividad (E5) — subconjunto del
// lenguaje visual de admin.html:exportarAExcelDiseño (paleta, tipografía,
// bordes, formato moneda), portado con criterio: no se copian las 696 líneas
// originales, solo los estilos y helpers que este reporte realmente usa.
// `XLSX` es xlsx-js-style (instalada por npm, E5) — mismo paquete que ya
// usaba el legacy vía CDN, ahora sin CDN.

import XLSX from "xlsx-js-style";

export const COLORES = {
  fondoOscuro: "14301F",
  verde: "D7F26D",
  verdeOscuro: "2E7D32",
  verdeClaro: "EAF7C8",
  azul: "2563EB",
  azulClaro: "DBEAFE",
  amarillo: "F59E0B",
  amarilloClaro: "FEF3C7",
  rojo: "DC2626",
  rojoClaro: "FEE2E2",
  blanco: "FFFFFF",
  grisMuyClaro: "F8FAFC",
  grisClaro: "F1F5F9",
  grisBorde: "CBD5E1",
  grisTexto: "334155",
} as const;

const FUENTE = "Arial";

// Tipo laxo a propósito: xlsx-js-style no exporta un tipo de estilo de celda
// utilizable directamente (su .d.ts describe la forma general del archivo,
// no cada propiedad de `.s`) — mismo shape que aceptaba admin.html.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CellStyle = any;

export const bordeFino = {
  top: { style: "thin", color: { rgb: COLORES.grisBorde } },
  bottom: { style: "thin", color: { rgb: COLORES.grisBorde } },
  left: { style: "thin", color: { rgb: COLORES.grisBorde } },
  right: { style: "thin", color: { rgb: COLORES.grisBorde } },
};

export function estiloTitulo(): CellStyle {
  return {
    font: { name: FUENTE, sz: 18, bold: true, color: { rgb: COLORES.verde } },
    fill: { fgColor: { rgb: COLORES.fondoOscuro } },
    alignment: { horizontal: "center", vertical: "center" },
  };
}

export function estiloSubtitulo(): CellStyle {
  return {
    font: { name: FUENTE, sz: 10, bold: true, color: { rgb: "D1D5DB" } },
    fill: { fgColor: { rgb: COLORES.fondoOscuro } },
    alignment: { horizontal: "center", vertical: "center" },
  };
}

export function estiloEncabezado(): CellStyle {
  return {
    font: { name: FUENTE, sz: 10, bold: true, color: { rgb: COLORES.blanco } },
    fill: { fgColor: { rgb: COLORES.verdeOscuro } },
    alignment: { horizontal: "center", vertical: "center" },
    border: bordeFino,
  };
}

export function estiloCelda(alternada: boolean, centrada: boolean = false): CellStyle {
  return {
    font: { name: FUENTE, sz: 10, color: { rgb: COLORES.grisTexto } },
    fill: { fgColor: { rgb: alternada ? COLORES.grisMuyClaro : COLORES.blanco } },
    alignment: centrada
      ? { horizontal: "center", vertical: "center" }
      : { horizontal: "left", vertical: "center" },
    border: bordeFino,
  };
}

export function estiloTotales(centrada: boolean = false): CellStyle {
  return {
    font: { name: FUENTE, sz: 10, bold: true, color: { rgb: "14532D" } },
    fill: { fgColor: { rgb: COLORES.verdeClaro } },
    alignment: { horizontal: centrada ? "center" : "right", vertical: "center" },
    border: {
      top: { style: "medium", color: { rgb: COLORES.verdeOscuro } },
      bottom: { style: "medium", color: { rgb: COLORES.verdeOscuro } },
      left: { style: "thin", color: { rgb: COLORES.grisBorde } },
      right: { style: "thin", color: { rgb: COLORES.grisBorde } },
    },
  };
}

// Color de fondo/texto por estado — mismo criterio de "Estado" que ya usaba
// el legacy (JUGADO=verde, CONFIRMADO=azul, PENDIENTE=amarillo,
// NO CONFIRMADO=gris neutro, agregado acá porque el legacy no lo mostraba
// nunca en el Excel — ver reportes.logic.ts, calcularEstadoReserva). "Activo"
// (E6, reporte de stock) reusa la función entera en vez de un estilo nuevo —
// mismo verde que JUGADO; "Inactivo" cae en el default gris, no necesita rama.
export function estiloEstado(estado: string): CellStyle {
  let fondo: string = COLORES.grisClaro;
  let texto: string = COLORES.grisTexto;
  if (estado === "JUGADO" || estado === "Activo") {
    fondo = COLORES.verdeClaro;
    texto = "166534";
  } else if (estado === "CONFIRMADO") {
    fondo = COLORES.azulClaro;
    texto = "1D4ED8";
  } else if (estado === "PENDIENTE") {
    fondo = COLORES.amarilloClaro;
    texto = "92400E";
  } else if (estado === "NO CONFIRMADO") {
    fondo = COLORES.rojoClaro;
    texto = "991B1B";
  }
  return {
    font: { name: FUENTE, sz: 9, bold: true, color: { rgb: texto } },
    fill: { fgColor: { rgb: fondo } },
    alignment: { horizontal: "center", vertical: "center" },
    border: bordeFino,
  };
}

export const FORMATO_MONEDA = "$ #,##0";
export const FORMATO_FECHA = "dd/mm/yyyy";

// Convierte "YYYY-MM-DD" al serial de fecha de Excel (días desde
// 1899-12-30) usando SOLO aritmética UTC (Date.UTC en ambos lados) —
// deliberado, no cosmético: pasarle un objeto Date normal a una celda deja
// que xlsx-js-style haga su propia conversión interna (datenum), que en este
// proyecto dio un serial con una fracción de día espuria (ej. 46249.999444
// en vez de 46249) y terminó mostrando el día ANTERIOR al real una vez
// formateado — confirmado con una inspección real de un .xlsx generado (ver
// informe de sesión). Construyendo el serial nosotros mismos, con las dos
// mitades de la resta en UTC, el resultado es siempre un entero exacto, sin
// depender del timezone del proceso que corre el build ni de reglas
// históricas de timezone de ninguna zona horaria.
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const EPOCA_EXCEL_UTC = Date.UTC(1899, 11, 30);

export function fechaISOaSerialExcel(fechaISO: string): number {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d!) - EPOCA_EXCEL_UTC) / MS_POR_DIA);
}

// --- Helpers de rango de celdas (todas 1-indexadas en el parámetro `fila`,
// como el resto del proyecto ya usa para filas de Excel — se convierten a
// 0-index recién en encode_cell). --------------------------------------------

export function aplicarEstiloFila(ws: XLSX.WorkSheet, fila: number, columnas: number, estilo: CellStyle): void {
  for (let c = 0; c < columnas; c++) {
    const celda = XLSX.utils.encode_cell({ r: fila - 1, c });
    if (ws[celda]) ws[celda].s = estilo;
  }
}

export function aplicarFormatoColumna(
  ws: XLSX.WorkSheet,
  columna: number,
  filaInicio: number,
  filaFin: number,
  formato: string,
): void {
  for (let r = filaInicio; r <= filaFin; r++) {
    const celda = XLSX.utils.encode_cell({ r: r - 1, c: columna });
    if (ws[celda]) ws[celda].z = formato;
  }
}

export function aplicarAutofiltro(ws: XLSX.WorkSheet, filaEncabezado: number, filaFin: number, columnas: number): void {
  ws["!autofilter"] = {
    ref: `A${filaEncabezado}:${XLSX.utils.encode_col(columnas - 1)}${filaFin}`,
  };
}

export function anchosColumnas(ws: XLSX.WorkSheet, anchos: number[]): void {
  ws["!cols"] = anchos.map((wch) => ({ wch }));
}
