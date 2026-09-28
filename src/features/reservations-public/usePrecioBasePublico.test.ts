/** @vitest-environment jsdom */
// PUBLIC-R7 — reemplaza configCancha.precioHora (estático, podía divergir del
// precio configurado desde Configuración) por el precio_base_vigente real.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrecioBasePublico } from "./usePrecioBasePublico";

const obtenerPrecioBasePublicoMock = vi.hoisted(() => vi.fn());
vi.mock("./reservations.api", () => ({
  obtenerPrecioBasePublico: obtenerPrecioBasePublicoMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePrecioBasePublico", () => {
  it("arranca en loading y expone el precio real que devuelve el RPC", async () => {
    obtenerPrecioBasePublicoMock.mockResolvedValue({ data: 17500, error: null });
    const { result } = renderHook(() => usePrecioBasePublico());
    expect(result.current.loading).toBe(true);
    expect(result.current.precio).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.precio).toBe(17500);
  });

  it("error de red: error=true, sin inventar un precio de respaldo", async () => {
    obtenerPrecioBasePublicoMock.mockResolvedValue({ data: null, error: { message: "network" } });
    const { result } = renderHook(() => usePrecioBasePublico());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.precio).toBeNull();
  });

  it("data null sin error explícito también se trata como error, nunca como precio $0", async () => {
    obtenerPrecioBasePublicoMock.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePrecioBasePublico());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.precio).toBeNull();
  });
});
