// FINAL-F6 — RECONCILIACIÓN CONTABLE OBLIGATORIA (permanente).
//
// Fixture: __fixtures__/reconciliacion.contable.json, generado contra un
// PostgreSQL local con las RPC reales (incluye reintentos, doble submit en
// paralelo, seña de turno futuro, corrección, reintegro + reserva eliminada,
// venta del domingo cobrada el lunes 00:20, devoluciones de otra semana,
// turno fijo materializado y centavos). Trae las filas como las devuelve
// PostgREST y la verdad calculada por SQL (ya comparada allá con el cálculo
// manual).
//
// Para W1, W2 y el rango conjunto exige, EN CENTAVOS:
//   SQL = Caja (caja.api + calcularCajaRango, el camino real de la pantalla)
//       = Excel Resumen (valor de cada celda)
//       = fórmulas del Resumen evaluadas sobre las hojas del .xlsx generado
//       = reconstrucción independiente sumando las hojas financieras
// y que cada movimiento/venta/devolución aparezca exactamente una vez.

import { beforeAll, describe, expect, it, vi } from "vitest";
import XLSX from "xlsx-js-style";
import fixture from "./__fixtures__/reconciliacion.contable.json";

type Fila = Record<string, unknown>;

// --- Supabase simulado: responde como PostgREST sobre las filas del fixture ---
vi.mock("../../../lib/supabase", () => {
  const tablas: Record<string, Fila[]> = {
    reserva_pago_movimientos: fixture.reserva_pago_movimientos as Fila[],
    ventas: fixture.ventas as Fila[],
    devoluciones: fixture.devoluciones as Fila[],
    reservas: fixture.reservas as Fila[],
  };
  class Consulta {
    private filtros: Array<(f: Fila) => boolean> = [];
    private orden: Array<[string, boolean]> = [];
    private rango: [number, number] | null = null;
    constructor(private tabla: string) {}
    select() { return this; }
    gte(c: string, v: string) { this.filtros.push((f) => f[c] != null && String(f[c]) >= v); return this; }
    lte(c: string, v: string) { this.filtros.push((f) => f[c] != null && String(f[c]) <= v); return this; }
    eq(c: string, v: unknown) { this.filtros.push((f) => f[c] === v); return this; }
    order(c: string, o: { ascending?: boolean } = {}) { this.orden.push([c, o.ascending !== false]); return this; }
    range(a: number, b: number) { this.rango = [a, b]; return this; }
    then(resolve: (x: unknown) => void) {
      let filas = (tablas[this.tabla] ?? []).filter((f) => this.filtros.every((fn) => fn(f)));
      filas = [...filas].sort((x, y) => {
        for (const [c, asc] of this.orden) {
          const cmp = String(x[c] ?? "").localeCompare(String(y[c] ?? ""));
          if (cmp) return asc ? cmp : -cmp;
        }
        return 0;
      });
      if (this.rango) filas = filas.slice(this.rango[0], this.rango[1] + 1);
      filas = filas.slice(0, 1000); // max-rows de PostgREST
      resolve({ data: JSON.parse(JSON.stringify(filas)), error: null });
    }
  }
  return { supabase: { from: (t: string) => new Consulta(t), rpc: () => { throw new Error("rpc no esperada"); } } };
});

import { obtenerDevolucionesParaCaja, obtenerMovimientosPagoParaCaja, obtenerVentasParaCaja } from "../caja/caja.api";
import { calcularCajaRango, type ResumenCaja } from "../caja/caja.logic";
import { aCentavos } from "../../../lib/dinero";
import { exportarCajaActividad } from "./exportCajaActividad";
import { construirWorkbook, HOJAS, PRIMERA_FILA_DATOS } from "./construirReporteExcel";
import type { DatosReporte } from "./reportes.types";

const AHORA = new Date(fixture.ahora).getTime();
type Clave = keyof typeof fixture.truth;

// --- Evaluador mínimo de las fórmulas del Resumen (SUMIFS/SUM/COUNTA/refs/+-) ---
function valoresRango(wb: XLSX.WorkBook, ref: string): unknown[] {
  const m = /^'([^']+)'!\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)$/.exec(ref.trim());
  if (!m) throw new Error(`rango no soportado: ${ref}`);
  const [, hoja, c1, r1, c2, r2] = m;
  if (c1 !== c2) throw new Error("solo rangos de una columna");
  const ws = wb.Sheets[hoja];
  if (!ws) throw new Error(`hoja inexistente: ${hoja}`);
  const out: unknown[] = [];
  for (let r = Number(r1); r <= Number(r2); r++) out.push(ws[`${c1}${r}`]?.v);
  return out;
}
function dividirArgs(s: string): string[] {
  const out: string[] = [];
  let actual = "";
  let comillas = false;
  for (const ch of s) {
    if (ch === '"') comillas = !comillas;
    if (ch === "," && !comillas) { out.push(actual); actual = ""; } else actual += ch;
  }
  out.push(actual);
  return out;
}
// Devuelve centavos (importes) o unidades (conteos).
function evaluar(wb: XLSX.WorkBook, formula: string, _esConteo: boolean, resumen: XLSX.WorkSheet, pila = 0): number {
  if (pila > 20) throw new Error("referencia circular");
  let expr = formula.replace(/(SUMIFS|SUM|COUNTA)\(([^()]*)\)/g, (_, fn: string, args: string) => {
    const a = dividirArgs(args);
    if (fn === "COUNTA") return String(valoresRango(wb, a[0]).filter((v) => v !== undefined && v !== null && v !== "").length);
    const valores = valoresRango(wb, a[0]);
    let mascara = valores.map(() => true);
    if (fn === "SUMIFS") {
      for (let i = 1; i < a.length; i += 2) {
        const crit = a[i + 1].trim().replace(/^"|"$/g, "").toLowerCase();
        const col = valoresRango(wb, a[i]);
        mascara = mascara.map((ok, j) => ok && String(col[j] ?? "").toLowerCase() === crit);
      }
    }
    const total = valores.reduce<number>((acc, v, j) => acc + (mascara[j] && typeof v === "number" ? aCentavos(v) : 0), 0);
    return `(${total})`;
  });
  expr = expr.replace(/C(\d+)/g, (_, fila: string) => {
    const celda = resumen[`C${fila}`];
    if (!celda?.f) throw new Error(`C${fila} sin fórmula`);
    return `(${evaluar(wb, celda.f, false, resumen, pila + 1)})`;
  });
  if (!/^[\d()+\-\s]+$/.test(expr)) throw new Error(`expresión inesperada: ${expr}`);
  // Solo enteros, paréntesis, + y -: evaluación segura.
  // eslint-disable-next-line no-new-func
  const v = Function(`"use strict"; return (${expr});`)() as number;
  return v + 0; // normaliza -0 (p. ej. "-(0)")
}

function hojaAFilas(wb: XLSX.WorkBook, nombre: string): unknown[][] {
  return XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null }) as unknown[][];
}
function filasDeDatos(wb: XLSX.WorkBook, nombre: string, n: number): unknown[][] {
  return hojaAFilas(wb, nombre).slice(PRIMERA_FILA_DATOS - 1, PRIMERA_FILA_DATOS - 1 + n);
}
const sumaCol = (filas: unknown[][], col: number, filtro: (f: unknown[]) => boolean = () => true) =>
  filas.filter(filtro).reduce<number>((a, f) => a + (typeof f[col] === "number" ? aCentavos(f[col] as number) : 0), 0);

describe("reconciliación contable DB = Caja = Excel (al centavo)", () => {
  for (const clave of ["W1", "W2", "TODO"] as Clave[]) {
    describe(clave, () => {
      const [desde, hasta] = fixture.rangos[clave];
      const t = fixture.truth[clave];
      let caja: ResumenCaja;
      let datos: DatosReporte;
      let wb: XLSX.WorkBook;

      beforeAll(async () => {
        const [m, v, d] = await Promise.all([obtenerMovimientosPagoParaCaja(desde, hasta), obtenerVentasParaCaja(desde, hasta), obtenerDevolucionesParaCaja(desde, hasta)]);
        caja = calcularCajaRango(m.data ?? [], v.data ?? [], d.data ?? [], desde, hasta);
        const r = await exportarCajaActividad({ desde, hasta }, AHORA, "Test", (x) => { datos = x; });
        expect(r.ok).toBe(true);
        // Ida y vuelta real por el formato .xlsx.
        wb = XLSX.read(XLSX.write(construirWorkbook(datos), { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellFormula: true });
      });

      it("SQL = Caja", () => {
        expect({
          cobrosEf: caja.cobrosReservasEfectivo, cobrosTr: caja.cobrosReservasTransferencia,
          reintEf: caja.reintegrosReservasEfectivo, reintTr: caja.reintegrosReservasTransferencia,
          corrEf: caja.correccionesReservasEfectivo, corrTr: caja.correccionesReservasTransferencia,
          venEf: caja.ventasEfectivo, venTr: caja.ventasTransferencia, devEf: caja.devolucionesEfectivo, devTr: caja.devolucionesTransferencia,
          netoEf: caja.netoEfectivo, netoTr: caja.netoTransferencia, neto: caja.netoTotal,
          nMovimientos: caja.cantidadMovimientosPago, nVentas: caja.cantidadVentas, nDevoluciones: caja.cantidadDevoluciones,
        }).toEqual({
          cobrosEf: t.cobrosEf, cobrosTr: t.cobrosTr, reintEf: t.reintEf, reintTr: t.reintTr, corrEf: t.corrEf, corrTr: t.corrTr,
          venEf: t.venEf, venTr: t.venTr, devEf: t.devEf, devTr: t.devTr, netoEf: t.netoEf, netoTr: t.netoTr, neto: t.neto,
          nMovimientos: t.nMovimientos, nVentas: t.nVentas, nDevoluciones: t.nDevoluciones,
        });
        expect(Number.isInteger(caja.netoTotal)).toBe(true);
      });

      it("Caja = Resumen del reporte (mismo cálculo sobre las filas del detalle)", () => {
        expect(datos.resumen).toEqual(caja);
      });

      it("Resumen del .xlsx: cada valor = SQL y cada fórmula evaluada sobre las hojas = su valor", () => {
        const ws = wb.Sheets[HOJAS.resumen];
        const porLabel = new Map<string, { v: number; f: string }>();
        for (let r = 1; r <= 80; r++) {
          const lab = ws[`B${r}`]?.v;
          const val = ws[`C${r}`];
          if (typeof lab === "string" && val) porLabel.set(lab, { v: val.v as number, f: val.f as string });
        }
        const esperado: Array<[string, number, boolean?]> = [
          ["Cobros efectivo", t.cobrosEf], ["Cobros transferencia", t.cobrosTr],
          ["Reintegros efectivo (restan)", t.reintEf], ["Reintegros transferencia (restan)", t.reintTr],
          ["Correcciones efectivo", t.corrEf], ["Correcciones transferencia", t.corrTr],
          ["Neto pagos de reservas efectivo", t.cobrosEf - t.reintEf + t.corrEf], ["Neto pagos de reservas transferencia", t.cobrosTr - t.reintTr + t.corrTr],
          ["Ventas efectivo", t.venEf], ["Ventas transferencia", t.venTr],
          ["Devoluciones efectivo (restan)", t.devEf], ["Devoluciones transferencia (restan)", t.devTr],
          ["Neto efectivo", t.netoEf], ["Neto transferencia", t.netoTr], ["NETO", t.neto],
          ["Movimientos de pago", t.nMovimientos, true], ["Ventas", t.nVentas, true], ["Devoluciones", t.nDevoluciones, true],
        ];
        for (const [label, valor, esConteo] of esperado) {
          const celda = porLabel.get(label);
          expect(celda, label).toBeTruthy();
          expect(celda!.f, `${label} tiene fórmula`).toBeTruthy();
          expect(esConteo ? celda!.v : aCentavos(celda!.v), `${label}: valor de la celda`).toBe(valor);
          expect(evaluar(wb, celda!.f, !!esConteo, ws), `${label}: fórmula evaluada`).toBe(valor);
        }
      });

      it("reconstrucción independiente desde las hojas financieras = SQL", () => {
        const pagos = filasDeDatos(wb, HOJAS.pagos, datos.filasPagos.length);
        const ventas = filasDeDatos(wb, HOJAS.ventas, datos.filasVentas.length);
        const devs = filasDeDatos(wb, HOJAS.devoluciones, datos.filasDevoluciones.length);
        const netoEf = sumaCol(pagos, 4, (f) => f[3] === "efectivo") + sumaCol(ventas, 11) - sumaCol(devs, 7, (f) => f[8] === "efectivo");
        const netoTr = sumaCol(pagos, 4, (f) => f[3] === "transferencia") + sumaCol(ventas, 12) - sumaCol(devs, 7, (f) => f[8] === "transferencia");
        expect([netoEf, netoTr, netoEf + netoTr]).toEqual([t.netoEf, t.netoTr, t.neto]);
        // Ventas: el subtotal de los ítems cobrados = lo pagado (nunca hay saldo de productos).
        expect(sumaCol(ventas, 7)).toBe(t.venEf + t.venTr);
      });

      it("cada movimiento / venta / devolución aparece exactamente una vez", () => {
        expect(datos.filasPagos).toHaveLength(t.nMovimientos);
        expect(new Set(datos.filasVentas.filter((f) => f.fecha !== "").map((f) => f.venta)).size).toBe(t.nVentas);
        expect(datos.filasVentas.filter((f) => f.fecha !== "")).toHaveLength(t.nVentas);
        expect(datos.filasDevoluciones).toHaveLength(t.nDevoluciones);
        const esperadosEnRango = (fixture.reserva_pago_movimientos as Fila[]).filter((m) => String(m.fecha) >= desde && String(m.fecha) <= hasta && m.tipo !== "saldo_migrado").length;
        expect(datos.filasPagos).toHaveLength(esperadosEnRango);
      });

      it("fila TOTAL de cada hoja financiera = suma del detalle (fórmula y valor)", () => {
        for (const [hoja, n, cols] of [[HOJAS.pagos, datos.filasPagos.length, ["E"]], [HOJAS.ventas, datos.filasVentas.length, ["H", "L", "M"]], [HOJAS.devoluciones, datos.filasDevoluciones.length, ["H"]]] as const) {
          const ws = wb.Sheets[hoja];
          const filaTot = PRIMERA_FILA_DATOS + n + 1;
          for (const col of cols) {
            const celda = ws[`${col}${filaTot}`];
            expect(celda?.f).toBe(`SUM(${col}${PRIMERA_FILA_DATOS}:${col}${Math.max(PRIMERA_FILA_DATOS, PRIMERA_FILA_DATOS + n - 1)})`);
            let suma = 0;
            for (let r = PRIMERA_FILA_DATOS; r < PRIMERA_FILA_DATOS + n; r++) suma += typeof ws[`${col}${r}`]?.v === "number" ? aCentavos(ws[`${col}${r}`].v) : 0;
            expect(aCentavos(celda.v)).toBe(suma);
          }
        }
      });

      it("la hoja operativa no tiene totales de dinero ni es referenciada por el Resumen", () => {
        const filas = hojaAFilas(wb, HOJAS.actividad);
        expect(filas.some((f) => f.includes("TOTAL"))).toBe(false);
        const ws = wb.Sheets[HOJAS.resumen];
        const formulas = Object.values(ws).filter((c) => c && typeof c === "object" && "f" in c).map((c) => (c as { f: string }).f);
        expect(formulas.some((f) => f.includes(HOJAS.actividad))).toBe(false);
      });
    });
  }

  describe("casos puntuales de fecha contable", () => {
    let w1: DatosReporte;
    let w2: DatosReporte;
    beforeAll(async () => {
      await exportarCajaActividad({ desde: "2026-09-14", hasta: "2026-09-20" }, AHORA, "T", (x) => { w1 = x; });
      await exportarCajaActividad({ desde: "2026-09-21", hasta: "2026-09-27" }, AHORA, "T", (x) => { w2 = x; });
    });

    it("turno del domingo 23:30: su cobro (dom 23:40) en W1; su venta cobrada lun 00:20 en W2", () => {
      expect(w1.filasPagos.some((f) => f.jugador === "R6 domingo cruza medianoche" && f.hora === "23:40")).toBe(true);
      const v3 = w2.filasVentas.find((f) => f.reservaAsociada.startsWith("R6 domingo cruza medianoche"));
      expect([v3?.fecha, v3?.hora]).toEqual(["2026-09-21", "00:20"]);
      expect(w1.filasVentas.some((f) => f.reservaAsociada.startsWith("R6"))).toBe(false);
    });

    it("seña cobrada el 19/09 para un turno del 26/09: entra en W1 (cuando entró el dinero)", () => {
      const s = w1.filasPagos.find((f) => f.jugador === "R8 seña turno futuro");
      expect([s?.fecha, s?.turnoFecha, s?.importe]).toEqual(["2026-09-19", "2026-09-26", 300000]);
      expect(w2.filasPagos.some((f) => f.jugador === "R8 seña turno futuro")).toBe(false);
    });

    it("saldo de R4 cobrado en otra semana: cada cobro en su semana", () => {
      expect(w1.filasPagos.filter((f) => f.jugador.startsWith("R4")).map((f) => f.importe)).toEqual([500000]);
      expect(w2.filasPagos.filter((f) => f.jugador.startsWith("R4")).map((f) => f.importe)).toEqual([200000]);
    });

    it("reserva eliminada tras reintegro: sus movimientos siguen, marcados", () => {
      const r11 = w2.filasPagos.filter((f) => f.jugador === "R11 seña reintegrada y eliminada");
      expect(r11.map((f) => [f.tipo, f.importe, f.reservaEliminada])).toEqual([["Cobro", 500000, "Sí"], ["Reintegro", -500000, "Sí"]]);
    });

    it("devolución en otra semana: resta en W2 y cita la venta original de W1 / W0", () => {
      const fechasVenta = w2.filasDevoluciones.map((f) => f.fechaVenta).sort();
      expect(fechasVenta).toEqual(["2026-09-13", "2026-09-15", "2026-09-17", "2026-09-22"]);
      expect(w1.filasDevoluciones.map((f) => f.fechaVenta)).toEqual(["2026-09-15"]);
    });

    it("turno fijo materializado: sus cobros entran como cualquier movimiento y se marcan", () => {
      expect(w1.filasPagos.filter((f) => f.turnoFijo === "Sí").map((f) => [f.fecha, f.importe])).toEqual([["2026-09-16", 1000000]]);
      expect(w2.filasPagos.filter((f) => f.turnoFijo === "Sí").map((f) => [f.fecha, f.turnoFecha, f.importe])).toEqual([["2026-09-24", "2026-09-23", 1000000]]);
    });

    it("corrección de medio: −ef/+tr con motivo, neto de la reserva sin cambio", () => {
      const c = w2.filasPagos.filter((f) => f.tipo === "Corrección").map((f) => [f.medio, f.importe, f.motivo]);
      expect(c).toEqual([["efectivo", -1000000, "Se cargó efectivo pero fue transferencia"], ["transferencia", 1000000, "Se cargó efectivo pero fue transferencia"]]);
    });
  });
});
