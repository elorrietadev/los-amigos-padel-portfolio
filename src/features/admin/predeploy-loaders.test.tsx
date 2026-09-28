/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReservasProximas } from "./reservas/useReservasProximas";
import { useReservasJugadas } from "./reservas/useReservasJugadas";
import { useAgendaSemana } from "./agenda/useAgendaSemana";
import { useProductos } from "./productos/useProductos";
import { useHistorialVentas } from "./historial/useHistorialVentas";
import { obtenerReservasPorRango, obtenerReservasProximas } from "./reservas/reservas.api";
import { obtenerProductos } from "./productos/productos.api";
import { obtenerVentasConDetalle } from "./historial/historial.api";
import type { VentaCruda } from "./historial/historial.types";

vi.mock("./reservas/reservas.api", () => ({ obtenerReservasPorRango: vi.fn(), obtenerReservasProximas: vi.fn() }));
vi.mock("./productos/productos.api", () => ({ obtenerProductos: vi.fn() }));
vi.mock("./historial/historial.api", () => ({ obtenerVentasConDetalle: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
type Response = { data: never[] | null; error: { message: string } | null };

describe("última carga normal/silenciosa siempre termina", () => {
  const loaders: { name: string; hook: () => { loading: boolean; error: boolean; recargar: (opciones: { silencioso?: boolean; forzar?: boolean }) => Promise<void> }; api: typeof obtenerReservasProximas | typeof obtenerReservasPorRango | typeof obtenerProductos }[] = [
    { name: "Próximas", hook: useReservasProximas, api: obtenerReservasProximas },
    { name: "Jugadas", hook: useReservasJugadas, api: obtenerReservasPorRango },
    { name: "Agenda", hook: () => useAgendaSemana(0), api: obtenerReservasPorRango },
    { name: "Productos", hook: useProductos, api: obtenerProductos },
  ];
  for (const { name, hook, api } of loaders) {
    it.each([false, true])(`${name}: normal → silenciosa (error=%s)`, async (error) => {
      const a = deferred<Response>(); const b = deferred<Response>();
      vi.mocked(api).mockReturnValueOnce(a.promise as never).mockReturnValueOnce(b.promise as never);
      const { result } = renderHook(hook);
      expect(result.current.loading).toBe(true);
      let refresh!: Promise<void>;
      act(() => { refresh = result.current.recargar({ silencioso: true, forzar: true }); });
      await act(async () => {
        b.resolve(error ? { data: null, error: { message: "offline" } } : { data: [], error: null });
        await refresh;
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(error);
      await act(async () => a.resolve({ data: [], error: null }));
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(error);
    });
  }
});

it("cambiar rango durante cargar más descarta la página vieja y libera paginación", async () => {
  const oldPage = deferred<{ data: VentaCruda[]; error: null }>();
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: String(i), fecha: "2026-09-01", total: 0, pago_efectivo: 0, pago_transferencia: 0, creado: "", reserva_id: null, reservas: null, venta_items: [] }));
  vi.mocked(obtenerVentasConDetalle).mockResolvedValueOnce({ data: rows, error: null } as never)
    .mockReturnValueOnce(oldPage.promise as never).mockResolvedValueOnce({ data: [], error: null } as never);
  const { result, rerender } = renderHook(({ desde }) => useHistorialVentas(desde, "2026-09-26"), { initialProps: { desde: "2026-09-01" } });
  await waitFor(() => expect(result.current.data).toHaveLength(20));
  act(() => { void result.current.cargarMasAntiguas(); });
  expect(result.current.cargandoMasAntiguas).toBe(true);
  rerender({ desde: "2026-09-20" });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.cargandoMasAntiguas).toBe(false);
  await act(async () => oldPage.resolve({ data: rows, error: null }));
  expect(result.current.data).toEqual([]);
  expect(result.current.cargandoMasAntiguas).toBe(false);
});
