/** @vitest-environment jsdom */
// Tests de CajaView — FINAL-F6. Caja muestra SOLO movimientos reales (pagos de
// reservas, ventas, devoluciones) por fecha contable; las reservas jugadas
// alimentan un bloque OPERATIVO aparte (no-caja). La matemática pura está en
// caja.logic.test.ts; la reconciliación DB = Caja = Excel, en
// reportes/reconciliacion.contable.test.ts.

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { obtenerDatosPublicosCancha } from "../configuracion/configuracion.api";
import { obtenerFranjaOperativa } from "../../reservations-public/reservations.api";
import { obtenerDevolucionesParaCaja, obtenerMovimientosPagoParaCaja, obtenerVentasParaCaja } from "./caja.api";
import { CajaView, type CajaViewProps } from "./CajaView";
import { ReservasView } from "../reservas/ReservasView";
import { obtenerMovimientosPago, obtenerReservasPorRango, obtenerReservasProximas, registrarMovimientoPago } from "../reservas/reservas.api";
import type { ReservaRow } from "../reservas/reservas.types";
import { useReservasJugadas } from "../reservas/useReservasJugadas";
import { useReservasProximas } from "../reservas/useReservasProximas";

vi.mock("../reservas/reservas.api", () => ({
  obtenerReservasProximas: vi.fn(),
  obtenerReservasPorRango: vi.fn(),
  confirmarReserva: vi.fn(),
  cancelarReserva: vi.fn(),
  registrarMovimientoPago: vi.fn(),
  obtenerMovimientosPago: vi.fn(),
  buscarReservas: vi.fn(),
}));

vi.mock("./caja.api", () => ({
  obtenerMovimientosPagoParaCaja: vi.fn(),
  obtenerVentasParaCaja: vi.fn(),
  obtenerDevolucionesParaCaja: vi.fn(),
}));

vi.mock("../configuracion/configuracion.api", () => ({
  obtenerDatosPublicosCancha: vi.fn(),
}));

vi.mock("../../reservations-public/reservations.api", () => ({
  obtenerFranjaOperativa: vi.fn(),
}));

function CajaViewConJugadas(props: Omit<CajaViewProps, "jugadas">) {
  const jugadas = useReservasJugadas();
  return <CajaView {...props} jugadas={jugadas} />;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const AHORA_FIJO = new Date("2026-06-17T12:00:00-03:00");

function crearReserva(overrides: Partial<ReservaRow> = {}): ReservaRow {
  return {
    id: "r1",
    fecha: "2026-06-17",
    hora_inicio: "08:00:00",
    hora_fin: "09:00:00",
    nombre: "Juan",
    telefono: "3771111111",
    precio: 20000,
    creado: new Date().toISOString(),
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

const mov = (fecha: string, medio: string, importe: number, tipo = "cobro") => ({ id: `${fecha}-${medio}-${importe}`, creado: `${fecha}T10:00:00-03:00`, fecha, medio, importe, tipo });
const ok = <T,>(data: T[]) => ({ data, error: null });

function mockearCargas(jugadasData: ReservaRow[], movimientos: unknown[] = []) {
  vi.mocked(obtenerReservasProximas).mockResolvedValue({ data: [], error: null } as never);
  vi.mocked(obtenerReservasPorRango).mockResolvedValue({ data: jugadasData, error: null } as never);
  vi.mocked(obtenerMovimientosPagoParaCaja).mockResolvedValue(ok(movimientos) as never);
  vi.mocked(obtenerVentasParaCaja).mockResolvedValue(ok([]) as never);
  vi.mocked(obtenerDevolucionesParaCaja).mockResolvedValue(ok([]) as never);
  vi.mocked(obtenerMovimientosPago).mockResolvedValue({ data: [], error: null } as never);
  vi.mocked(obtenerDatosPublicosCancha).mockResolvedValue({ data: { nombre_cancha: "Los amigos padel" }, error: null } as never);
  vi.mocked(obtenerFranjaOperativa).mockResolvedValue({
    data: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "01:00:00" }],
    error: null,
  } as never);
}

function netoHero() {
  return screen.getByText("Caja semanal").nextElementSibling?.textContent;
}

describe("CajaView — importes = movimientos reales", () => {
  it("sin movimientos: todo en $0", async () => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    const cierre = await screen.findByLabelText("Cierre de caja");
    // Bruto, Neto, Efectivo, Transferencia, Pagos de reservas, Productos, Devoluciones
    await waitFor(() => expect(within(cierre).getAllByText("$0")).toHaveLength(7));
    expect(netoHero()).toBe("$0");
  });

  it("una seña cobrada hoy para un turno futuro entra HOY, aunque el turno no se haya jugado", async () => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([], [mov("2026-06-17", "transferencia", 5000)]);
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByText("Caja semanal");
    await waitFor(() => expect(netoHero()).toBe("$5.000"));
    expect(obtenerMovimientosPagoParaCaja).toHaveBeenCalledWith("2026-06-15", "2026-06-21");
  });

  it("reintegros restan y se muestra el desglose", async () => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([], [mov("2026-06-16", "efectivo", 10000), mov("2026-06-17", "efectivo", -4000, "reintegro")]);
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    await waitFor(() => expect(netoHero()).toBe("$6.000"));
    expect(screen.getByText(/cobros \$10\.000/)).toBeTruthy();
    expect(screen.getByText(/reintegros \$4\.000/)).toBeTruthy();
  });

  it("un turno jugado sin pago NO suma a Caja: aparece solo en el bloque operativo", async () => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([crearReserva({ id: "j1", nombre: "Turno Hoy" })]);
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    const operativo = await screen.findByLabelText("Turnos jugados (operativo)");
    await waitFor(() => expect(within(operativo).getByText("$20.000")).toBeTruthy());
    expect(within(operativo).getByText(/Hay 1 turno jugado esta semana sin ningún pago cargado\./)).toBeTruthy();
    expect(netoHero()).toBe("$0");
  });

  it("saldo migrado sin fecha real: excluido y avisado", async () => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([], [mov("2026-06-16", "efectivo", 7000, "saldo_migrado")]);
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByText(/pagos migrados sin fecha real de cobro no se cuentan/);
    expect(netoHero()).toBe("$0");
  });

  it("botón Exportar abre el modal de exportación", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByText("Caja semanal");
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    const modal = screen.getByRole("dialog", { name: "Exportar reporte de caja y actividad" });
    expect(within(modal).getByRole("button", { name: "Esta semana" })).toBeTruthy();
  });
});

describe("CajaView + ReservasView — un cobro en Reservas llega a Caja por movimientos", () => {
  function ReservasYCajaConJugadas() {
    const jugadas = useReservasJugadas();
    const proximas = useReservasProximas();
    return (
      <>
        <ReservasView mostrarToast={vi.fn()} jugadas={jugadas} proximas={proximas} />
        <CajaView mostrarToast={vi.fn()} jugadas={jugadas} />
      </>
    );
  }

  it("cobrar un turno jugado: Caja refetchea sus movimientos y el operativo se actualiza", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([crearReserva({ id: "j1", nombre: "Turno Sin Pago" })]);
    vi.mocked(registrarMovimientoPago).mockResolvedValue({
      data: { operacion_id: "op", reserva_id: "j1", pago_efectivo: 20000, pago_transferencia: 0, repetido: false },
      error: null,
    } as never);

    render(<ReservasYCajaConJugadas />);
    await user.click(screen.getByRole("tab", { name: /Jugadas/ }));
    const jugadasPanel = await screen.findByLabelText("Jugadas");
    await waitFor(() => expect(within(jugadasPanel).getByText(/Turno Sin Pago/)).toBeTruthy());
    const operativo = screen.getByLabelText("Turnos jugados (operativo)");
    await waitFor(() => expect(within(operativo).getByText(/sin ningún pago cargado/)).toBeTruthy());

    await user.click(within(jugadasPanel).getByRole("button", { name: "Turno Sin Pago" }));
    const detalle = screen.getByTestId("detalle-reserva");
    await user.click(within(detalle).getByRole("button", { name: "Cargar pago" }));
    const modal = screen.getByRole("dialog", { name: "Pago del turno" });
    // Efectivo ya viene seleccionado con el saldo completo precargado.
    // Lo que el servidor devuelve DESPUÉS del cobro (movimientos y snapshot).
    vi.mocked(obtenerMovimientosPagoParaCaja).mockResolvedValue(ok([mov("2026-06-17", "efectivo", 20000)]) as never);
    vi.mocked(obtenerReservasPorRango).mockResolvedValue({ data: [crearReserva({ id: "j1", nombre: "Turno Sin Pago", pago_efectivo: 20000 })], error: null } as never);
    await user.click(within(modal).getByRole("button", { name: "Registrar cobro" }));

    await waitFor(() => expect(netoHero()).toBe("$20.000"));
    expect(within(operativo).queryByText(/sin ningún pago cargado/)).toBeNull();
    expect(registrarMovimientoPago).toHaveBeenCalledWith(expect.objectContaining({ reservaId: "j1", tipo: "cobro", efectivo: 20000, transferencia: 0, esperadoEfectivo: 0, esperadoTransferencia: 0 }));
  });
});

describe("Caja completa — carga y errores por fuente", () => {
  const apiDe = (fuente: string) =>
    fuente === "movimientos" ? obtenerMovimientosPagoParaCaja : fuente === "ventas" ? obtenerVentasParaCaja : obtenerDevolucionesParaCaja;

  it.each(["movimientos", "ventas", "devoluciones"])("oculta importes mientras falta %s", async (fuente) => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    let resolve!: (value: unknown) => void;
    vi.mocked(apiDe(fuente)).mockReturnValueOnce(new Promise((r) => { resolve = r; }) as never);
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    const cierre = screen.getByLabelText("Cierre de caja");
    expect(within(cierre).getByRole("status").textContent).toContain("Cargando caja completa");
    expect(within(cierre).queryByText(/^\$/)).toBeNull();
    expect((screen.getByRole("button", { name: "Exportar" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolve({ data: [], error: null }));
    await waitFor(() => expect(within(cierre).queryByRole("status")).toBeNull());
    expect(within(cierre).getAllByText("$0")).toHaveLength(7);
  });

  it.each(["movimientos", "ventas", "devoluciones"])("error de %s oculta totales y permite retry", async (fuente) => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    vi.mocked(apiDe(fuente)).mockResolvedValueOnce({ data: null, error: { message: "fallo" } } as never);
    const user = userEvent.setup();
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    const cierre = screen.getByLabelText("Cierre de caja");
    await within(cierre).findByRole("alert");
    expect(within(cierre).queryByText(/^\$/)).toBeNull();
    await user.click(within(cierre).getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(within(cierre).queryByRole("alert")).toBeNull());
    await waitFor(() => expect(within(cierre).getAllByText("$0")).toHaveLength(7));
  });

  it("una promesa rechazada ofrece retry", async () => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    vi.mocked(obtenerVentasParaCaja).mockRejectedValueOnce(new Error("offline"));
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    const cierre = screen.getByLabelText("Cierre de caja");
    await within(cierre).findByRole("alert");
    expect(within(cierre).getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });

  it("semana anterior: pide el rango contable anterior", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByText("Caja semanal");
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await waitFor(() => expect(obtenerMovimientosPagoParaCaja).toHaveBeenCalledWith("2026-06-08", "2026-06-14"));
    expect(obtenerVentasParaCaja).toHaveBeenCalledWith("2026-06-08", "2026-06-14");
    expect(obtenerDevolucionesParaCaja).toHaveBeenCalledWith("2026-06-08", "2026-06-14");
  });
});

describe("cache de semanas (stale-while-revalidate en ambas)", () => {
  const pedidosVentas = () => vi.mocked(obtenerVentasParaCaja).mock.calls.length;

  async function cargarActualYAnterior(user: ReturnType<typeof userEvent.setup>) {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    render(<CajaViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByText("Caja semanal");
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await screen.findByText("Caja semanal");
    await waitFor(() => expect(pedidosVentas()).toBe(2));
  }

  it("volver a una semana ya vista muestra el caché al instante y revalida en background", async () => {
    const user = userEvent.setup();
    await cargarActualYAnterior(user);
    let resolver!: (v: unknown) => void;
    vi.mocked(obtenerVentasParaCaja).mockReturnValueOnce(new Promise((r) => { resolver = r; }) as never);
    await user.click(screen.getByRole("button", { name: "Actual" }));
    const cierre = screen.getByLabelText("Cierre de caja");
    expect(within(cierre).queryByRole("status")).toBeNull();
    expect(netoHero()).toBe("$0");
    expect(screen.getByText("Actualizando…")).toBeTruthy();
    expect(pedidosVentas()).toBe(3);
    await act(async () => resolver({ data: [{ id: "v", creado: "", fecha: "2026-06-17", pago_efectivo: 3000, pago_transferencia: 0, total: 3000 }], error: null }));
    await waitFor(() => expect(netoHero()).toBe("$3.000"));
  });

  it("la semana Anterior también se revalida (otro dispositivo pudo registrar algo)", async () => {
    const user = userEvent.setup();
    await cargarActualYAnterior(user);
    await user.click(screen.getByRole("button", { name: "Actual" }));
    await waitFor(() => expect(screen.queryByText("Actualizando…")).toBeNull());
    const antes = pedidosVentas();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await waitFor(() => expect(pedidosVentas()).toBe(antes + 1));
  });

  it("si falla la revalidación conserva el caché y ofrece reintentar", async () => {
    const user = userEvent.setup();
    await cargarActualYAnterior(user);
    vi.mocked(obtenerVentasParaCaja).mockResolvedValueOnce({ data: null, error: { message: "fallo" } } as never);
    await user.click(screen.getByRole("button", { name: "Actual" }));
    await screen.findByText(/No se pudo actualizar/);
    expect(netoHero()).toBe("$0");
  });
});
