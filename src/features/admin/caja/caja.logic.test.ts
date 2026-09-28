import { describe, expect, it } from "vitest";
import { calcularCajaRango, calcularOperativoCaja, montoDevolucion, type DevolucionCaja, type MovimientoCaja, type VentaCaja } from "./caja.logic";
import type { ReservaProcesada } from "../reservas/reservas.types";

let n = 0;
const id = () => `id-${++n}`;
function mov(fecha: string, medio: string, importe: number, tipo = "cobro"): MovimientoCaja {
  return { id: id(), creado: `${fecha}T12:00:00-03:00`, fecha, medio, importe, tipo };
}
function venta(fecha: string, ef: number, tr: number): VentaCaja {
  return { id: id(), creado: `${fecha}T12:00:00-03:00`, fecha, pago_efectivo: ef, pago_transferencia: tr, total: ef + tr };
}
function dev(fecha: string | null, cantidad: number, precio: number, medio = "efectivo"): DevolucionCaja {
  return { id: id(), creado: `${fecha}T12:00:00-03:00`, cantidad, medio_reembolso: medio, fecha, venta_items: { precio_unitario_snapshot: precio } };
}

const D = "2026-09-21";
const H = "2026-09-27";

describe("calcularCajaRango — movimientos reales, en centavos", () => {
  it("suma cobros, resta reintegros y aplica correcciones por medio", () => {
    const r = calcularCajaRango(
      [
        mov("2026-09-22", "efectivo", 5000),
        mov("2026-09-22", "transferencia", 3000),
        mov("2026-09-23", "efectivo", -1000, "reintegro"),
        mov("2026-09-24", "efectivo", 2000, "correccion"),
        mov("2026-09-24", "transferencia", -2000, "correccion"),
      ],
      [],
      [],
      D,
      H,
    );
    expect(r.cobrosReservasEfectivo).toBe(500000);
    expect(r.cobrosReservasTransferencia).toBe(300000);
    expect(r.reintegrosReservasEfectivo).toBe(100000);
    expect(r.correccionesReservasEfectivo).toBe(200000);
    expect(r.correccionesReservasTransferencia).toBe(-200000);
    expect(r.reservasEfectivo).toBe(600000);
    expect(r.reservasTransferencia).toBe(100000);
    expect(r.netoTotal).toBe(700000);
    expect(r.cantidadMovimientosPago).toBe(5);
  });

  it("ventas por su fecha, devoluciones por la SUYA (aunque la venta sea de otra semana)", () => {
    const r = calcularCajaRango(
      [],
      [venta("2026-09-20", 9999, 0), venta("2026-09-21", 2500, 1000)],
      [dev("2026-09-22", 2, 1000), dev("2026-09-19", 1, 1000), dev("2026-09-23", 1, 2500, "transferencia")],
      D,
      H,
    );
    expect(r.ventasEfectivo).toBe(250000);
    expect(r.ventasTransferencia).toBe(100000);
    expect(r.devolucionesEfectivo).toBe(200000);
    expect(r.devolucionesTransferencia).toBe(250000);
    expect(r.netoEfectivo).toBe(50000);
    expect(r.netoTransferencia).toBe(-150000);
    expect(r.netoTotal).toBe(-100000);
  });

  it("saldo_migrado queda FUERA del neto y se informa aparte", () => {
    const r = calcularCajaRango([mov("2026-09-22", "efectivo", 7000, "saldo_migrado"), mov("2026-09-22", "efectivo", 1000)], [], [], D, H);
    expect(r.reservasEfectivo).toBe(100000);
    expect(r.saldoMigradoExcluido).toBe(700000);
    expect(r.cantidadMovimientosPago).toBe(1);
  });

  it("centavos exactos: sin acumulación flotante", () => {
    const movs = Array.from({ length: 10 }, () => mov("2026-09-22", "efectivo", 0.1));
    const r = calcularCajaRango([...movs, mov("2026-09-22", "transferencia", 6172.83), mov("2026-09-22", "transferencia", 6172.84)], [venta("2026-09-24", 999.99, 0)], [dev("2026-09-24", 3, 333.33)], D, H);
    expect(r.reservasEfectivo).toBe(100);
    expect(r.reservasTransferencia).toBe(1234567);
    expect(r.ventasEfectivo).toBe(99999);
    expect(r.devolucionesEfectivo).toBe(99999);
    expect(Number.isInteger(r.netoTotal)).toBe(true);
    expect(r.netoTotal).toBe(1234667);
  });

  it("acota al rango aunque las fuentes traigan filas de afuera", () => {
    const r = calcularCajaRango([mov("2026-09-20", "efectivo", 100), mov("2026-09-28", "efectivo", 100)], [], [dev(null, 1, 100)], D, H);
    expect(r.netoTotal).toBe(0);
  });

  it("montoDevolucion = cantidad × precio histórico (centavos)", () => {
    expect(montoDevolucion(dev(D, 3, 333.33))).toBe(99999);
    expect(montoDevolucion({ cantidad: 1, venta_items: null })).toBe(0);
  });
});

describe("calcularOperativoCaja — información de turnos, NO dinero", () => {
  const base = { bloqueado: false, confirmada: true, hora_apertura_vigente: "08:00:00" } as const;
  const r = (fecha: string, precio: number, ef: number, tr: number, extra: Partial<ReservaProcesada> = {}) =>
    ({ ...base, id: id(), fecha, horaInicio: "18:00", horaFin: "19:00", hora_inicio: "18:00:00", hora_fin: "19:00:00", precio, pago_efectivo: ef, pago_transferencia: tr, ...extra }) as unknown as ReservaProcesada;
  const ahora = new Date("2026-09-26T20:00:00-03:00").getTime();

  it("cuenta jugadas sin pago y saldo pendiente; ignora futuras y bloqueos", () => {
    const o = calcularOperativoCaja(
      [r("2026-09-22", 10000, 0, 0), r("2026-09-23", 10000, 5000, 0), r("2026-09-24", 10000, 10000, 0), r("2026-09-27", 10000, 0, 0), r("2026-09-22", 0, 0, 0, { bloqueado: true })],
      D,
      H,
      ahora,
    );
    expect(o.sinRegistrarReservas).toHaveLength(1);
    expect(o.montoSinRegistrarReservas).toBe(1000000);
    expect(o.turnosConSaldo).toBe(2);
    expect(o.saldoPendienteReservas).toBe(1500000);
  });
});
