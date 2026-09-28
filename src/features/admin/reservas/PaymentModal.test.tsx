/** @vitest-environment jsdom */
// PaymentModal — FINAL-F6. Se prueba aislado, con `registrar` y
// `cargarMovimientos` inyectados (sin Supabase).

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentModal } from "./PaymentModal";
import type { ParametrosMovimientoPago } from "./reservas.api";
import type { MovimientoPagoRow } from "./pagos.logic";
import type { ReservaProcesada } from "./reservas.types";

vi.mock("./reservas.api", () => ({ registrarMovimientoPago: vi.fn(), obtenerMovimientosPago: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function reserva(o: Partial<ReservaProcesada> = {}): ReservaProcesada {
  return {
    id: "r1", fecha: "2026-09-20", hora_inicio: "23:30:00", hora_fin: "01:00:00", horaInicio: "23:30", horaFin: "01:00",
    nombre: "Pedro", telefono: "1155551234", precio: 10000, creado: null, bloqueado: false, confirmada: true,
    pago_efectivo: 0, pago_transferencia: 0, turno_fijo_id: null, telefono_normalizado: null, hora_apertura_vigente: "08:00:00",
    ...o,
  } as ReservaProcesada;
}

const ok = (ef: number, tr: number, repetido = false) => Promise.resolve({ data: { operacion_id: "op", reserva_id: "r1", pago_efectivo: ef, pago_transferencia: tr, repetido }, error: null });
const sinHistorial = () => Promise.resolve({ data: [] as MovimientoPagoRow[], error: null });

function montar(r: ReservaProcesada, registrar: (p: ParametrosMovimientoPago) => Promise<unknown>, extra: Partial<Parameters<typeof PaymentModal>[0]> = {}) {
  const onGuardado = vi.fn();
  const onDesactualizado = vi.fn();
  render(
    <PaymentModal reserva={r} onClose={vi.fn()} onGuardado={onGuardado} onDesactualizado={onDesactualizado}
      registrar={registrar as never} cargarMovimientos={extra.cargarMovimientos ?? sinHistorial} />,
  );
  return { modal: screen.getByRole("dialog", { name: "Pago del turno" }), onGuardado, onDesactualizado };
}

const boton = (modal: HTMLElement, nombre: string) => within(modal).getByRole("button", { name: nombre });
const inputEf = (modal: HTMLElement) => within(modal).getByLabelText("Monto en efectivo") as HTMLInputElement;
const inputTr = (modal: HTMLElement) => within(modal).getByLabelText("Monto en transferencia") as HTMLInputElement;
const guardarCobro = (modal: HTMLElement) => boton(modal, "Registrar cobro") as HTMLButtonElement;

describe("PaymentModal — cobrar (Efectivo / Transferencia / Mixto sobre el saldo)", () => {
  it("abre en Efectivo con el saldo completo precargado y muestra el resumen", () => {
    const { modal } = montar(reserva({ precio: 20000 }), vi.fn());
    expect(boton(modal, "Efectivo").getAttribute("aria-pressed")).toBe("true");
    expect(within(modal).getByTestId("cobro-resumen").textContent).toBe("Cobro: $20.000 en efectivo");
    expect(within(modal).getByTestId("pago-resultado").textContent).toContain("+$20.000 efectivo");
    expect(guardarCobro(modal).disabled).toBe(false);
    expect(within(modal).queryByRole("button", { name: /Saldo .* en (efectivo|transferencia)/ })).toBeNull();
  });

  it("Efectivo: manda el saldo completo en efectivo y 0 transferencia (F6 intacto: cobro + operacion_id + esperados)", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn(() => ok(20000, 0));
    const { modal, onGuardado } = montar(reserva({ precio: 20000 }), registrar);
    await user.click(guardarCobro(modal));
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(registrar).toHaveBeenCalledWith({
      reservaId: "r1", operacionId: expect.any(String), tipo: "cobro", efectivo: 20000, transferencia: 0, motivo: null,
      esperadoEfectivo: 0, esperadoTransferencia: 0,
    });
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
  });

  it("Transferencia: manda 0 efectivo y el saldo completo por transferencia", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn(() => ok(0, 20000));
    const { modal } = montar(reserva({ precio: 20000 }), registrar);
    await user.click(boton(modal, "Transferencia"));
    expect(within(modal).getByTestId("cobro-resumen").textContent).toBe("Cobro: $20.000 por transferencia");
    await user.click(guardarCobro(modal));
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "cobro", efectivo: 0, transferencia: 20000 }));
  });

  it("con un pago previo el importe de referencia es el SALDO, no el precio", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn(() => ok(10000, 5000));
    const { modal } = montar(reserva({ precio: 20000, pago_efectivo: 5000 }), registrar);
    expect(within(modal).getByTestId("cobro-resumen").textContent).toBe("Cobro: $15.000 en efectivo");
    await user.click(boton(modal, "Transferencia"));
    expect(within(modal).getByTestId("cobro-resumen").textContent).toBe("Cobro: $15.000 por transferencia");
    await user.click(guardarCobro(modal));
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ efectivo: 0, transferencia: 15000, esperadoEfectivo: 5000, esperadoTransferencia: 0 }));
  });

  it("Mixto: cambiar efectivo recalcula transferencia y viceversa (siempre suman el saldo)", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn(() => ok(15000, 5000));
    const { modal } = montar(reserva({ precio: 20000 }), registrar);
    await user.click(boton(modal, "Mixto"));
    expect(inputEf(modal).value).toBe("20000");
    expect(inputTr(modal).value).toBe("0");

    await user.clear(inputEf(modal));
    await user.type(inputEf(modal), "8000");
    expect(inputEf(modal).value).toBe("8000");
    expect(inputTr(modal).value).toBe("12000");

    await user.clear(inputTr(modal));
    await user.type(inputTr(modal), "5000");
    expect(inputTr(modal).value).toBe("5000");
    expect(inputEf(modal).value).toBe("15000");
    expect(within(modal).getByTestId("pago-resultado").textContent).toContain("+$15.000 efectivo · +$5.000 transferencia");

    await user.click(guardarCobro(modal));
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "cobro", efectivo: 15000, transferencia: 5000 }));
  });

  it("Mixto: la suma es exactamente el saldo en cada tecla, con centavos", async () => {
    const user = userEvent.setup();
    const { modal } = montar(reserva({ precio: 10000, pago_efectivo: 0.5 }), vi.fn());
    await user.click(boton(modal, "Mixto"));
    await user.clear(inputEf(modal));
    for (const tecla of "1234.56") {
      await user.type(inputEf(modal), tecla);
      const suma = Math.round(Number(inputEf(modal).value || 0) * 100) + Math.round(Number(inputTr(modal).value || 0) * 100);
      expect(suma).toBe(999950);
    }
    expect(inputTr(modal).value).toBe("8764.94");
  });

  it("Mixto: no deja superar el saldo ni cargar negativos", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn(() => ok(0, 0));
    const { modal } = montar(reserva({ precio: 10000, pago_efectivo: 5000 }), registrar);
    await user.click(boton(modal, "Mixto"));
    await user.clear(inputEf(modal));
    await user.type(inputEf(modal), "5001");
    expect(inputEf(modal).value).toBe("5000");
    expect(inputTr(modal).value).toBe("0");
    await user.clear(inputTr(modal));
    await user.type(inputTr(modal), "-3");
    expect(inputTr(modal).value).not.toContain("-");
    expect(within(modal).queryByRole("alert")).toBeNull();
    expect(guardarCobro(modal).disabled).toBe(false);
  });

  it("turno ya saldado: no hay nada que cobrar y no se puede guardar", () => {
    const { modal } = montar(reserva({ pago_efectivo: 10000 }), vi.fn());
    expect(within(modal).getByText("El turno no tiene saldo pendiente.")).toBeTruthy();
    expect(guardarCobro(modal).disabled).toBe(true);
  });

  it("volver a Cobrar desde Reintegrar restaura Efectivo con el saldo", async () => {
    const user = userEvent.setup();
    const { modal } = montar(reserva({ precio: 20000, pago_efectivo: 5000 }), vi.fn());
    await user.click(boton(modal, "Transferencia"));
    await user.click(boton(modal, "Reintegrar"));
    await user.click(boton(modal, "Cobrar"));
    expect(boton(modal, "Efectivo").getAttribute("aria-pressed")).toBe("true");
    expect(within(modal).getByTestId("cobro-resumen").textContent).toBe("Cobro: $15.000 en efectivo");
  });

  it("pago_desactualizado: mensaje, bloqueo del modal y aviso al llamador (sin cambios)", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn(() => Promise.resolve({ data: null, error: { message: "pago_desactualizado" } }));
    const { modal, onDesactualizado } = montar(reserva({ precio: 20000 }), registrar);
    await user.click(guardarCobro(modal));
    await within(modal).findByText(/Otro admin u otra pestaña registró un movimiento/);
    expect(onDesactualizado).toHaveBeenCalled();
    expect(guardarCobro(modal).disabled).toBe(true);
    expect((boton(modal, "Mixto") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("PaymentModal — reintegrar (mismo medio) y corregir", () => {
  it("reintegro por un medio en el que no se cobró: el input está deshabilitado", async () => {
    const user = userEvent.setup();
    const { modal } = montar(reserva({ pago_transferencia: 5000 }), vi.fn());
    await user.click(within(modal).getByRole("button", { name: "Reintegrar" }));
    expect((within(modal).getByLabelText("Efectivo devuelto") as HTMLInputElement).disabled).toBe(true);
  });

  it("reintegro mayor a lo cobrado en ese medio: bloqueado con mensaje claro", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn();
    const { modal } = montar(reserva({ pago_efectivo: 3000, pago_transferencia: 5000 }), registrar);
    await user.click(within(modal).getByRole("button", { name: "Reintegrar" }));
    await user.type(within(modal).getByLabelText("Efectivo devuelto"), "4000");
    await user.type(within(modal).getByLabelText(/Motivo/), "cancelación");
    expect(within(modal).getByRole("alert").textContent).toMatch(/mismo medio del cobro/);
    expect((within(modal).getByRole("button", { name: "Registrar reintegro" }) as HTMLButtonElement).disabled).toBe(true);
    expect(registrar).not.toHaveBeenCalled();
  });

  it("reintegro válido exige motivo y manda el importe positivo", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn(() => ok(0, 0));
    const { modal } = montar(reserva({ pago_transferencia: 5000 }), registrar);
    await user.click(within(modal).getByRole("button", { name: "Reintegrar" }));
    await user.type(within(modal).getByLabelText("Transferencia devuelto"), "5000");
    expect((within(modal).getByRole("button", { name: "Registrar reintegro" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(modal).getByLabelText(/Motivo/), "Canceló, se devolvió la seña");
    await user.click(within(modal).getByRole("button", { name: "Registrar reintegro" }));
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "reintegro", efectivo: 0, transferencia: 5000, motivo: "Canceló, se devolvió la seña" }));
  });

  it("corregir: valores finales + motivo + confirmación explícita", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn(() => ok(0, 5000));
    const { modal } = montar(reserva({ pago_efectivo: 5000 }), registrar);
    await user.click(within(modal).getByRole("button", { name: "Corregir" }));
    const ef = within(modal).getByLabelText("Efectivo correcto") as HTMLInputElement;
    expect(ef.value).toBe("5000");
    expect((within(modal).getByRole("button", { name: "Registrar corrección" }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(ef);
    await user.type(ef, "0");
    await user.clear(within(modal).getByLabelText("Transferencia correcto"));
    await user.type(within(modal).getByLabelText("Transferencia correcto"), "5000");
    await user.type(within(modal).getByLabelText(/Motivo/), "Se cargó efectivo pero fue transferencia");
    await user.click(within(modal).getByRole("button", { name: "Registrar corrección" }));
    const confirmacion = screen.getByRole("dialog", { name: "Confirmar corrección de pago" });
    expect(confirmacion.textContent).toContain("no para devolver dinero");
    expect(registrar).not.toHaveBeenCalled();
    await user.click(within(confirmacion).getByRole("button", { name: "Registrar corrección" }));
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "correccion", efectivo: 0, transferencia: 5000, esperadoEfectivo: 5000 }));
  });
});

describe("PaymentModal — idempotencia", () => {
  it("timeout + retry: la MISMA operacion_id; nunca se genera otra para la misma operación", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn<(p: ParametrosMovimientoPago) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockImplementationOnce(() => ok(10000, 0, true));
    const { modal, onGuardado } = montar(reserva(), registrar);
    await user.click(within(modal).getByRole("button", { name: "Registrar cobro" }));
    await within(modal).findByText(/No hubo respuesta del servidor/);
    await user.click(within(modal).getByRole("button", { name: "Registrar cobro" }));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(registrar).toHaveBeenCalledTimes(2);
    expect(registrar.mock.calls[0][0].operacionId).toBe(registrar.mock.calls[1][0].operacionId);
  });

  it("doble click: una sola llamada en vuelo", async () => {
    const user = userEvent.setup();
    let resolver!: (v: unknown) => void;
    const registrar = vi.fn(() => new Promise((r) => { resolver = r; }));
    const { modal } = montar(reserva(), registrar);
    await user.dblClick(within(modal).getByRole("button", { name: "Registrar cobro" }));
    expect(registrar).toHaveBeenCalledTimes(1);
    await act(async () => resolver({ data: { operacion_id: "op", reserva_id: "r1", pago_efectivo: 10000, pago_transferencia: 0, repetido: false }, error: null }));
  });

  it("clave ya usada con otros datos (IK001): explica, bloquea y pide recargar", async () => {
    const user = userEvent.setup();
    const registrar = vi.fn(() => Promise.resolve({ data: null, error: { message: "idempotency_key_reutilizada", code: "IK001" } }));
    const { modal, onDesactualizado } = montar(reserva(), registrar);
    await user.click(within(modal).getByRole("button", { name: "Registrar cobro" }));
    await within(modal).findByText(/ya se había registrado/);
    expect(onDesactualizado).toHaveBeenCalled();
    expect((within(modal).getByRole("button", { name: "Registrar cobro" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("PaymentModal — historial inmutable", () => {
  it("lista los movimientos con fecha/hora de Buenos Aires, tipo, medio, signo y motivo", async () => {
    const movs = [
      { id: "m1", creado: "2026-09-21T03:20:00Z", tipo: "cobro", medio: "transferencia", importe: 5000, motivo: null },
      { id: "m2", creado: "2026-09-22T15:00:00Z", tipo: "reintegro", medio: "transferencia", importe: -5000, motivo: "canceló" },
    ] as unknown as MovimientoPagoRow[];
    montar(reserva(), vi.fn(), { cargarMovimientos: () => Promise.resolve({ data: movs, error: null }) });
    const hist = await screen.findByLabelText("Historial de movimientos");
    await waitFor(() => expect(hist.textContent).toContain("21/09/2026 00:20"));
    expect(hist.textContent).toContain("Reintegro · transferencia");
    expect(hist.textContent).toContain("canceló");
    expect(hist.textContent).toContain("−$5.000");
    expect(within(hist).queryByRole("button")).toBeNull();
  });
});
