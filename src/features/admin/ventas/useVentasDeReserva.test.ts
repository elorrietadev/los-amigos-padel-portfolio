/** @vitest-environment jsdom */
// P3 — useVentasDeReserva: carga on-demand al montar/cambiar `reservaId`,
// guard anti-carrera (secuenciaRef) para que un cambio rápido de reserva
// nunca deje ver datos de la reserva anterior, y `reintentar` tras error.

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemVentaCruda, VentaCruda } from "../historial/historial.types";
import { obtenerVentasPorReserva } from "./ventas.api";
import { useVentasDeReserva } from "./useVentasDeReserva";

vi.mock("./ventas.api", () => ({
  obtenerVentasPorReserva: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function crearItemCrudo(overrides: Partial<ItemVentaCruda> = {}): ItemVentaCruda {
  return {
    id: "i1",
    producto_id: "p1",
    cantidad: 2,
    precio_unitario_snapshot: 5000,
    costo_unitario_snapshot: 2000,
    subtotal: 10000,
    creado: new Date().toISOString(),
    productos: { nombre: "Pelotas" },
    devoluciones: [],
    ...overrides,
  };
}

function crearVentaCruda(overrides: Partial<VentaCruda> = {}): VentaCruda {
  return {
    id: "v1",
    reserva_id: "r1",
    fecha: "2026-01-07",
    pago_efectivo: 10000,
    pago_transferencia: 0,
    total: 10000,
    creado: new Date().toISOString(),
    reservas: null,
    venta_items: [crearItemCrudo()],
    ...overrides,
  };
}

function crearDiferido<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("useVentasDeReserva — P3", () => {
  it("reservaId null: no dispara fetch, estado limpio", () => {
    const { result } = renderHook(() => useVentasDeReserva(null));

    expect(obtenerVentasPorReserva).not.toHaveBeenCalled();
    expect(result.current.ventas).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it("carga al montar con una reservaId: loading true durante el fetch, después ventas procesadas", async () => {
    const diferido = crearDiferido<{ data: VentaCruda[]; error: null }>();
    vi.mocked(obtenerVentasPorReserva).mockReturnValueOnce(diferido.promise as never);

    const { result } = renderHook(() => useVentasDeReserva("r1"));
    expect(obtenerVentasPorReserva).toHaveBeenCalledWith("r1");
    expect(result.current.loading).toBe(true);

    await act(async () => {
      diferido.resolve({ data: [crearVentaCruda()], error: null });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(result.current.ventas).toHaveLength(1);
    expect(result.current.ventas[0].items[0].productoNombre).toBe("Pelotas");
  });

  it("error de carga: error=true, loading=false, ventas vacío", async () => {
    vi.mocked(obtenerVentasPorReserva).mockResolvedValueOnce({ data: null, error: { message: "fallo" } } as never);

    const { result } = renderHook(() => useVentasDeReserva("r1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.ventas).toEqual([]);
  });

  it("reintentar dispara una nueva carga contra la misma reservaId", async () => {
    vi.mocked(obtenerVentasPorReserva)
      .mockResolvedValueOnce({ data: null, error: { message: "fallo" } } as never)
      .mockResolvedValueOnce({ data: [crearVentaCruda()], error: null } as never);

    const { result } = renderHook(() => useVentasDeReserva("r1"));
    await waitFor(() => expect(result.current.error).toBe(true));

    act(() => {
      result.current.reintentar();
    });

    await waitFor(() => expect(result.current.ventas).toHaveLength(1));
    expect(result.current.error).toBe(false);
    expect(obtenerVentasPorReserva).toHaveBeenCalledTimes(2);
  });

  it("cambiar de reservaId dispara una nueva carga para la nueva reserva", async () => {
    vi.mocked(obtenerVentasPorReserva)
      .mockResolvedValueOnce({ data: [crearVentaCruda({ id: "va" })], error: null } as never)
      .mockResolvedValueOnce({ data: [crearVentaCruda({ id: "vb", reserva_id: "r2" })], error: null } as never);

    const { result, rerender } = renderHook(({ id }: { id: string }) => useVentasDeReserva(id), {
      initialProps: { id: "r1" },
    });
    await waitFor(() => expect(result.current.ventas.map((v) => v.id)).toEqual(["va"]));

    rerender({ id: "r2" });

    await waitFor(() => expect(result.current.ventas.map((v) => v.id)).toEqual(["vb"]));
    expect(obtenerVentasPorReserva).toHaveBeenNthCalledWith(2, "r2");
  });

  it("cambio rápido entre reservas nunca muestra datos stale: si la respuesta VIEJA llega después que la nueva, se descarta", async () => {
    const diferidoViejo = crearDiferido<{ data: VentaCruda[]; error: null }>();
    const diferidoNuevo = crearDiferido<{ data: VentaCruda[]; error: null }>();
    vi.mocked(obtenerVentasPorReserva)
      .mockReturnValueOnce(diferidoViejo.promise as never)
      .mockReturnValueOnce(diferidoNuevo.promise as never);

    const { result, rerender } = renderHook(({ id }: { id: string }) => useVentasDeReserva(id), {
      initialProps: { id: "r1" },
    });
    rerender({ id: "r2" }); // cambia de reserva ANTES de que responda la carga de r1

    // Resuelve primero la carga nueva (r2)...
    await act(async () => {
      diferidoNuevo.resolve({ data: [crearVentaCruda({ id: "vb", reserva_id: "r2" })], error: null });
    });
    expect(result.current.ventas.map((v) => v.id)).toEqual(["vb"]);

    // ...y la vieja (r1) llega tarde: no debe pisar el estado ya asentado de r2.
    await act(async () => {
      diferidoViejo.resolve({ data: [crearVentaCruda({ id: "va", reserva_id: "r1" })], error: null });
    });
    expect(result.current.ventas.map((v) => v.id)).toEqual(["vb"]);
  });

  it("cambiar a reservaId null mientras una carga está en vuelo: limpia enseguida y la respuesta tardía no la repuebla", async () => {
    const diferido = crearDiferido<{ data: VentaCruda[]; error: null }>();
    vi.mocked(obtenerVentasPorReserva).mockReturnValueOnce(diferido.promise as never);

    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useVentasDeReserva(id), {
      initialProps: { id: "r1" as string | null },
    });
    expect(result.current.loading).toBe(true);

    rerender({ id: null });
    expect(result.current.ventas).toEqual([]);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      diferido.resolve({ data: [crearVentaCruda()], error: null });
    });
    expect(result.current.ventas).toEqual([]);
  });
});

describe("useVentasDeReserva.patchearDevolucion — P4", () => {
  it("actualiza cantidadDevuelta/cantidadVigente/subtotalVigente del ítem correcto, sin refetch", async () => {
    vi.mocked(obtenerVentasPorReserva).mockResolvedValueOnce({ data: [crearVentaCruda()], error: null } as never);
    const { result } = renderHook(() => useVentasDeReserva("r1"));
    await waitFor(() => expect(result.current.ventas).toHaveLength(1));

    act(() => {
      result.current.patchearDevolucion("v1", "i1", { cantidad: 1, medioReembolso: "efectivo" });
    });

    const item = result.current.ventas[0].items[0];
    expect(item.cantidadDevuelta).toBe(1);
    expect(item.cantidadVigente).toBe(1);
    expect(item.subtotalVigente).toBe(5000); // 1 unidad restante * 5000 precioSnapshot
    expect(obtenerVentasPorReserva).toHaveBeenCalledTimes(1); // patch local puro, sin recargar
  });

  it("no afecta otras ventas de la misma reserva", async () => {
    vi.mocked(obtenerVentasPorReserva).mockResolvedValueOnce({
      data: [
        crearVentaCruda({ id: "v1" }),
        crearVentaCruda({
          id: "v2",
          venta_items: [crearItemCrudo({ id: "i2", producto_id: "p2", productos: { nombre: "Grips" } })],
        }),
      ],
      error: null,
    } as never);
    const { result } = renderHook(() => useVentasDeReserva("r1"));
    await waitFor(() => expect(result.current.ventas).toHaveLength(2));

    act(() => {
      result.current.patchearDevolucion("v1", "i1", { cantidad: 1, medioReembolso: "efectivo" });
    });

    const ventaV2 = result.current.ventas.find((v) => v.id === "v2")!;
    expect(ventaV2.items[0].cantidadDevuelta).toBe(0);
    expect(ventaV2.items[0].cantidadVigente).toBe(2);
  });
});


describe("cambio de identidad", () => {
  it.each([false, true])("A cargada y B pendiente/fallida nunca expone A (fallo=%s)", async (fallo) => {
    const pending = crearDiferido<{ data: VentaCruda[] | null; error: { message: string } | null }>();
    vi.mocked(obtenerVentasPorReserva)
      .mockResolvedValueOnce({ data: [crearVentaCruda()], error: null } as never)
      .mockReturnValueOnce(pending.promise as never);
    const { result, rerender } = renderHook(({ id }) => useVentasDeReserva(id), { initialProps: { id: "r1" } });
    await waitFor(() => expect(result.current.ventas).toHaveLength(1));
    rerender({ id: "r2" });
    expect(result.current.ventas).toEqual([]);
    expect(result.current.loading).toBe(true);
    await act(async () => pending.resolve(fallo ? { data: null, error: { message: "offline" } } : { data: [], error: null }));
    expect(result.current.ventas).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(fallo);
  });
});
