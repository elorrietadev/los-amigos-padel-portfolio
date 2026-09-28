import { describe, expect, it } from "vitest";
import { calcularCostoUnitario, esStockBajo, filtrarPorNombre, productosConStockBajo, type Producto } from "./productos.logic";

function crearProducto(overrides: Partial<Producto> = {}): Producto {
  return {
    id: "p1",
    nombre: "Pelotas Odea x2",
    precio_venta: 10000,
    stock_actual: 20,
    stock_minimo: 5,
    activo: true,
    creado: new Date().toISOString(),
    mostrar_en_catalogo: false,
    imagen_path: null,
    categoria_publica: null,
    orden_publico: null,
    descripcion_publica: null,
    destacado: false,
    ...overrides,
  };
}

describe("filtrarPorNombre", () => {
  it("filtro vacío devuelve todos los productos", () => {
    const productos = [crearProducto({ id: "a" }), crearProducto({ id: "b", nombre: "Grips ODEA" })];
    expect(filtrarPorNombre(productos, "")).toEqual(productos);
    expect(filtrarPorNombre(productos, "   ")).toEqual(productos);
  });

  it("substring case-insensitive", () => {
    const productos = [crearProducto({ id: "a", nombre: "Pelotas Odea x2" }), crearProducto({ id: "b", nombre: "Grips ODEA" })];
    expect(filtrarPorNombre(productos, "odea").map((p) => p.id)).toEqual(["a", "b"]);
    expect(filtrarPorNombre(productos, "PELOTAS").map((p) => p.id)).toEqual(["a"]);
  });

  it("sin coincidencias devuelve vacío", () => {
    const productos = [crearProducto()];
    expect(filtrarPorNombre(productos, "raqueta")).toEqual([]);
  });
});

describe("esStockBajo / productosConStockBajo", () => {
  it("stock_actual > stock_minimo -> false", () => {
    expect(esStockBajo({ stock_actual: 10, stock_minimo: 5 })).toBe(false);
  });

  it("stock_actual == stock_minimo -> true (<=, no <)", () => {
    expect(esStockBajo({ stock_actual: 5, stock_minimo: 5 })).toBe(true);
  });

  it("stock_actual < stock_minimo -> true", () => {
    expect(esStockBajo({ stock_actual: 2, stock_minimo: 5 })).toBe(true);
  });

  it("productosConStockBajo filtra solo los que están en/por debajo del mínimo", () => {
    const productos = [
      crearProducto({ id: "alto", stock_actual: 20, stock_minimo: 5 }),
      crearProducto({ id: "justo", stock_actual: 5, stock_minimo: 5 }),
      crearProducto({ id: "bajo", stock_actual: 1, stock_minimo: 5 }),
    ];
    expect(productosConStockBajo(productos).map((p) => p.id)).toEqual(["justo", "bajo"]);
  });
});

describe("calcularCostoUnitario", () => {
  it("cantidad y costo positivos -> división redondeada a 2 decimales", () => {
    expect(calcularCostoUnitario(3, 10)).toBe(3.33);
    expect(calcularCostoUnitario(4, 10)).toBe(2.5);
  });

  it("cantidad <= 0 -> 0 (evita NaN/Infinity mientras se tipea)", () => {
    expect(calcularCostoUnitario(0, 100)).toBe(0);
    expect(calcularCostoUnitario(-1, 100)).toBe(0);
  });

  it("costo total 0 -> costo unitario 0", () => {
    expect(calcularCostoUnitario(5, 0)).toBe(0);
  });

  it("coincide con el caso real verificado en la base (19 unidades de Pelotas Odea)", () => {
    // lotes reales: cantidad_inicial=24, costo_total verificado en Supabase con
    // costo_unitario resultante exacto — ver auditoría D0. Acá se prueba la
    // fórmula genérica, no ese dato puntual (cambia con el tiempo).
    expect(calcularCostoUnitario(24, 120000)).toBe(5000);
  });
});
