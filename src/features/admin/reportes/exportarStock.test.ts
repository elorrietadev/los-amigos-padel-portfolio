// Tests de orquestación (no de bytes del .xlsx, ver construirReporteStock.ts
// — eso se valida con inspección real). `generarArchivo` inyectado reemplaza
// construir+descargar de verdad, mismo patrón que exportCajaActividad.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportarStock } from "./exportarStock";
import { obtenerLotesStockCompleto, obtenerProductos } from "./stock.api";

vi.mock("./stock.api", () => ({
  obtenerProductos: vi.fn(),
  obtenerLotesStockCompleto: vi.fn(),
}));

const AHORA = new Date("2026-01-15T12:00:00-03:00").getTime();

beforeEach(() => {
  vi.clearAllMocks();
});

function mockearFuentes(overrides: Partial<Record<string, { data: unknown; error: unknown }>> = {}) {
  vi.mocked(obtenerProductos).mockResolvedValue((overrides.productos ?? { data: [], error: null }) as never);
  vi.mocked(obtenerLotesStockCompleto).mockResolvedValue((overrides.lotes ?? { data: [], error: null }) as never);
}

describe("exportarStock — todo o nada", () => {
  it("las 2 fuentes OK: genera el archivo una sola vez y devuelve ok:true", async () => {
    mockearFuentes();
    const generarArchivo = vi.fn();
    const resultado = await exportarStock(AHORA, generarArchivo);
    expect(resultado.ok).toBe(true);
    expect(generarArchivo).toHaveBeenCalledTimes(1);
  });

  it("falla productos: no genera archivo, devuelve ok:false", async () => {
    mockearFuentes({ productos: { data: null, error: { message: "boom" } } });
    const generarArchivo = vi.fn();
    const resultado = await exportarStock(AHORA, generarArchivo);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBeTruthy();
    expect(generarArchivo).not.toHaveBeenCalled();
  });

  it("falla lotes: no genera archivo", async () => {
    mockearFuentes({ lotes: { data: null, error: { message: "boom" } } });
    const generarArchivo = vi.fn();
    const resultado = await exportarStock(AHORA, generarArchivo);
    expect(resultado.ok).toBe(false);
    expect(generarArchivo).not.toHaveBeenCalled();
  });

  it("la fecha de generación viaja en formato YYYY-MM-DD, fecha de negocio Argentina", async () => {
    mockearFuentes();
    const generarArchivo = vi.fn();
    await exportarStock(AHORA, generarArchivo);
    expect(generarArchivo).toHaveBeenCalledWith(expect.objectContaining({ fechaGeneracion: "2026-01-15" }));
  });
});
