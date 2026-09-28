import { describe, expect, it } from "vitest";
import {
  agregarVentasSinDuplicar,
  calcularCantidadDevuelta,
  calcularCantidadVigente,
  calcularMontoDevueltoItem,
  calcularSubtotalVigente,
  calcularTotalDevuelto,
  calcularTotalNeto,
  filtrarVentasHistorial,
  patchearDevolucionEnVenta,
  procesarItem,
  procesarVenta,
} from "./historial.logic";
import type { ItemVentaConDetalle, ItemVentaCruda, VentaConDetalle, VentaCruda } from "./historial.types";

function crearItemCrudo(overrides: Partial<ItemVentaCruda> = {}): ItemVentaCruda {
  return {
    id: "item1",
    producto_id: "p1",
    cantidad: 3,
    precio_unitario_snapshot: 10000,
    costo_unitario_snapshot: 4000,
    subtotal: 30000,
    creado: new Date().toISOString(),
    productos: { nombre: "Pelotas" },
    devoluciones: [],
    ...overrides,
  };
}

function crearVentaCruda(overrides: Partial<VentaCruda> = {}): VentaCruda {
  return {
    id: "v1",
    reserva_id: null,
    fecha: "2026-01-07",
    pago_efectivo: 30000,
    pago_transferencia: 0,
    total: 30000,
    creado: new Date().toISOString(),
    reservas: null,
    venta_items: [crearItemCrudo()],
    ...overrides,
  };
}

function crearVentaConDetalle(overrides: Partial<VentaConDetalle> = {}): VentaConDetalle {
  return {
    id: "v1",
    fecha: "2026-01-07",
    total: 30000,
    pagoEfectivo: 30000,
    pagoTransferencia: 0,
    creado: new Date().toISOString(),
    reserva: null,
    items: [],
    ...overrides,
  };
}

function crearItemVentaConDetalle(overrides: Partial<ItemVentaConDetalle> = {}): ItemVentaConDetalle {
  return {
    id: "i1",
    productoId: "p1",
    productoNombre: "Pelotas",
    cantidadOriginal: 3,
    cantidadDevuelta: 0,
    cantidadVigente: 3,
    precioSnapshot: 10000,
    costoSnapshot: 4000,
    subtotalOriginal: 30000,
    subtotalVigente: 30000,
    devoluciones: [],
    ...overrides,
  };
}

describe("calcularCantidadDevuelta", () => {
  it("sin devoluciones: 0", () => {
    expect(calcularCantidadDevuelta([])).toBe(0);
  });

  it("suma varias devoluciones parciales", () => {
    expect(calcularCantidadDevuelta([{ cantidad: 1 }, { cantidad: 2 }])).toBe(3);
  });
});

describe("calcularCantidadVigente", () => {
  it("sin devolución: vigente == original", () => {
    expect(calcularCantidadVigente(5, 0)).toBe(5);
  });

  it("devolución parcial: resta la cantidad devuelta", () => {
    expect(calcularCantidadVigente(5, 2)).toBe(3);
  });

  it("devolución total: vigente 0", () => {
    expect(calcularCantidadVigente(5, 5)).toBe(0);
  });
});

describe("calcularSubtotalVigente", () => {
  it("distinto del subtotal original cuando hubo devolución", () => {
    expect(calcularSubtotalVigente(3, 10000)).toBe(30000);
    expect(calcularSubtotalVigente(1, 10000)).toBe(10000);
  });
});

describe("procesarItem", () => {
  it("sin devoluciones: cantidad_vigente == cantidad original, subtotal_vigente == subtotal original", () => {
    const item = procesarItem(crearItemCrudo({ cantidad: 3, precio_unitario_snapshot: 10000, subtotal: 30000 }));
    expect(item.cantidadOriginal).toBe(3);
    expect(item.cantidadDevuelta).toBe(0);
    expect(item.cantidadVigente).toBe(3);
    expect(item.subtotalOriginal).toBe(30000);
    expect(item.subtotalVigente).toBe(30000);
  });

  it("con devolución parcial: vigente y subtotal_vigente reflejan la resta, subtotal original NO cambia", () => {
    const item = procesarItem(
      crearItemCrudo({
        cantidad: 3,
        precio_unitario_snapshot: 10000,
        subtotal: 30000,
        devoluciones: [{ cantidad: 1, medio_reembolso: "efectivo" }],
      }),
    );
    expect(item.cantidadDevuelta).toBe(1);
    expect(item.cantidadVigente).toBe(2);
    expect(item.subtotalOriginal).toBe(30000);
    expect(item.subtotalVigente).toBe(20000);
  });

  it("mapea las devoluciones crudas al shape procesado (cantidad + medio de reembolso)", () => {
    const item = procesarItem(
      crearItemCrudo({
        devoluciones: [
          { cantidad: 1, medio_reembolso: "efectivo" },
          { cantidad: 2, medio_reembolso: "transferencia" },
        ],
      }),
    );
    expect(item.devoluciones).toEqual([
      { cantidad: 1, medioReembolso: "efectivo" },
      { cantidad: 2, medioReembolso: "transferencia" },
    ]);
  });

  it("producto embebido ausente (defensivo, no debería pasar en la práctica): fallback sin romper", () => {
    const item = procesarItem(crearItemCrudo({ productos: undefined }));
    expect(item.productoNombre).toBe("Producto eliminado");
  });

  it("mapea precio/costo snapshot y el id del producto tal cual", () => {
    const item = procesarItem(crearItemCrudo({ producto_id: "p9", precio_unitario_snapshot: 5000, costo_unitario_snapshot: 2000 }));
    expect(item.productoId).toBe("p9");
    expect(item.precioSnapshot).toBe(5000);
    expect(item.costoSnapshot).toBe(2000);
  });
});

describe("procesarVenta", () => {
  it("venta suelta: reserva null", () => {
    const venta = procesarVenta(crearVentaCruda({ reserva_id: null, reservas: null }));
    expect(venta.reserva).toBeNull();
  });

  it("venta atada: mapea los datos mínimos de la reserva, con hora recortada", () => {
    const venta = procesarVenta(
      crearVentaCruda({
        reserva_id: "r1",
        reservas: { id: "r1", nombre: "Juan", fecha: "2026-01-07", hora_inicio: "10:00:00", hora_fin: "11:00:00", confirmada: true },
      }),
    );
    expect(venta.reserva).toEqual({
      id: "r1",
      nombre: "Juan",
      fecha: "2026-01-07",
      horaInicio: "10:00",
      horaFin: "11:00",
      confirmada: true,
    });
  });

  it("mapea metadata de la venta (fecha/total/pagos) y procesa cada línea", () => {
    const venta = procesarVenta(
      crearVentaCruda({
        fecha: "2026-01-05",
        total: 13500,
        pago_efectivo: 10000,
        pago_transferencia: 3500,
        venta_items: [crearItemCrudo({ id: "i1" }), crearItemCrudo({ id: "i2" })],
      }),
    );
    expect(venta.fecha).toBe("2026-01-05");
    expect(venta.total).toBe(13500);
    expect(venta.pagoEfectivo).toBe(10000);
    expect(venta.pagoTransferencia).toBe(3500);
    expect(venta.items.map((i) => i.id)).toEqual(["i1", "i2"]);
  });
});

describe("filtrarVentasHistorial", () => {
  const atada = crearVentaConDetalle({
    id: "a",
    reserva: { id: "r1", nombre: "Juan Pérez", fecha: "2026-01-07", horaInicio: "10:00", horaFin: "11:00", confirmada: true },
    items: [crearItemVentaConDetalle({ id: "i1", productoId: "p1", productoNombre: "Pelotas", cantidadOriginal: 1, cantidadVigente: 1, precioSnapshot: 10000, subtotalOriginal: 10000, subtotalVigente: 10000 })],
  });
  const suelta = crearVentaConDetalle({
    id: "s",
    reserva: null,
    items: [crearItemVentaConDetalle({ id: "i2", productoId: "p2", productoNombre: "Grips", cantidadOriginal: 1, cantidadVigente: 1, precioSnapshot: 3500, subtotalOriginal: 3500, subtotalVigente: 3500 })],
  });

  it("tipo 'atadas' deja solo ventas con reserva", () => {
    expect(filtrarVentasHistorial([atada, suelta], "", "atadas").map((v) => v.id)).toEqual(["a"]);
  });

  it("tipo 'sueltas' deja solo ventas sin reserva", () => {
    expect(filtrarVentasHistorial([atada, suelta], "", "sueltas").map((v) => v.id)).toEqual(["s"]);
  });

  it("tipo 'todas' no filtra por tipo", () => {
    expect(filtrarVentasHistorial([atada, suelta], "", "todas").map((v) => v.id)).toEqual(["a", "s"]);
  });

  it("búsqueda por nombre de la reserva asociada", () => {
    expect(filtrarVentasHistorial([atada, suelta], "juan", "todas").map((v) => v.id)).toEqual(["a"]);
  });

  it("búsqueda por nombre de producto en las líneas", () => {
    expect(filtrarVentasHistorial([atada, suelta], "grips", "todas").map((v) => v.id)).toEqual(["s"]);
  });

  it("una venta suelta nunca matchea por nombre de reserva (no tiene)", () => {
    expect(filtrarVentasHistorial([suelta], "juan", "todas")).toHaveLength(0);
  });
});

describe("agregarVentasSinDuplicar", () => {
  it("concatena sin duplicados cuando no hay solapamiento", () => {
    const actuales = [crearVentaConDetalle({ id: "a" })];
    const nuevas = [crearVentaConDetalle({ id: "b" })];
    expect(agregarVentasSinDuplicar(actuales, nuevas).map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("descarta de las nuevas cualquier id ya presente (borde de página corrido por una venta nueva)", () => {
    const actuales = [crearVentaConDetalle({ id: "a" }), crearVentaConDetalle({ id: "b" })];
    const nuevas = [crearVentaConDetalle({ id: "b" }), crearVentaConDetalle({ id: "c" })];
    expect(agregarVentasSinDuplicar(actuales, nuevas).map((v) => v.id)).toEqual(["a", "b", "c"]);
  });
});

describe("calcularMontoDevueltoItem / calcularTotalDevuelto / calcularTotalNeto", () => {
  it("sin devoluciones: monto devuelto 0", () => {
    const item = crearItemVentaConDetalle({ devoluciones: [] });
    expect(calcularMontoDevueltoItem(item)).toBe(0);
  });

  it("monto devuelto de un ítem suma cantidad*precioSnapshot de TODAS sus devoluciones, sin importar el medio", () => {
    const item = crearItemVentaConDetalle({
      precioSnapshot: 10000,
      devoluciones: [
        { cantidad: 1, medioReembolso: "efectivo" },
        { cantidad: 2, medioReembolso: "transferencia" },
      ],
    });
    expect(calcularMontoDevueltoItem(item)).toBe(30000);
  });

  it("total devuelto de la venta suma el monto devuelto de todos sus ítems", () => {
    const venta = crearVentaConDetalle({
      total: 20000,
      items: [
        crearItemVentaConDetalle({ id: "i1", precioSnapshot: 10000, devoluciones: [{ cantidad: 1, medioReembolso: "efectivo" }] }),
        crearItemVentaConDetalle({ id: "i2", precioSnapshot: 5000, devoluciones: [{ cantidad: 2, medioReembolso: "transferencia" }] }),
      ],
    });
    expect(calcularTotalDevuelto(venta)).toBe(20000);
  });

  it("total neto = total original - total devuelto, sin tocar venta.total", () => {
    const venta = crearVentaConDetalle({
      total: 30000,
      items: [crearItemVentaConDetalle({ precioSnapshot: 10000, devoluciones: [{ cantidad: 1, medioReembolso: "efectivo" }] })],
    });
    expect(calcularTotalNeto(venta)).toBe(20000);
    expect(venta.total).toBe(30000);
  });

  it("sin devoluciones: neto == total original", () => {
    const venta = crearVentaConDetalle({ total: 30000, items: [crearItemVentaConDetalle()] });
    expect(calcularTotalNeto(venta)).toBe(30000);
  });
});

describe("patchearDevolucionEnVenta", () => {
  it("agrega la devolución real (cantidad + medio) al ítem y recalcula cantidadDevuelta/cantidadVigente/subtotalVigente", () => {
    const ventas = [
      crearVentaConDetalle({
        id: "v1",
        items: [crearItemVentaConDetalle({ id: "i1", cantidadOriginal: 3, cantidadVigente: 3, precioSnapshot: 10000, devoluciones: [] })],
      }),
    ];
    const resultado = patchearDevolucionEnVenta(ventas, "v1", "i1", { cantidad: 1, medioReembolso: "efectivo" });
    const item = resultado[0].items[0];
    expect(item.devoluciones).toEqual([{ cantidad: 1, medioReembolso: "efectivo" }]);
    expect(item.cantidadDevuelta).toBe(1);
    expect(item.cantidadVigente).toBe(2);
    expect(item.subtotalVigente).toBe(20000);
  });

  it("dos devoluciones parciales con medios distintos acumulan cantidad y quedan registradas por separado", () => {
    const ventas = [
      crearVentaConDetalle({
        id: "v1",
        items: [crearItemVentaConDetalle({ id: "i1", cantidadOriginal: 3, cantidadVigente: 3, precioSnapshot: 10000, devoluciones: [] })],
      }),
    ];
    const tras1 = patchearDevolucionEnVenta(ventas, "v1", "i1", { cantidad: 1, medioReembolso: "efectivo" });
    const tras2 = patchearDevolucionEnVenta(tras1, "v1", "i1", { cantidad: 1, medioReembolso: "transferencia" });
    const item = tras2[0].items[0];
    expect(item.devoluciones).toEqual([
      { cantidad: 1, medioReembolso: "efectivo" },
      { cantidad: 1, medioReembolso: "transferencia" },
    ]);
    expect(item.cantidadDevuelta).toBe(2);
    expect(item.cantidadVigente).toBe(1);
    expect(calcularTotalDevuelto(tras2[0])).toBe(20000);
  });

  it("no toca otras líneas del mismo ítem ni otras ventas", () => {
    const otroItem = crearItemVentaConDetalle({ id: "i2", cantidadVigente: 5 });
    const otraVenta = crearVentaConDetalle({ id: "v2", items: [crearItemVentaConDetalle({ id: "i3", cantidadVigente: 9 })] });
    const ventas = [
      crearVentaConDetalle({
        id: "v1",
        items: [crearItemVentaConDetalle({ id: "i1", cantidadOriginal: 3, cantidadVigente: 3 }), otroItem],
      }),
      otraVenta,
    ];
    const resultado = patchearDevolucionEnVenta(ventas, "v1", "i1", { cantidad: 1, medioReembolso: "efectivo" });
    expect(resultado[0].items[1]).toBe(otroItem);
    expect(resultado[1]).toBe(otraVenta);
  });
});
