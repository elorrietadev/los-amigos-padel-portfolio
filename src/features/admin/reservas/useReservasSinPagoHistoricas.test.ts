/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AHORA, crearReserva } from "../notificaciones/notificaciones.fixtures";
import { obtenerReservasPorRangoCompleto } from "./reservas.api";
import { aplicarPago } from "./reservas.logic";
import { useReservasSinPagoHistoricas } from "./useReservasSinPagoHistoricas";

vi.mock("./reservas.api", () => ({ obtenerReservasPorRangoCompleto: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA); // miércoles 17/06/2026 → semana actual desde lun 15/06
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("useReservasSinPagoHistoricas", () => {
  it("pide una ventana finita de 8 semanas que termina el domingo anterior a la semana actual", async () => {
    vi.mocked(obtenerReservasPorRangoCompleto).mockResolvedValue({ data: [], error: null } as never);
    renderHook(() => useReservasSinPagoHistoricas());
    await waitFor(() => expect(obtenerReservasPorRangoCompleto).toHaveBeenCalledTimes(1));
    expect(obtenerReservasPorRangoCompleto).toHaveBeenCalledWith("2026-04-20", "2026-06-14");
  });

  it("carga las reservas procesadas de semanas anteriores", async () => {
    vi.mocked(obtenerReservasPorRangoCompleto).mockResolvedValue({ data: [crearReserva({ id: "vieja", fecha: "2026-06-05" })], error: null } as never);
    const { result } = renderHook(() => useReservasSinPagoHistoricas());
    await waitFor(() => expect(result.current.data.map((r) => r.id)).toEqual(["vieja"]));
    expect(result.current.data[0].horaInicio).toBe("10:00");
  });

  it("registrar un pago (actualizarLocal) actualiza la fila sin refetch", async () => {
    vi.mocked(obtenerReservasPorRangoCompleto).mockResolvedValue({ data: [crearReserva({ id: "vieja", fecha: "2026-06-05" })], error: null } as never);
    const { result } = renderHook(() => useReservasSinPagoHistoricas());
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    act(() => result.current.actualizarLocal((prev) => aplicarPago(prev, "vieja", { efectivo: 20000, transferencia: 0 })));

    expect(result.current.data[0].pago_efectivo).toBe(20000);
    expect(obtenerReservasPorRangoCompleto).toHaveBeenCalledTimes(1);
  });

  it("un error de carga es silencioso: no lanza y deja la lista como estaba", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(obtenerReservasPorRangoCompleto).mockResolvedValue({ data: null, error: { message: "offline" } } as never);
    const { result } = renderHook(() => useReservasSinPagoHistoricas());
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(result.current.data).toEqual([]);
  });

  it("recargar trae turnos nuevos y gana la respuesta más reciente", async () => {
    vi.mocked(obtenerReservasPorRangoCompleto).mockResolvedValueOnce({ data: [], error: null } as never);
    const { result } = renderHook(() => useReservasSinPagoHistoricas());
    await waitFor(() => expect(obtenerReservasPorRangoCompleto).toHaveBeenCalledTimes(1));

    vi.mocked(obtenerReservasPorRangoCompleto).mockResolvedValueOnce({ data: [crearReserva({ id: "materializada", fecha: "2026-06-09" })], error: null } as never);
    await act(async () => { await result.current.recargar(); });
    expect(result.current.data.map((r) => r.id)).toEqual(["materializada"]);
  });
});
