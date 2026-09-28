import { describe, expect, it } from "vitest";
import type { ItemVentaConDetalle, VentaConDetalle } from "../historial/historial.types";
import type { Producto } from "../productos/productos.logic";
import type { ReservaProcesada } from "../reservas/reservas.types";
import {
  agregarAlCarrito,
  armarItemsParaRpc,
  calcularTotalCarrito,
  calcularTotalesReserva,
  cambiarCantidadCarrito,
  esErrorReservaInexistente,
  esReservaCandidataParaVenta,
  estadoPagoTurno,
  filtrarReservasParaVenta,
  hayInactivosEnCarrito,
  itemsConVentaId,
  lineasSinStock,
  quitarDelCarrito,
  resolverCarrito,
  type ItemCarrito,
} from "./ventas.logic";

// La reserva por defecto de crearReservaProcesada (10:00-11:00, 2026-01-07,
// hora_apertura_vigente: null -> sin corrimiento de día, ver inicioReservaDate):
// 10:30 cae en plena mitad, "en juego" — así los tests de bloqueado/nombre
// (que no ejercitan la ventana horaria) siguen siendo candidatas por default.
const AHORA_EN_JUEGO = new Date("2026-01-07T10:30:00").getTime();

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

describe("agregarAlCarrito", () => {
  it("producto nuevo: crea una línea con cantidad 1", () => {
    expect(agregarAlCarrito([], "p1")).toEqual([{ productoId: "p1", cantidad: 1 }]);
  });

  it("producto ya en el carrito: funde incrementando la cantidad, no crea línea nueva", () => {
    const carrito: ItemCarrito[] = [{ productoId: "p1", cantidad: 1 }];
    expect(agregarAlCarrito(carrito, "p1")).toEqual([{ productoId: "p1", cantidad: 2 }]);
  });

  it("no toca las demás líneas", () => {
    const carrito: ItemCarrito[] = [
      { productoId: "p1", cantidad: 1 },
      { productoId: "p2", cantidad: 3 },
    ];
    expect(agregarAlCarrito(carrito, "p1")).toEqual([
      { productoId: "p1", cantidad: 2 },
      { productoId: "p2", cantidad: 3 },
    ]);
  });
});

describe("quitarDelCarrito", () => {
  it("saca solo la línea pedida", () => {
    const carrito: ItemCarrito[] = [
      { productoId: "p1", cantidad: 1 },
      { productoId: "p2", cantidad: 3 },
    ];
    expect(quitarDelCarrito(carrito, "p1")).toEqual([{ productoId: "p2", cantidad: 3 }]);
  });
});

describe("cambiarCantidadCarrito", () => {
  it("cambia la cantidad de la línea pedida", () => {
    const carrito: ItemCarrito[] = [{ productoId: "p1", cantidad: 1 }];
    expect(cambiarCantidadCarrito(carrito, "p1", 5)).toEqual([{ productoId: "p1", cantidad: 5 }]);
  });

  it("clampea a mínimo 1 — nunca 0 ni negativo", () => {
    const carrito: ItemCarrito[] = [{ productoId: "p1", cantidad: 5 }];
    expect(cambiarCantidadCarrito(carrito, "p1", 0)).toEqual([{ productoId: "p1", cantidad: 1 }]);
    expect(cambiarCantidadCarrito(carrito, "p1", -3)).toEqual([{ productoId: "p1", cantidad: 1 }]);
  });

  it("NaN (campo vacío/no numérico) clampea a 1", () => {
    const carrito: ItemCarrito[] = [{ productoId: "p1", cantidad: 5 }];
    expect(cambiarCantidadCarrito(carrito, "p1", NaN)).toEqual([{ productoId: "p1", cantidad: 1 }]);
  });
});

describe("resolverCarrito", () => {
  it("cruza cada línea contra el catálogo vigente por id", () => {
    const productos = [crearProducto({ id: "p1", nombre: "Pelotas" }), crearProducto({ id: "p2", nombre: "Grips" })];
    const carrito: ItemCarrito[] = [{ productoId: "p2", cantidad: 3 }];
    expect(resolverCarrito(carrito, productos)).toEqual([{ productoId: "p2", cantidad: 3, producto: productos[1] }]);
  });

  it("producto que ya no está en el catálogo cargado: producto undefined, sin romper", () => {
    const carrito: ItemCarrito[] = [{ productoId: "fantasma", cantidad: 2 }];
    expect(resolverCarrito(carrito, [crearProducto({ id: "p1" })])).toEqual([
      { productoId: "fantasma", cantidad: 2, producto: undefined },
    ]);
  });
});

describe("calcularTotalCarrito — precio SIEMPRE derivado en vivo, nunca un snapshot", () => {
  it("suma cantidad * precio_venta vigente de cada línea", () => {
    const productos = [crearProducto({ id: "p1", precio_venta: 10000 }), crearProducto({ id: "p2", precio_venta: 3500 })];
    const lineas = resolverCarrito(
      [
        { productoId: "p1", cantidad: 2 },
        { productoId: "p2", cantidad: 3 },
      ],
      productos,
    );
    expect(calcularTotalCarrito(lineas)).toBe(2 * 10000 + 3 * 3500);
  });

  it("si el precio del catálogo cambió, el total usa el precio NUEVO (no el que tenía cuando se agregó)", () => {
    const catalogoOriginal = [crearProducto({ id: "p1", precio_venta: 10000 })];
    const carrito: ItemCarrito[] = [{ productoId: "p1", cantidad: 2 }];
    expect(calcularTotalCarrito(resolverCarrito(carrito, catalogoOriginal))).toBe(20000);

    const catalogoActualizado = [crearProducto({ id: "p1", precio_venta: 12000 })];
    expect(calcularTotalCarrito(resolverCarrito(carrito, catalogoActualizado))).toBe(24000);
  });

  it("línea sin producto resuelto no rompe el cálculo (cuenta como 0)", () => {
    const lineas = resolverCarrito([{ productoId: "fantasma", cantidad: 5 }], [crearProducto({ id: "p1" })]);
    expect(calcularTotalCarrito(lineas)).toBe(0);
  });
});

describe("lineasSinStock", () => {
  it("detecta solo las líneas cuya cantidad excede el stock vigente", () => {
    const productos = [
      crearProducto({ id: "p1", stock_actual: 5 }),
      crearProducto({ id: "p2", stock_actual: 1 }),
    ];
    const lineas = resolverCarrito(
      [
        { productoId: "p1", cantidad: 3 },
        { productoId: "p2", cantidad: 4 },
      ],
      productos,
    );
    expect(lineasSinStock(lineas).map((l) => l.productoId)).toEqual(["p2"]);
  });

  it("usa el stock VIGENTE, no uno viejo: si el stock subió, deja de contar como sin stock", () => {
    const carrito: ItemCarrito[] = [{ productoId: "p1", cantidad: 10 }];
    const lineasConPocoStock = resolverCarrito(carrito, [crearProducto({ id: "p1", stock_actual: 5 })]);
    expect(lineasSinStock(lineasConPocoStock)).toHaveLength(1);

    const lineasConStockRepuesto = resolverCarrito(carrito, [crearProducto({ id: "p1", stock_actual: 20 })]);
    expect(lineasSinStock(lineasConStockRepuesto)).toHaveLength(0);
  });

  it("línea sin producto resuelto no cuenta como sin stock (es otro caso, ver hayInactivosEnCarrito)", () => {
    const lineas = resolverCarrito([{ productoId: "fantasma", cantidad: 5 }], [crearProducto({ id: "p1" })]);
    expect(lineasSinStock(lineas)).toHaveLength(0);
  });
});

describe("hayInactivosEnCarrito", () => {
  it("todos activos y resueltos -> false", () => {
    const lineas = resolverCarrito([{ productoId: "p1", cantidad: 1 }], [crearProducto({ id: "p1", activo: true })]);
    expect(hayInactivosEnCarrito(lineas)).toBe(false);
  });

  it("un producto inactivo en el carrito -> true", () => {
    const lineas = resolverCarrito([{ productoId: "p1", cantidad: 1 }], [crearProducto({ id: "p1", activo: false })]);
    expect(hayInactivosEnCarrito(lineas)).toBe(true);
  });

  it("un producto que no resuelve contra el catálogo -> true (caso defensivo, también bloquea)", () => {
    const lineas = resolverCarrito([{ productoId: "fantasma", cantidad: 1 }], [crearProducto({ id: "p1" })]);
    expect(hayInactivosEnCarrito(lineas)).toBe(true);
  });
});

describe("armarItemsParaRpc", () => {
  it("mapea productoId/cantidad -> producto_id/cantidad, sin precio", () => {
    const carrito: ItemCarrito[] = [
      { productoId: "p1", cantidad: 2 },
      { productoId: "p2", cantidad: 1 },
    ];
    expect(armarItemsParaRpc(carrito)).toEqual([
      { producto_id: "p1", cantidad: 2 },
      { producto_id: "p2", cantidad: 1 },
    ]);
  });
});

function crearReservaProcesada(overrides: Partial<ReservaProcesada> = {}): ReservaProcesada {
  return {
    id: "r1",
    fecha: "2026-01-07",
    hora_inicio: "10:00:00",
    hora_fin: "11:00:00",
    horaInicio: "10:00",
    horaFin: "11:00",
    nombre: "Juan",
    telefono: "3771111111",
    precio: 20000,
    creado: new Date().toISOString(),
    bloqueado: false,
    confirmada: false,
    pago_efectivo: 0,
    pago_transferencia: 0,
    turno_fijo_id: null,
    telefono_normalizado: null,
    hora_apertura_vigente: null,
    ...overrides,
  };
}

describe("filtrarReservasParaVenta — D4/P2", () => {
  it("excluye siempre las reservas bloqueadas (no son un cliente real)", () => {
    const reservas = [
      crearReservaProcesada({ id: "a", bloqueado: false }),
      crearReservaProcesada({ id: "b", bloqueado: true }),
    ];
    expect(filtrarReservasParaVenta(reservas, "", AHORA_EN_JUEGO).map((r) => r.id)).toEqual(["a"]);
  });

  it("no filtra por confirmada: permite confirmadas y pendientes", () => {
    const reservas = [
      crearReservaProcesada({ id: "a", confirmada: true }),
      crearReservaProcesada({ id: "b", confirmada: false }),
    ];
    expect(filtrarReservasParaVenta(reservas, "", AHORA_EN_JUEGO).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("filtro de nombre: substring case-insensitive", () => {
    const reservas = [crearReservaProcesada({ id: "a", nombre: "Juan Pérez" }), crearReservaProcesada({ id: "b", nombre: "María" })];
    expect(filtrarReservasParaVenta(reservas, "juan", AHORA_EN_JUEGO).map((r) => r.id)).toEqual(["a"]);
  });

  it("sin filtro de nombre devuelve todas las elegibles", () => {
    const reservas = [crearReservaProcesada({ id: "a" }), crearReservaProcesada({ id: "b" })];
    expect(filtrarReservasParaVenta(reservas, "", AHORA_EN_JUEGO).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("bloqueada + nombre coincidente: sigue excluida (bloqueado gana siempre)", () => {
    const reservas = [crearReservaProcesada({ id: "a", nombre: "Bloqueado", bloqueado: true })];
    expect(filtrarReservasParaVenta(reservas, "bloqueado", AHORA_EN_JUEGO)).toHaveLength(0);
  });

  it("P2 — además del bloqueo/nombre, aplica la ventana horaria: una reserva terminada hace más de 3h no aparece aunque el nombre coincida", () => {
    const finMasDeUnMinuto = new Date("2026-01-07T11:00:00").getTime() + 3 * 60 * 60 * 1000 + 60 * 1000;
    const reservas = [crearReservaProcesada({ id: "a" })];
    expect(filtrarReservasParaVenta(reservas, "", finMasDeUnMinuto)).toHaveLength(0);
  });
});

describe("esReservaCandidataParaVenta — P2", () => {
  // hora_apertura_vigente: null en estos casos (mismo default que
  // crearReservaProcesada) — horaInicio/horaFin nunca caen antes de una
  // apertura desconocida, así que el resultado es el mismo que con
  // cualquier apertura <= "10:00": no hay corrimiento de día que probar acá,
  // eso lo cubre el describe de "apertura vigente" más abajo.
  const reserva = { fecha: "2026-01-07", horaInicio: "10:00", horaFin: "11:00", hora_apertura_vigente: null };
  const inicioMs = new Date("2026-01-07T10:00:00").getTime();
  const finMs = new Date("2026-01-07T11:00:00").getTime();
  const TRES_HORAS_MS = 3 * 60 * 60 * 1000;

  it("en juego (ya empezó, todavía no termina): candidata", () => {
    expect(esReservaCandidataParaVenta(reserva, inicioMs + 30 * 60 * 1000)).toBe(true);
  });

  it("terminó hace menos de 3h: candidata", () => {
    expect(esReservaCandidataParaVenta(reserva, finMs + 2 * 60 * 60 * 1000)).toBe(true);
  });

  it("exactamente en el borde de 3h: candidata (\"como máximo\" es inclusive)", () => {
    expect(esReservaCandidataParaVenta(reserva, finMs + TRES_HORAS_MS)).toBe(true);
  });

  it("terminó hace más de 3h: NO candidata", () => {
    expect(esReservaCandidataParaVenta(reserva, finMs + TRES_HORAS_MS + 1)).toBe(false);
  });

  it("todavía no empezó (futura): NO candidata", () => {
    expect(esReservaCandidataParaVenta(reserva, inicioMs - 60 * 1000)).toBe(false);
  });

  describe("cruce de medianoche (23:30 -> 01:00 del día siguiente), apertura vigente 08:00", () => {
    const reservaCruce = { fecha: "2026-01-07", horaInicio: "23:30", horaFin: "01:00", hora_apertura_vigente: "08:00:00" };
    const inicioCruceMs = new Date("2026-01-07T23:30:00").getTime();
    const finCruceMs = new Date("2026-01-08T01:00:00").getTime();

    it("en juego después de medianoche: sigue candidata aunque la fecha calendario ya sea otra (cambio de día)", () => {
      const ahora = new Date("2026-01-08T00:15:00").getTime();
      expect(ahora).toBeGreaterThan(inicioCruceMs);
      expect(ahora).toBeLessThan(finCruceMs);
      expect(esReservaCandidataParaVenta(reservaCruce, ahora)).toBe(true);
    });

    it("terminó hace menos de 3h, ya en el día calendario siguiente: candidata", () => {
      const ahora = finCruceMs + 2 * 60 * 60 * 1000; // 2026-01-08T03:00:00
      expect(esReservaCandidataParaVenta(reservaCruce, ahora)).toBe(true);
    });

    it("terminó hace más de 3h: NO candidata", () => {
      const ahora = finCruceMs + TRES_HORAS_MS + 60 * 1000; // 2026-01-08T04:01:00
      expect(esReservaCandidataParaVenta(reservaCruce, ahora)).toBe(false);
    });

    it("antes de las 23:30 (todavía no empezó): NO candidata", () => {
      const ahora = new Date("2026-01-07T20:00:00").getTime();
      expect(esReservaCandidataParaVenta(reservaCruce, ahora)).toBe(false);
    });
  });

  // P2 (revisión) — la apertura vigente viene de `hora_apertura_vigente` de
  // CADA fila (poblada por trigger en el momento de crear/editar la reserva,
  // ver c4_1_resolver_instantes_segun_horario_operativo.sql), nunca de la
  // config actual: reinterpretar una reserva vieja con el horario de HOY la
  // rompería si el horario cambió después de jugada.
  describe("apertura vigente por fila (no la config actual)", () => {
    it("apertura distinta de 08:00 (06:00): 07:00 ya es horario normal, sin corrimiento de día", () => {
      // Con apertura 08:00 (default del resto del archivo), 07:00 < 08:00
      // dispararía el corrimiento a la madrugada del día siguiente. Con
      // 06:00 vigente, 07:00 >= 06:00: es una reserva normal del mismo día.
      const r = { fecha: "2026-01-07", horaInicio: "07:00", horaFin: "08:00", hora_apertura_vigente: "06:00:00" };
      const inicio = new Date("2026-01-07T07:00:00").getTime();
      const fin = new Date("2026-01-07T08:00:00").getTime();
      expect(esReservaCandidataParaVenta(r, inicio + 10 * 60 * 1000)).toBe(true); // en juego, mismo día
      expect(esReservaCandidataParaVenta(r, fin + 3 * 60 * 60 * 1000)).toBe(true); // borde 3h, mismo día
      expect(esReservaCandidataParaVenta(r, fin + 3 * 60 * 60 * 1000 + 1)).toBe(false);
    });

    it("un cambio posterior del horario del local no altera cómo se interpreta una reserva ya creada", () => {
      // Dos reservas idénticas en fecha/horaInicio/horaFin (07:00-08:00, un
      // horario que hoy en la práctica no se ofrece: ver seed real
      // 08:00-01:00), cada una creada bajo una apertura vigente distinta —
      // exactamente lo que pasaría si el local cambió de horario entre una y
      // otra. `hora_apertura_vigente` congela para siempre cuál regía en el
      // momento de esa reserva puntual.
      const reservaVieja = { fecha: "2026-01-07", horaInicio: "07:00", horaFin: "08:00", hora_apertura_vigente: "08:00:00" };
      const reservaNueva = { fecha: "2026-01-07", horaInicio: "07:00", horaFin: "08:00", hora_apertura_vigente: "06:00:00" };

      // Bajo la apertura vieja (08:00), 07:00 < 08:00 corre al día
      // calendario SIGUIENTE (2026-01-08): a las 2026-01-07T07:30 todavía no
      // "empezó" según esa reserva.
      const ahoraMismoDiaCalendario = new Date("2026-01-07T07:30:00").getTime();
      expect(esReservaCandidataParaVenta(reservaVieja, ahoraMismoDiaCalendario)).toBe(false);
      // La reserva nueva, con la apertura YA cambiada a 06:00, interpreta el
      // mismo horaInicio/horaFin como el mismo día calendario: a esa misma
      // hora está en juego.
      expect(esReservaCandidataParaVenta(reservaNueva, ahoraMismoDiaCalendario)).toBe(true);

      // Y en el día calendario que la reserva vieja SÍ considera "su" 07:00
      // (2026-01-08), sigue en juego — el cambio de horario posterior
      // (representado acá por reservaNueva) no la reinterpreta.
      const ahoraDiaSiguiente = new Date("2026-01-08T07:30:00").getTime();
      expect(esReservaCandidataParaVenta(reservaVieja, ahoraDiaSiguiente)).toBe(true);
    });

    it("hora_apertura_vigente null (dato viejo sin resolver, o día cerrado): sin corrimiento, nunca 08:00 por defecto", () => {
      // Mismo horaInicio "07:00" que en los casos de arriba, pero sin
      // apertura conocida: no debe comportarse como si la apertura fuera
      // 08:00 (fallback prohibido) — se interpreta sin corrimiento de día,
      // igual que degradan los overloads puros de Postgres cuando
      // p_apertura es null.
      const r = { fecha: "2026-01-07", horaInicio: "07:00", horaFin: "08:00", hora_apertura_vigente: null };
      const inicio = new Date("2026-01-07T07:00:00").getTime(); // NO 2026-01-08
      expect(esReservaCandidataParaVenta(r, inicio + 10 * 60 * 1000)).toBe(true);
    });
  });
});

describe("esErrorReservaInexistente — D4", () => {
  it("detecta la FK violation exacta (código + constraint)", () => {
    expect(
      esErrorReservaInexistente({
        code: "23503",
        message: 'insert or update on table "ventas" violates foreign key constraint "ventas_reserva_id_fkey"',
      }),
    ).toBe(true);
  });

  it("mismo código pero otra constraint: no coincide", () => {
    expect(esErrorReservaInexistente({ code: "23503", message: "violates foreign key constraint \"otra_fkey\"" })).toBe(false);
  });

  it("mismo texto de constraint pero otro código: no coincide", () => {
    expect(esErrorReservaInexistente({ code: "P0001", message: "algo con ventas_reserva_id_fkey adentro" })).toBe(false);
  });

  it("error null/undefined: no coincide, sin romper", () => {
    expect(esErrorReservaInexistente(null)).toBe(false);
    expect(esErrorReservaInexistente(undefined)).toBe(false);
  });

  it("stock_insuficiente (otro error ya manejado) no se confunde con este", () => {
    expect(esErrorReservaInexistente({ message: "stock_insuficiente" })).toBe(false);
  });
});

// --- P3 (detalle de reserva: productos/ventas asociados) --------------------

describe("estadoPagoTurno — P3", () => {
  it("pendiente: pagado = 0", () => {
    expect(estadoPagoTurno({ precio: 20000, pago_efectivo: 0, pago_transferencia: 0 })).toBe("pendiente");
  });

  it("parcial: 0 < pagado < precio", () => {
    expect(estadoPagoTurno({ precio: 20000, pago_efectivo: 10000, pago_transferencia: 0 })).toBe("parcial");
  });

  it("parcial también con mixto (efectivo + transferencia) que no llega al precio", () => {
    expect(estadoPagoTurno({ precio: 20000, pago_efectivo: 5000, pago_transferencia: 5000 })).toBe("parcial");
  });

  it("pagado: pagado === precio", () => {
    expect(estadoPagoTurno({ precio: 20000, pago_efectivo: 20000, pago_transferencia: 0 })).toBe("pagado");
  });

  it("pagado: pagado > precio (defensivo — el check de DB ya lo impide, pero >= precio sigue clasificando pagado)", () => {
    expect(estadoPagoTurno({ precio: 20000, pago_efectivo: 25000, pago_transferencia: 0 })).toBe("pagado");
  });
});

// Helpers de fixture — mismo criterio que historial.logic.test.ts
// (crearVentaConDetalle/crearItemVentaConDetalle): no se importan de ahí
// porque son locales a ese archivo, se recrean acá con el mismo shape.
function crearItemVenta(overrides: Partial<ItemVentaConDetalle> = {}): ItemVentaConDetalle {
  return {
    id: "i1",
    productoId: "p1",
    productoNombre: "Pelotas",
    cantidadOriginal: 2,
    cantidadDevuelta: 0,
    cantidadVigente: 2,
    precioSnapshot: 5000,
    costoSnapshot: 2000,
    subtotalOriginal: 10000,
    subtotalVigente: 10000,
    devoluciones: [],
    ...overrides,
  };
}

function crearVenta(overrides: Partial<VentaConDetalle> = {}): VentaConDetalle {
  return {
    id: "v1",
    fecha: "2026-01-07",
    total: 10000,
    pagoEfectivo: 10000,
    pagoTransferencia: 0,
    creado: new Date().toISOString(),
    reserva: null,
    items: [crearItemVenta()],
    ...overrides,
  };
}

describe("calcularTotalesReserva — P3", () => {
  const RESERVA = { precio: 40000, pago_efectivo: 40000, pago_transferencia: 0 };

  it("sin ventas: productosNetos = 0, totalAsociado/cobradoNeto = solo el turno", () => {
    const totales = calcularTotalesReserva(RESERVA, []);
    expect(totales).toEqual({
      precioTurno: 40000,
      pagadoTurno: 40000,
      saldoPendienteTurno: 0,
      productosNetos: 0,
      totalAsociado: 40000,
      cobradoNeto: 40000,
    });
  });

  it("una venta sin devolución: productosNetos = total de la venta", () => {
    const ventas = [crearVenta({ total: 8000, items: [crearItemVenta({ subtotalVigente: 8000 })] })];
    const totales = calcularTotalesReserva(RESERVA, ventas);
    expect(totales.productosNetos).toBe(8000);
    expect(totales.totalAsociado).toBe(48000);
    expect(totales.cobradoNeto).toBe(48000);
  });

  it("varias ventas asociadas a la misma reserva: se suman todas", () => {
    const ventas = [
      crearVenta({ id: "v1", total: 5000 }),
      crearVenta({ id: "v2", total: 3000, items: [crearItemVenta({ subtotalVigente: 3000 })] }),
    ];
    const totales = calcularTotalesReserva(RESERVA, ventas);
    expect(totales.productosNetos).toBe(8000);
    expect(totales.totalAsociado).toBe(48000);
    expect(totales.cobradoNeto).toBe(48000);
  });

  it("devolución parcial: productosNetos usa el neto (total - devuelto), no el total original", () => {
    // Venta de $10.000 (2 unidades a $5.000), se devuelve 1 -> neto $5.000.
    // `devoluciones` (no solo cantidadDevuelta/subtotalVigente) tiene que
    // venir poblado: calcularTotalNeto/calcularTotalDevuelto (historial.logic)
    // derivan el monto devuelto de esas entradas reales, no de los campos ya
    // calculados — mismo shape que produce procesarItem de verdad.
    const ventas = [
      crearVenta({
        total: 10000,
        items: [
          crearItemVenta({
            devoluciones: [{ cantidad: 1, medioReembolso: "efectivo" }],
            cantidadDevuelta: 1,
            cantidadVigente: 1,
            subtotalVigente: 5000,
          }),
        ],
      }),
    ];
    const totales = calcularTotalesReserva(RESERVA, ventas);
    expect(totales.productosNetos).toBe(5000);
    expect(totales.totalAsociado).toBe(45000);
    expect(totales.cobradoNeto).toBe(45000);
  });

  it("devolución total: la venta queda en $0 neto, pero sigue contando (no desaparece)", () => {
    const ventas = [
      crearVenta({
        total: 10000,
        items: [
          crearItemVenta({
            devoluciones: [{ cantidad: 2, medioReembolso: "efectivo" }],
            cantidadDevuelta: 2,
            cantidadVigente: 0,
            subtotalVigente: 0,
          }),
        ],
      }),
    ];
    const totales = calcularTotalesReserva(RESERVA, ventas);
    expect(totales.productosNetos).toBe(0);
    expect(totales.totalAsociado).toBe(40000); // == precioTurno, los productos no suman nada
    expect(totales.cobradoNeto).toBe(40000);
  });

  it("saldo pendiente NUNCA incluye productos: turno pendiente + productos ya cobrados -> el saldo es solo el del turno", () => {
    const reservaPendiente = { precio: 40000, pago_efectivo: 0, pago_transferencia: 0 };
    const ventas = [crearVenta({ total: 8000, items: [crearItemVenta({ subtotalVigente: 8000 })] })];
    const totales = calcularTotalesReserva(reservaPendiente, ventas);
    expect(totales.saldoPendienteTurno).toBe(40000); // no 48000 — los productos ya están cobrados, no se suman a la deuda
    expect(totales.totalAsociado).toBe(48000);
    expect(totales.cobradoNeto).toBe(8000);
  });

  it("saldo pendiente refleja un turno parcial, sin que los productos lo tapen ni lo empeoren", () => {
    const reservaParcial = { precio: 40000, pago_efectivo: 15000, pago_transferencia: 0 };
    const ventas = [crearVenta({ total: 8000, items: [crearItemVenta({ subtotalVigente: 8000 })] })];
    const totales = calcularTotalesReserva(reservaParcial, ventas);
    expect(totales.saldoPendienteTurno).toBe(25000);
    expect(totales.pagadoTurno).toBe(15000);
    expect(totales.cobradoNeto).toBe(23000); // 15000 (turno) + 8000 (productos), no 25000+8000
  });
});

describe("itemsConVentaId — P4", () => {
  it("sin ventas: lista vacía", () => {
    expect(itemsConVentaId([])).toEqual([]);
  });

  it("agrega el ventaId de la venta contenedora a cada ítem, sin tocar el resto de sus campos", () => {
    const item = crearItemVenta({ id: "i1" });
    const ventas = [crearVenta({ id: "v1", items: [item] })];
    expect(itemsConVentaId(ventas)).toEqual([{ ...item, ventaId: "v1" }]);
  });

  it("varias ventas asociadas: cada ítem conserva el ventaId de SU propia venta, no el de otra", () => {
    const itemA = crearItemVenta({ id: "ia", productoNombre: "Pelotas" });
    const itemB = crearItemVenta({ id: "ib", productoNombre: "Grips" });
    const ventas = [crearVenta({ id: "v1", items: [itemA] }), crearVenta({ id: "v2", items: [itemB] })];

    const resultado = itemsConVentaId(ventas);

    expect(resultado.find((it) => it.id === "ia")?.ventaId).toBe("v1");
    expect(resultado.find((it) => it.id === "ib")?.ventaId).toBe("v2");
  });

  it("una venta con varios ítems: todos comparten el mismo ventaId", () => {
    const ventas = [crearVenta({ id: "v1", items: [crearItemVenta({ id: "i1" }), crearItemVenta({ id: "i2" })] })];

    const resultado = itemsConVentaId(ventas);

    expect(resultado.map((it) => it.ventaId)).toEqual(["v1", "v1"]);
  });
});
