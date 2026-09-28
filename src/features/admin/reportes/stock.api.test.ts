// La paginación en sí (obtenerTodasLasPaginas) ya está testeada en
// reportes.api.test.ts y se reusa tal cual — acá solo se cubre el aplanado
// de shape propio de este módulo (el embed `productos(nombre)`).

import { describe, expect, it } from "vitest";
import { aplanarLoteStockFila, type LoteStockFila } from "./stock.api";

function crearFila(overrides: Partial<LoteStockFila> = {}): LoteStockFila {
  return {
    producto_id: "p1",
    cantidad_inicial: 20,
    cantidad_restante: 12,
    costo_unitario: 500,
    creado: "2026-01-10T10:00:00+00:00",
    productos: { nombre: "Pelotas Odea x2" },
    ...overrides,
  };
}

describe("aplanarLoteStockFila", () => {
  it("aplana el embed productos(nombre) a productoNombre", () => {
    const fila = aplanarLoteStockFila(crearFila());
    expect(fila.productoNombre).toBe("Pelotas Odea x2");
    expect(fila.cantidad_restante).toBe(12);
  });

  it("embed nulo (fila huérfana que el tipo estático no puede descartar): productoNombre de reserva, no rompe", () => {
    const fila = aplanarLoteStockFila(crearFila({ productos: null }));
    expect(fila.productoNombre).toBe("(producto eliminado)");
  });
});
