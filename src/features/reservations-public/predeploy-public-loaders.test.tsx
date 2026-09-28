/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDisponibilidad } from "./useDisponibilidad";
import { useFranjaOperativa } from "./useFranjaOperativa";
import { useCotizacionReservas } from "../public-shell/useCotizacionReservas";

const api = vi.hoisted(() => ({
  obtenerReservasPublicasPorFecha: vi.fn(), obtenerTurnosFijosPublicos: vi.fn(),
  obtenerExcepcionesTurnoFijo: vi.fn(), obtenerFranjaOperativa: vi.fn(), cotizarReserva: vi.fn(),
}));
vi.mock("./reservations.api", () => api);
const ok = (data: unknown) => ({ data, error: null });
const fallo = { data: null, error: new Error("offline") };
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset().mockResolvedValue(ok([])));
  api.obtenerFranjaOperativa.mockResolvedValue(ok([{ cerrado: false, hora_apertura: "08:00", hora_cierre: "23:00" }]));
  api.cotizarReserva.mockResolvedValue(ok(20000));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each(["obtenerReservasPublicasPorFecha", "obtenerTurnosFijosPublicos", "obtenerExcepcionesTurnoFijo"] as const)("H5: %s falla y retry vuelve a cargar TODAS las fuentes", async (fuente) => {
  api[fuente].mockResolvedValueOnce(fallo);
  const { result } = renderHook(() => useDisponibilidad("2026-10-01"));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.reservasDelDia).toEqual([]);
  act(() => { void result.current.refrescar(); });
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe(false);
  expect(api.obtenerTurnosFijosPublicos).toHaveBeenCalledTimes(2);
  expect(api.obtenerExcepcionesTurnoFijo).toHaveBeenCalledTimes(2);
});

it("H5: no termina la carga mientras una fuente sigue pendiente", async () => {
  const fijo = deferred(); api.obtenerTurnosFijosPublicos.mockReturnValue(fijo.promise);
  const { result } = renderHook(() => useDisponibilidad("2026-10-01"));
  await act(async () => {});
  expect(result.current.loading).toBe(true);
  await act(async () => fijo.resolve(ok([])));
  expect(result.current.loading).toBe(false);
});

it("H5: cambiar fecha y fallar descarta datos previos y una respuesta vieja", async () => {
  const antigua = deferred();
  api.obtenerReservasPublicasPorFecha.mockReturnValueOnce(antigua.promise).mockResolvedValueOnce(fallo);
  const { result, rerender } = renderHook(({ fecha }) => useDisponibilidad(fecha), { initialProps: { fecha: "2026-10-01" } });
  rerender({ fecha: "2026-10-02" });
  expect(result.current.reservasDelDia).toEqual([]);
  await waitFor(() => expect(result.current.error).toBe(true));
  await act(async () => antigua.resolve(ok([])));
  expect(result.current.error).toBe(true);
  expect(result.current.reservasDelDia).toEqual([]);
});

it.each([null, [{ cerrado: false, hora_apertura: null, hora_cierre: null }]])("H5: franja ausente o inválida nunca habilita", async (data) => {
  api.obtenerFranjaOperativa.mockResolvedValue(ok(data));
  const { result } = renderHook(() => useFranjaOperativa("2026-10-01"));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.franja).toBeNull();
});

it("H5: franja vieja no reemplaza la nueva fallida; retry explícito", async () => {
  const antigua = deferred();
  api.obtenerFranjaOperativa.mockReturnValueOnce(antigua.promise).mockResolvedValueOnce(fallo);
  const { result, rerender } = renderHook(({ fecha }) => useFranjaOperativa(fecha), { initialProps: { fecha: "2026-10-01" } });
  rerender({ fecha: "2026-10-02" });
  await waitFor(() => expect(result.current.error).toBe(true));
  await act(async () => antigua.resolve(ok([{ cerrado: true }])));
  expect(result.current.franja).toBeNull();
  act(() => result.current.refrescar());
  await waitFor(() => expect(result.current.franja?.cerrado).toBe(false));
});

it.each([null, -1, NaN, Infinity, "100"])("M6: precio inválido %s bloquea y retry recupera", async (precio) => {
  api.cotizarReserva.mockResolvedValueOnce(ok(precio));
  const { result } = renderHook(() => useCotizacionReservas("2026-10-01", "10:00", ["11:00"]));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.precios).toEqual({});
  act(() => result.current.refrescar());
  await waitFor(() => expect(result.current.precios["11:00"]).toBe(20000));
});

it("M6: cambio de fecha/hora/duración invalida precios y descarta respuesta vieja", async () => {
  const vieja = deferred();
  const { result, rerender } = renderHook(({ fecha, hora, fin }) => useCotizacionReservas(fecha, hora, [fin]), {
    initialProps: { fecha: "2026-10-01", hora: "10:00", fin: "11:00" },
  });
  await waitFor(() => expect(result.current.precios["11:00"]).toBe(20000));
  api.cotizarReserva.mockReturnValueOnce(vieja.promise);
  rerender({ fecha: "2026-10-01", hora: "10:00", fin: "12:00" });
  expect(result.current.precios).toEqual({});
  expect(result.current.loading).toBe(true);
  api.cotizarReserva.mockResolvedValueOnce(fallo);
  rerender({ fecha: "2026-10-02", hora: "11:00", fin: "12:00" });
  await waitFor(() => expect(result.current.error).toBe(true));
  await act(async () => vieja.resolve(ok(30000)));
  expect(result.current.precios).toEqual({});
  expect(result.current.error).toBe(true);
});

it("lectura colgada: timeout recuperable sin aceptar respuesta posterior", async () => {
  vi.useFakeTimers();
  const pendiente = deferred(); api.obtenerFranjaOperativa.mockReturnValue(pendiente.promise);
  const { result, unmount } = renderHook(() => useFranjaOperativa("2026-10-01"));
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(result.current.error).toBe(true);
  await act(async () => pendiente.resolve(ok([{ cerrado: true }])));
  expect(result.current.franja).toBeNull();
  unmount(); expect(vi.getTimerCount()).toBe(0);
});
