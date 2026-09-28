// Tests de la lógica de paginación (obtenerTodasLasPaginas), con un
// `obtenerPagina` mockeado a mano — no golpea Supabase real. Cubre
// exactamente lo pedido: "la query de ventas obtiene todas las páginas del
// rango" y "una página falla -> no hay acumulado parcial".

import { describe, expect, it, vi } from "vitest";
import { obtenerTodasLasPaginas } from "./reportes.api";

describe("obtenerTodasLasPaginas", () => {
  it("una sola página incompleta: la trae y corta ahí", async () => {
    const obtenerPagina = vi.fn().mockResolvedValue({ data: [1, 2, 3], error: null });
    const resultado = await obtenerTodasLasPaginas(obtenerPagina, 10);
    expect(resultado.data).toEqual([1, 2, 3]);
    expect(obtenerPagina).toHaveBeenCalledTimes(1);
    expect(obtenerPagina).toHaveBeenCalledWith(0, 10);
  });

  it("varias páginas completas + una incompleta: las junta todas en un solo array, sin cortar antes de tiempo", async () => {
    const obtenerPagina = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 5 }, (_, i) => i), error: null })
      .mockResolvedValueOnce({ data: Array.from({ length: 5 }, (_, i) => 5 + i), error: null })
      .mockResolvedValueOnce({ data: [10, 11], error: null });
    const resultado = await obtenerTodasLasPaginas(obtenerPagina, 5);
    expect(resultado.data).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(obtenerPagina).toHaveBeenCalledTimes(3);
    expect(obtenerPagina).toHaveBeenNthCalledWith(1, 0, 5);
    expect(obtenerPagina).toHaveBeenNthCalledWith(2, 5, 5);
    expect(obtenerPagina).toHaveBeenNthCalledWith(3, 10, 5);
  });

  it("página exactamente del tamaño de la página seguida de una vacía: corta en la vacía, sin duplicar la última página completa", async () => {
    const obtenerPagina = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 5 }, (_, i) => i), error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const resultado = await obtenerTodasLasPaginas(obtenerPagina, 5);
    expect(resultado.data).toEqual([0, 1, 2, 3, 4]);
    expect(obtenerPagina).toHaveBeenCalledTimes(2);
  });

  it("sin resultados: data vacío, una sola llamada", async () => {
    const obtenerPagina = vi.fn().mockResolvedValue({ data: [], error: null });
    const resultado = await obtenerTodasLasPaginas(obtenerPagina, 500);
    expect(resultado.data).toEqual([]);
    expect(obtenerPagina).toHaveBeenCalledTimes(1);
  });

  it("una página falla a mitad de camino: corta ahí, propaga el error, sin acumulado parcial", async () => {
    const obtenerPagina = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 5 }, (_, i) => i), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "network boom" } });
    const resultado = await obtenerTodasLasPaginas(obtenerPagina, 5);
    expect(resultado.data).toBeNull();
    expect(resultado.error).toEqual({ message: "network boom" });
    expect(obtenerPagina).toHaveBeenCalledTimes(2);
  });

  it("la primera página ya falla: no acumula nada", async () => {
    const obtenerPagina = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const resultado = await obtenerTodasLasPaginas(obtenerPagina, 5);
    expect(resultado.data).toBeNull();
    expect(resultado.error).toEqual({ message: "boom" });
  });
});
