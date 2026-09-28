import { describe, expect, it } from "vitest";
import { agruparPorCategoria, procesarProductosPublicos, productosDestacados } from "./catalogo.logic";
import type { ProductoPublicoRow } from "./catalogo.types";

function fila(overrides: Partial<ProductoPublicoRow> = {}): ProductoPublicoRow {
  return {
    id: "p1",
    nombre: "Agua mineral",
    precio_venta: 1500,
    categoria_publica: "Bebidas",
    descripcion_publica: null,
    imagen_path: null,
    destacado: false,
    orden_publico: null,
    en_stock: true,
    ...overrides,
  };
}

describe("procesarProductosPublicos", () => {
  it("data null -> lista vacía (nunca revienta)", () => {
    expect(procesarProductosPublicos(null)).toEqual([]);
  });

  it("descarta filas sin id/nombre/precio_venta (defensivo, nunca debería pasar en la práctica)", () => {
    const resultado = procesarProductosPublicos([fila({ id: null }), fila({ id: "ok" })]);
    expect(resultado.map((p) => p.id)).toEqual(["ok"]);
  });

  it("en_stock null se procesa como false (nunca 'sin dato' = disponible por default)", () => {
    const [p] = procesarProductosPublicos([fila({ en_stock: null })]);
    expect(p!.enStock).toBe(false);
  });

  it("destacado null se procesa como false", () => {
    const [p] = procesarProductosPublicos([fila({ destacado: null })]);
    expect(p!.destacado).toBe(false);
  });

  it("orden_publico: ascendente primero, los sin orden quedan al final", () => {
    const resultado = procesarProductosPublicos([
      fila({ id: "sin-orden", nombre: "Z", orden_publico: null }),
      fila({ id: "orden-2", nombre: "B", orden_publico: 2 }),
      fila({ id: "orden-1", nombre: "A", orden_publico: 1 }),
    ]);
    expect(resultado.map((p) => p.id)).toEqual(["orden-1", "orden-2", "sin-orden"]);
  });

  it("mismo orden_publico (o ambos sin orden): desempata por nombre alfabético", () => {
    const resultado = procesarProductosPublicos([
      fila({ id: "b", nombre: "Grip", orden_publico: 1 }),
      fila({ id: "a", nombre: "Encordado", orden_publico: 1 }),
    ]);
    expect(resultado.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("agruparPorCategoria", () => {
  it("agrupa por categoria_publica tal cual viene (texto libre, sin normalizar)", () => {
    const productos = procesarProductosPublicos([
      fila({ id: "a", categoria_publica: "Bebidas" }),
      fila({ id: "b", categoria_publica: "Pelotas" }),
      fila({ id: "c", categoria_publica: "Bebidas" }),
    ]);
    const grupos = agruparPorCategoria(productos);
    expect(grupos.find((g) => g.categoria === "Bebidas")?.productos.map((p) => p.id)).toEqual(["a", "c"]);
    expect(grupos.find((g) => g.categoria === "Pelotas")?.productos.map((p) => p.id)).toEqual(["b"]);
  });

  it("sin categoría (null o solo espacios) cae en 'Otros', siempre al final", () => {
    const productos = procesarProductosPublicos([
      fila({ id: "a", categoria_publica: null }),
      fila({ id: "b", categoria_publica: "Bebidas" }),
      fila({ id: "c", categoria_publica: "   " }),
    ]);
    const grupos = agruparPorCategoria(productos);
    expect(grupos.at(-1)?.categoria).toBe("Otros");
    expect(grupos.at(-1)?.productos.map((p) => p.id).sort()).toEqual(["a", "c"]);
  });
});

describe("productosDestacados", () => {
  it("filtra solo destacado=true", () => {
    const productos = procesarProductosPublicos([
      fila({ id: "a", destacado: true }),
      fila({ id: "b", destacado: false }),
    ]);
    expect(productosDestacados(productos).map((p) => p.id)).toEqual(["a"]);
  });
});
