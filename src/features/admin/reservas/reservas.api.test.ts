// FINAL-F4 (M6/M8) — las mutaciones de reservas exigen EXACTAMENTE una fila
// afectada: PostgREST devuelve `error: null` con 0 filas (reserva purgada por el
// cron / borrada por otro admin / filtrada por RLS) y eso NO puede parecer éxito.
// El cliente Supabase se mockea a nivel de query builder — no golpea Supabase real.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const select = vi.fn();
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const rpc = vi.fn();
  return { select, eq, update, from, rpc };
});
vi.mock("../../../lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

import { cancelarReserva, confirmarReserva, registrarMovimientoPago } from "./reservas.api";
import { ERROR_RESERVA_INEXISTENTE } from "./reservas.logic";

beforeEach(() => vi.clearAllMocks());

describe("confirmarReserva — M6", () => {
  it("reserva existente (1 fila): ok, sin error", async () => {
    mocks.select.mockResolvedValue({ data: [{ id: "r1" }], error: null });
    const r = await confirmarReserva("r1");
    expect(r.error).toBeNull();
    expect(mocks.from).toHaveBeenCalledWith("reservas");
    expect(mocks.update).toHaveBeenCalledWith({ confirmada: true });
    expect(mocks.eq).toHaveBeenCalledWith("id", "r1");
    expect(mocks.select).toHaveBeenCalledWith("id");
  });

  it("reserva purgada (0 filas, error null de PostgREST): es ERROR, no éxito", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    const r = await confirmarReserva("r1");
    expect(r.error?.message).toBe(ERROR_RESERVA_INEXISTENTE);
  });

  it("data null: también error", async () => {
    mocks.select.mockResolvedValue({ data: null, error: null });
    expect((await confirmarReserva("r1")).error?.message).toBe(ERROR_RESERVA_INEXISTENTE);
  });

  it("más de una fila afectada (imposible por PK, pero se rechaza): error", async () => {
    mocks.select.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }], error: null });
    expect((await confirmarReserva("r1")).error?.message).toBe(ERROR_RESERVA_INEXISTENTE);
  });

  it("error real de Supabase: se propaga tal cual", async () => {
    const pgErr = { message: "boom", code: "XX000" };
    mocks.select.mockResolvedValue({ data: null, error: pgErr });
    expect((await confirmarReserva("r1")).error).toBe(pgErr);
  });
});

describe("registrarMovimientoPago — FINAL-F6 (RPC, sin UPDATE directo)", () => {
  const params = { reservaId: "r1", operacionId: "op-1", tipo: "cobro" as const, efectivo: 500, transferencia: 250, motivo: null, esperadoEfectivo: 0, esperadoTransferencia: 0 };
  it("llama a la RPC con la clave de idempotencia y lo esperado; nunca hace UPDATE", async () => {
    mocks.rpc.mockResolvedValue({ data: { reserva_id: "r1", pago_efectivo: 500, pago_transferencia: 250, repetido: false }, error: null });
    const r = await registrarMovimientoPago(params);
    expect(r.error).toBeNull();
    expect(r.data?.pago_efectivo).toBe(500);
    expect(mocks.rpc).toHaveBeenCalledWith("registrar_movimiento_pago", {
      p_reserva_id: "r1", p_operacion_id: "op-1", p_tipo: "cobro", p_efectivo: 500, p_transferencia: 250, p_motivo: null,
      p_esperado_efectivo: 0, p_esperado_transferencia: 0,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("error del servidor: se propaga intacto (pago_desactualizado, IK001, ...)", async () => {
    const pgErr = { message: "pago_desactualizado", code: "RP006" };
    mocks.rpc.mockResolvedValue({ data: null, error: pgErr });
    const r = await registrarMovimientoPago(params);
    expect(r.error).toBe(pgErr);
    expect(r.data).toBeNull();
  });
});

describe("cancelarReserva — M8 (RPC admin_eliminar_reserva)", () => {
  it("llama a la RPC con el id y devuelve ok si borró (true)", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const r = await cancelarReserva("r1");
    expect(r.error).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("admin_eliminar_reserva", { p_reserva_id: "r1" });
    expect(mocks.from).not.toHaveBeenCalled(); // ya no hay DELETE directo
  });

  it("la reserva no existe (false): error reserva_inexistente, no éxito", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await cancelarReserva("r1")).error?.message).toBe(ERROR_RESERVA_INEXISTENTE);
  });

  it("data null: error (nunca se asume éxito sin un true explícito)", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await cancelarReserva("r1")).error?.message).toBe(ERROR_RESERVA_INEXISTENTE);
  });

  it("rechazo del servidor por dinero: el error de la RPC llega intacto", async () => {
    const pgErr = { message: "reserva_con_ventas", code: "RD001" };
    mocks.rpc.mockResolvedValue({ data: null, error: pgErr });
    expect((await cancelarReserva("r1")).error).toBe(pgErr);
  });
});
