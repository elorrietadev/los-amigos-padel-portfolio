import { describe, expect, it } from "vitest";
import type { LoteStockCrudo } from "./stock.api";
import {
  calcularTotalesLotesStock,
  calcularTotalesProductosStock,
  construirFilasLotesStock,
  construirFilasProductosStock,
} from "./stock.logic";
import type { Producto } from "./stock.types";

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

function crearLote(overrides: Partial<LoteStockCrudo> = {}): LoteStockCrudo {
  return {
    producto_id: "p1",
    productoNombre: "Pelotas Odea x2",
    cantidad_inicial: 20,
    cantidad_restante: 20,
    costo_unitario: 5000,
    creado: "2026-01-10T10:00:00+00:00",
    ...overrides,
  };
}

describe("construirFilasProductosStock", () => {
  it("producto activo con un solo lote: costo/valor/margen derivados de ese lote", () => {
    const productos = [crearProducto({ stock_actual: 20, precio_venta: 10000 })];
    const lotes = [crearLote({ cantidad_restante: 20, costo_unitario: 5000 })];
    const [fila] = construirFilasProductosStock(productos, lotes);
    expect(fila!.costoUnitarioStock).toBe(5000);
    expect(fila!.valorStockCosto).toBe(100000);
    expect(fila!.valorPotencialVenta).toBe(200000);
    expect(fila!.margenUnitario).toBe(5000);
    expect(fila!.margenPotencial).toBe(100000);
  });

  it("varios lotes del mismo producto: costo unitario es el promedio ponderado real, no un promedio simple", () => {
    const productos = [crearProducto({ stock_actual: 30, precio_venta: 1000 })];
    const lotes = [
      crearLote({ cantidad_restante: 10, costo_unitario: 400 }),
      crearLote({ cantidad_restante: 20, costo_unitario: 700 }),
    ];
    const [fila] = construirFilasProductosStock(productos, lotes);
    // valorStockCosto = 10*400 + 20*700 = 18000 ; /30 = 600 (no (400+700)/2=550)
    expect(fila!.valorStockCosto).toBe(18000);
    expect(fila!.costoUnitarioStock).toBe(600);
  });

  it("stock cero: costo/valor/margen en 0, no NaN ni Infinity", () => {
    const productos = [crearProducto({ stock_actual: 0, precio_venta: 5000 })];
    const [fila] = construirFilasProductosStock(productos, []);
    expect(fila!.costoUnitarioStock).toBe(0);
    expect(fila!.valorStockCosto).toBe(0);
    expect(fila!.valorPotencialVenta).toBe(0);
    expect(fila!.margenPotencial).toBe(0);
  });

  it("producto sin ningún lote (alta manual, nunca repuesto): costo 0, no rompe", () => {
    const productos = [crearProducto({ stock_actual: 5, precio_venta: 1000 })];
    const [fila] = construirFilasProductosStock(productos, []);
    expect(fila!.costoUnitarioStock).toBe(0);
    expect(fila!.valorStockCosto).toBe(0);
    expect(fila!.valorPotencialVenta).toBe(5000);
    expect(fila!.margenPotencial).toBe(5000);
  });

  it("producto inactivo: se incluye en el resultado con activo:false, mismos cálculos", () => {
    const productos = [crearProducto({ activo: false, stock_actual: 10, precio_venta: 1000 })];
    const lotes = [crearLote({ cantidad_restante: 10, costo_unitario: 400 })];
    const [fila] = construirFilasProductosStock(productos, lotes);
    expect(fila!.activo).toBe(false);
    expect(fila!.valorStockCosto).toBe(4000);
  });

  it("ordena por nombre", () => {
    const productos = [
      crearProducto({ id: "b", nombre: "Zapatillas" }),
      crearProducto({ id: "a", nombre: "Agua" }),
    ];
    const filas = construirFilasProductosStock(productos, []);
    expect(filas.map((f) => f.nombre)).toEqual(["Agua", "Zapatillas"]);
  });

  it("los lotes de OTRO producto no contaminan el costo de este", () => {
    const productos = [
      crearProducto({ id: "a", nombre: "Agua", stock_actual: 10, precio_venta: 1000 }),
      crearProducto({ id: "b", nombre: "Grip", stock_actual: 10, precio_venta: 2000 }),
    ];
    const lotes = [
      crearLote({ producto_id: "a", cantidad_restante: 10, costo_unitario: 100 }),
      crearLote({ producto_id: "b", cantidad_restante: 10, costo_unitario: 900 }),
    ];
    const filas = construirFilasProductosStock(productos, lotes);
    expect(filas.find((f) => f.nombre === "Agua")!.costoUnitarioStock).toBe(100);
    expect(filas.find((f) => f.nombre === "Grip")!.costoUnitarioStock).toBe(900);
  });
});

describe("calcularTotalesProductosStock", () => {
  it("suma stock/valor/margen de TODOS los productos recibidos, activos e inactivos incluidos", () => {
    const productos = [
      crearProducto({ id: "a", activo: true, stock_actual: 10, precio_venta: 1000 }),
      crearProducto({ id: "b", activo: false, stock_actual: 5, precio_venta: 2000 }),
    ];
    const lotes = [
      crearLote({ producto_id: "a", cantidad_restante: 10, costo_unitario: 400 }),
      crearLote({ producto_id: "b", cantidad_restante: 5, costo_unitario: 800 }),
    ];
    const filas = construirFilasProductosStock(productos, lotes);
    const totales = calcularTotalesProductosStock(filas);
    expect(totales.stock).toBe(15);
    expect(totales.valorStockCosto).toBe(4000 + 4000);
    expect(totales.valorPotencialVenta).toBe(10000 + 10000);
    expect(totales.margenPotencial).toBe(6000 + 6000);
  });

  it("lista vacía: todos los totales en 0", () => {
    expect(calcularTotalesProductosStock([])).toEqual({
      stock: 0,
      valorStockCosto: 0,
      valorPotencialVenta: 0,
      margenPotencial: 0,
    });
  });
});

describe("construirFilasLotesStock", () => {
  it("un lote: cantidad consumida = inicial - restante, valor restante = restante * costo", () => {
    const lotes = [crearLote({ cantidad_inicial: 20, cantidad_restante: 12, costo_unitario: 500 })];
    const [fila] = construirFilasLotesStock(lotes);
    expect(fila!.cantidadConsumida).toBe(8);
    expect(fila!.valorRestante).toBe(6000);
  });

  it("fecha: solo la parte YYYY-MM-DD, sin la hora del timestamp", () => {
    const lotes = [crearLote({ creado: "2026-03-05T14:30:00+00:00" })];
    const [fila] = construirFilasLotesStock(lotes);
    expect(fila!.fecha).toBe("2026-03-05");
  });

  it("múltiples lotes del mismo producto: orden por fecha de creación ascendente (mismo orden FIFO que consume registrar_venta)", () => {
    const lotes = [
      crearLote({ creado: "2026-02-01T00:00:00+00:00", costo_unitario: 999 }),
      crearLote({ creado: "2026-01-01T00:00:00+00:00", costo_unitario: 111 }),
    ];
    const filas = construirFilasLotesStock(lotes);
    expect(filas.map((f) => f.costoUnitario)).toEqual([111, 999]);
  });

  it("lotes de distinto producto: ordena por nombre de producto primero", () => {
    const lotes = [
      crearLote({ productoNombre: "Zapatillas", creado: "2026-01-01T00:00:00+00:00" }),
      crearLote({ productoNombre: "Agua", creado: "2026-02-01T00:00:00+00:00" }),
    ];
    const filas = construirFilasLotesStock(lotes);
    expect(filas.map((f) => f.producto)).toEqual(["Agua", "Zapatillas"]);
  });
});

describe("calcularTotalesLotesStock", () => {
  it("suma cantidad restante y valor restante de todos los lotes", () => {
    const lotes = [
      crearLote({ cantidad_restante: 10, costo_unitario: 100 }),
      crearLote({ cantidad_restante: 5, costo_unitario: 200 }),
    ];
    const filas = construirFilasLotesStock(lotes);
    const totales = calcularTotalesLotesStock(filas);
    expect(totales.cantidadRestante).toBe(15);
    expect(totales.valorRestante).toBe(1000 + 1000);
  });

  it("sin lotes: totales en 0", () => {
    expect(calcularTotalesLotesStock([])).toEqual({ cantidadRestante: 0, valorRestante: 0 });
  });
});
