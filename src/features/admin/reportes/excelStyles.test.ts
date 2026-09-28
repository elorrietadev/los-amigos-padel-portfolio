// fechaISOaSerialExcel: test de regresión directo contra el bug encontrado en
// la inspección real de un .xlsx generado (E5) — pasarle un objeto Date
// normal a una celda dejaba que xlsx-js-style hiciera su propia conversión
// interna (datenum), que devolvía un serial con una fracción de día espuria
// y terminaba mostrando el día ANTERIOR al real una vez formateado. Se
// verifica acá con el mismo mecanismo de render que reveló el bug
// (XLSX.SSF.format), no solo comparando el número de serial a ojo.

import XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";
import { FORMATO_FECHA, fechaISOaSerialExcel } from "./excelStyles";

function renderizar(fechaISO: string): string {
  return XLSX.SSF.format(FORMATO_FECHA, fechaISOaSerialExcel(fechaISO));
}

describe("fechaISOaSerialExcel", () => {
  it("el serial es un entero exacto, sin fracción de día espuria", () => {
    expect(Number.isInteger(fechaISOaSerialExcel("2026-08-16"))).toBe(true);
  });

  it("renderiza exactamente la fecha pedida, no el día anterior (bug real encontrado)", () => {
    expect(renderizar("2026-08-16")).toBe("16/08/2026");
  });

  it("varias fechas de un rango real, sin off-by-one sistemático", () => {
    expect(renderizar("2026-01-01")).toBe("01/01/2026");
    expect(renderizar("2026-02-28")).toBe("28/02/2026");
    expect(renderizar("2026-09-11")).toBe("11/09/2026");
    expect(renderizar("2026-12-31")).toBe("31/12/2026");
  });

  it("respeta años bisiestos (2028)", () => {
    expect(renderizar("2028-02-29")).toBe("29/02/2028");
  });
});
