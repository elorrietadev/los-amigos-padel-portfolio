import { describe, expect, it } from "vitest";
import type { ReservaRow } from "../reservas/reservas.types";
import type { ItemVentaCruda, VentaCruda } from "../historial/historial.types";
import {
  calcularEstadoReserva,
  calcularRango,
  construirFilasActividad,
  construirFilasDevoluciones,
  construirFilasPagos,
  construirFilasVentas,
  filtrarReservasParaReporte,
  obtenerRangoMes,
} from "./reportes.logic";
import type { DevolucionReporteCruda } from "./reportes.api";
import type { MovimientoPagoRow } from "../reservas/pagos.logic";

const AHORA = new Date("2026-01-14T15:00:00-03:00").getTime(); // miércoles

function crearReserva(overrides: Partial<ReservaRow> = {}): ReservaRow {
  return {
    id: "r1",
    fecha: "2026-01-14",
    hora_inicio: "10:00:00",
    hora_fin: "11:00:00",
    nombre: "Juan Pérez",
    telefono: "3775123456",
    precio: 20000,
    creado: new Date(AHORA).toISOString(),
    bloqueado: false,
    confirmada: true,
    pago_efectivo: 0,
    pago_transferencia: 0,
    turno_fijo_id: null,
    telefono_normalizado: null,
    hora_apertura_vigente: null,
    ...overrides,
  };
}

function crearItemCrudo(overrides: Partial<ItemVentaCruda> = {}): ItemVentaCruda {
  return {
    id: "item1",
    producto_id: "p1",
    cantidad: 3,
    precio_unitario_snapshot: 10000,
    costo_unitario_snapshot: 4000,
    subtotal: 30000,
    creado: new Date(AHORA).toISOString(),
    productos: { nombre: "Pelotas" },
    devoluciones: [],
    ...overrides,
  };
}

function crearVentaCruda(overrides: Partial<VentaCruda> = {}): VentaCruda {
  return {
    id: "v1",
    reserva_id: null,
    fecha: "2026-01-14",
    pago_efectivo: 30000,
    pago_transferencia: 0,
    total: 30000,
    creado: new Date(AHORA).toISOString(),
    reservas: null,
    venta_items: [crearItemCrudo()],
    ...overrides,
  };
}

// --- Rango de fechas ---------------------------------------------------

describe("calcularRango", () => {
  it("hoy: desde == hasta == la fecha de 'ahora'", () => {
    const r = calcularRango("hoy", AHORA);
    expect(r).toEqual({ desde: "2026-01-14", hasta: "2026-01-14" });
  });

  it("esta semana: lunes a domingo de la semana de 'ahora'", () => {
    const r = calcularRango("semana", AHORA);
    expect(r).toEqual({ desde: "2026-01-12", hasta: "2026-01-18" });
  });

  it("semana anterior: la semana previa completa", () => {
    const r = calcularRango("semanaAnterior", AHORA);
    expect(r).toEqual({ desde: "2026-01-05", hasta: "2026-01-11" });
  });

  it("este mes: primer y último día del mes de 'ahora'", () => {
    const r = calcularRango("mes", AHORA);
    expect(r).toEqual({ desde: "2026-01-01", hasta: "2026-01-31" });
  });

  it("este mes en febrero (28 días): último día correcto sin hardcodear 30/31", () => {
    const febrero = new Date("2026-02-10T12:00:00-03:00").getTime();
    const r = obtenerRangoMes(febrero);
    expect(r).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });

  it("personalizado válido: se respeta tal cual", () => {
    const r = calcularRango("personalizado", AHORA, { desde: "2026-01-01", hasta: "2026-01-10" });
    expect(r).toEqual({ desde: "2026-01-01", hasta: "2026-01-10" });
  });

  it("personalizado sin desde/hasta: null", () => {
    expect(calcularRango("personalizado", AHORA, {})).toBeNull();
    expect(calcularRango("personalizado", AHORA, { desde: "2026-01-01" })).toBeNull();
  });

  it("personalizado con desde > hasta: null (rango inválido)", () => {
    expect(calcularRango("personalizado", AHORA, { desde: "2026-01-10", hasta: "2026-01-01" })).toBeNull();
  });

  it("personalizado con desde == hasta: válido (un solo día)", () => {
    expect(calcularRango("personalizado", AHORA, { desde: "2026-01-05", hasta: "2026-01-05" })).toEqual({
      desde: "2026-01-05",
      hasta: "2026-01-05",
    });
  });
});

describe("calcularEstadoReserva", () => {
  it("jugada + confirmada -> JUGADO", () => {
    const r = crearReserva({ fecha: "2026-01-01", confirmada: true });
    expect(calcularEstadoReserva(r, AHORA)).toBe("JUGADO");
  });

  it("jugada + no confirmada -> NO CONFIRMADO", () => {
    const r = crearReserva({ fecha: "2026-01-01", confirmada: false });
    expect(calcularEstadoReserva(r, AHORA)).toBe("NO CONFIRMADO");
  });

  it("futura + confirmada -> CONFIRMADO", () => {
    const r = crearReserva({ fecha: "2026-02-01", confirmada: true });
    expect(calcularEstadoReserva(r, AHORA)).toBe("CONFIRMADO");
  });

  it("futura + no confirmada -> PENDIENTE", () => {
    const r = crearReserva({ fecha: "2026-02-01", confirmada: false });
    expect(calcularEstadoReserva(r, AHORA)).toBe("PENDIENTE");
  });

  // CFG-F2 — usa la apertura vigente EN SU MOMENTO (hora_apertura_vigente),
  // nunca un aperturaMin global de "hoy". 07:30 con vigente=07:00 no cruza
  // medianoche (horario normal de la mañana): el turno ya se jugó. Si se
  // reinterpretara con un aperturaMin global de 08:00 (como el default de
  // este archivo hasta CFG-F2), 07:30 < 08:00 correría el turno al día
  // SIGUIENTE y aparecería como "CONFIRMADO"/"PENDIENTE" en vez de jugado.
  it("usa la apertura vigente propia de la reserva, no la de hoy", () => {
    const r = crearReserva({
      fecha: "2026-01-01",
      hora_inicio: "07:30:00",
      hora_fin: "08:30:00",
      hora_apertura_vigente: "07:00:00",
      confirmada: true,
    });
    expect(calcularEstadoReserva(r, AHORA)).toBe("JUGADO");
  });
});

describe("filtrarReservasParaReporte", () => {
  it("excluye bloqueos, aunque estén confirmados", () => {
    const bloqueo = crearReserva({ id: "b1", bloqueado: true, confirmada: true, nombre: "Bloqueado" });
    const real = crearReserva({ id: "r1" });
    expect(filtrarReservasParaReporte([bloqueo, real], AHORA).map((r) => r.id)).toEqual(["r1"]);
  });

  it("incluye confirmadas y pendientes recientes (<15min), excluye pendientes vencidas", () => {
    const confirmada = crearReserva({ id: "c1", confirmada: true });
    const pendienteReciente = crearReserva({
      id: "p1",
      confirmada: false,
      creado: new Date(AHORA - 5 * 60 * 1000).toISOString(),
    });
    const pendienteVencida = crearReserva({
      id: "p2",
      confirmada: false,
      creado: new Date(AHORA - 20 * 60 * 1000).toISOString(),
    });
    const ids = filtrarReservasParaReporte([confirmada, pendienteReciente, pendienteVencida], AHORA).map((r) => r.id);
    expect(ids).toContain("c1");
    expect(ids).toContain("p1");
    expect(ids).not.toContain("p2");
  });
});

// --- Hojas financieras (FINAL-F6) ------------------------------------------

function mov(overrides: Partial<MovimientoPagoRow> = {}): MovimientoPagoRow {
  return {
    id: "m1",
    reserva_id: "r1",
    operacion_id: "0a1b2c3d-0000-0000-0000-000000000000",
    creado: "2026-01-14T21:30:00-03:00",
    fecha: "2026-01-14",
    medio: "efectivo",
    importe: 5000,
    tipo: "cobro",
    motivo: null,
    actor_id: null,
    reserva_fecha: "2026-01-20",
    reserva_hora_inicio: "22:00:00",
    reserva_hora_fin: "23:30:00",
    reserva_nombre: "Juan Pérez",
    reserva_turno_fijo: false,
    ...overrides,
  };
}

describe("construirFilasPagos", () => {
  it("un renglón por movimiento, por fecha contable; la fecha del turno es solo informativa", () => {
    const [f] = construirFilasPagos([mov()]);
    expect(f).toMatchObject({ fecha: "2026-01-14", hora: "21:30", tipo: "Cobro", medio: "efectivo", importe: 500000, turnoFecha: "2026-01-20", turnoHorario: "22:00 - 23:30", jugador: "Juan Pérez", turnoFijo: "No", reservaEliminada: "", operacion: "0A1B2C3D" });
  });
  it("reintegros con signo negativo y motivo; reserva eliminada marcada", () => {
    const [f] = construirFilasPagos([mov({ tipo: "reintegro", importe: -2500.5, motivo: "cancelación", reserva_id: null })]);
    expect([f.tipo, f.importe, f.motivo, f.reservaEliminada]).toEqual(["Reintegro", -250050, "cancelación", "Sí"]);
  });
  it("saldo_migrado NO es un movimiento de caja: no aparece", () => {
    expect(construirFilasPagos([mov({ tipo: "saldo_migrado", motivo: "x" })])).toHaveLength(0);
  });
  it("hora y fecha en Buenos Aires aunque el instante venga en UTC", () => {
    const [f] = construirFilasPagos([mov({ creado: "2026-01-15T03:20:00Z", fecha: "2026-01-15" })]);
    expect([f.fecha, f.hora]).toEqual(["2026-01-15", "00:20"]);
  });
});

describe("construirFilasVentas", () => {
  it("un renglón por ítem VENDIDO; el pago una sola vez por venta; sin columnas de devolución", () => {
    const venta = crearVentaCruda({
      pago_efectivo: 4000,
      pago_transferencia: 2000,
      total: 6000,
      venta_items: [
        crearItemCrudo({ id: "a", cantidad: 2, precio_unitario_snapshot: 1000, costo_unitario_snapshot: 400, devoluciones: [{ cantidad: 2, medio_reembolso: "efectivo" }] }),
        crearItemCrudo({ id: "b", cantidad: 1, precio_unitario_snapshot: 4000, costo_unitario_snapshot: 1500 }),
      ],
    });
    const filas = construirFilasVentas([venta]);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ fecha: "2026-01-14", venta: "V1", cantidad: 2, subtotal: 200000, costoTotal: 80000, margen: 120000, pagoEfectivo: 400000, pagoTransferencia: 200000 });
    expect(filas[1]).toMatchObject({ fecha: "", hora: "", reservaAsociada: "", cantidad: 1, subtotal: 400000, pagoEfectivo: "", pagoTransferencia: "" });
    // la devolución (aunque sea total) NO modifica la hoja de ventas
    expect(filas.reduce((a, f) => a + f.subtotal, 0)).toBe(600000);
  });
  it("venta suelta vs venta atada", () => {
    expect(construirFilasVentas([crearVentaCruda()])[0].reservaAsociada).toBe("Venta suelta");
    const atada = crearVentaCruda({ reservas: { id: "r1", nombre: "Ana", fecha: "2026-01-13", hora_inicio: "20:00:00", hora_fin: "21:00:00", confirmada: true } });
    expect(construirFilasVentas([atada])[0].reservaAsociada).toBe("Ana (turno 2026-01-13)");
  });
});

describe("construirFilasDevoluciones", () => {
  const dev = (o: Partial<DevolucionReporteCruda> = {}): DevolucionReporteCruda => ({
    id: "d1",
    creado: "2026-01-14T10:00:00-03:00",
    fecha: "2026-01-14",
    cantidad: 3,
    medio_reembolso: "transferencia",
    motivo: "vencido",
    venta_items: { precio_unitario_snapshot: 333.33, productos: { nombre: "Barrita" }, ventas: { id: "ffffeeee-1111-2222-3333-444455556666", fecha: "2026-01-05", creado: "2026-01-05T10:00:00-03:00" } },
    ...o,
  });
  it("importe exacto en centavos y referencia a la venta original de otro período", () => {
    const [f] = construirFilasDevoluciones([dev()]);
    expect(f).toMatchObject({ fecha: "2026-01-14", venta: "FFFFEEEE", fechaVenta: "2026-01-05", producto: "Barrita", cantidad: 3, precioUnitario: 33333, importe: 99999, medio: "transferencia", motivo: "vencido" });
  });
});

describe("construirFilasActividad (operativa)", () => {
  it("precio / registrado / saldo por turno, sin bloqueos", () => {
    const filas = construirFilasActividad(
      [crearReserva({ id: "a", precio: 10000, pago_efectivo: 4000, pago_transferencia: 1000.5 }), crearReserva({ id: "b", bloqueado: true })],
      AHORA,
    );
    expect(filas).toHaveLength(1);
    expect([filas[0].precio, filas[0].registrado, filas[0].saldo]).toEqual([1000000, 500050, 499950]);
  });
});
