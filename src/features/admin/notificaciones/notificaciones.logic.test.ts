/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DESCARTES_STORAGE_KEY,
  calcularHuella,
  calcularNotificaciones,
  guardarDescartes,
  leerDescartes,
  productosConStockBajoActivos,
  reservasJugadasSinPago,
  reservasPendientesAccionables,
} from "./notificaciones.logic";
import { AHORA, HACE_20_MIN, crearPendiente, crearProducto, crearReserva, sinPago, stockBajo } from "./notificaciones.fixtures";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("reservasJugadasSinPago", () => {
  it("cuenta jugadas de la semana, no bloqueadas y sin ningún pago", () => {
    const r = reservasJugadasSinPago(
      [
        crearReserva({ id: "a" }),
        crearReserva({ id: "b", pago_efectivo: 5000 }),
        crearReserva({ id: "c", pago_transferencia: 20000 }),
        crearReserva({ id: "d", bloqueado: true }),
      ],
      AHORA,
    );
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });

  it("no cuenta turnos que todavía no terminaron", () => {
    const r = reservasJugadasSinPago(
      [
        crearReserva({ id: "futuro", fecha: "2026-06-18" }),
        crearReserva({ id: "en-curso", fecha: "2026-06-17", hora_inicio: "19:30:00", hora_fin: "20:30:00", horaInicio: "19:30", horaFin: "20:30" }),
        crearReserva({ id: "hoy-terminado", fecha: "2026-06-17", hora_inicio: "18:00:00", hora_fin: "19:00:00", horaInicio: "18:00", horaFin: "19:00" }),
      ],
      AHORA,
    );
    expect(r.map((x) => x.id)).toEqual(["hoy-terminado"]);
  });
});

describe("reservasJugadasSinPago — semanas anteriores", () => {
  const DOMINGO_23 = new Date("2026-06-21T23:00:00").getTime(); // fin de la semana de AHORA
  const LUNES_00 = new Date("2026-06-22T00:30:00").getTime(); // primera hora de la semana siguiente

  it("un turno sin pago de la semana anterior sigue apareciendo", () => {
    const r = reservasJugadasSinPago([crearReserva({ id: "vieja", fecha: "2026-06-10" })], AHORA);
    expect(r.map((x) => x.id)).toEqual(["vieja"]);
  });

  it("el cambio domingo → lunes no elimina un turno que ya estaba pendiente", () => {
    const pendiente = crearReserva({ id: "del-martes", fecha: "2026-06-16" });
    expect(reservasJugadasSinPago([pendiente], DOMINGO_23).map((x) => x.id)).toEqual(["del-martes"]);
    expect(reservasJugadasSinPago([pendiente], LUNES_00).map((x) => x.id)).toEqual(["del-martes"]);
  });

  it("suma pendientes de semanas distintas y saca solo el que se pagó", () => {
    const fuente = [
      crearReserva({ id: "esta", fecha: "2026-06-16" }),
      crearReserva({ id: "hace1", fecha: "2026-06-10" }),
      crearReserva({ id: "hace3", fecha: "2026-05-27" }),
      crearReserva({ id: "hace5", fecha: "2026-05-13" }),
    ];
    expect(reservasJugadasSinPago(fuente, AHORA)).toHaveLength(4);

    const pagada = fuente.map((r) => (r.id === "hace3" ? { ...r, pago_efectivo: 20000 } : r));
    expect(reservasJugadasSinPago(pagada, AHORA).map((x) => x.id)).toEqual(["esta", "hace1", "hace5"]);
  });

  it("el piso es la ventana finita: un turno más viejo que SEMANAS_HISTORICO_SIN_PAGO no se avisa", () => {
    // AHORA cae en la semana del lunes 15/06; 8 semanas antes = lunes 20/04.
    const r = reservasJugadasSinPago(
      [crearReserva({ id: "en-el-borde", fecha: "2026-04-20" }), crearReserva({ id: "fuera", fecha: "2026-04-19" })],
      AHORA,
    );
    expect(r.map((x) => x.id)).toEqual(["en-el-borde"]);
  });
});

describe("reservasPendientesAccionables", () => {
  it("cuenta pendientes vigentes, no confirmadas ni bloqueadas ni pasadas", () => {
    const r = reservasPendientesAccionables(
      [
        crearPendiente({ id: "ok" }),
        crearPendiente({ id: "confirmada", confirmada: true }),
        crearPendiente({ id: "bloqueada", bloqueado: true }),
        crearPendiente({ id: "pasada", fecha: "2026-06-16" }),
      ],
      AHORA,
    );
    expect(r.map((x) => x.id)).toEqual(["ok"]);
  });

  it("descarta una pendiente que venció (15 min) mientras los datos seguían en memoria", () => {
    expect(reservasPendientesAccionables([crearPendiente({ creado: HACE_20_MIN })], AHORA)).toEqual([]);
  });

  it("conserva una vencida solo si ya tiene movimiento contable (misma regla que la lista)", () => {
    const r = reservasPendientesAccionables([crearPendiente({ id: "con-pago", creado: HACE_20_MIN, pago_efectivo: 1000 })], AHORA);
    expect(r.map((x) => x.id)).toEqual(["con-pago"]);
  });
});

describe("productosConStockBajoActivos", () => {
  it("incluye stock igual al mínimo y excluye inactivos", () => {
    const r = productosConStockBajoActivos([
      crearProducto({ id: "igual", stock_actual: 3, stock_minimo: 3 }),
      crearProducto({ id: "ok", stock_actual: 4, stock_minimo: 3 }),
      crearProducto({ id: "inactivo", stock_actual: 0, activo: false }),
    ]);
    expect(r.map((p) => p.id)).toEqual(["igual"]);
  });
});

describe("calcularNotificaciones", () => {
  it("devuelve solo categorías con algo pendiente, con cantidad e ids", () => {
    const n = calcularNotificaciones({
      jugadas: sinPago(["a", "b", "c"]),
      proximas: [crearPendiente()],
      productos: [...stockBajo(["x", "y"]), crearProducto({ id: "ok" })],
      ahora: AHORA,
    });
    expect(n.map((x) => [x.tipo, x.cantidad])).toEqual([
      ["reservas-pendientes", 1],
      ["sin-pago", 3],
      ["stock-bajo", 2],
    ]);
  });

  it("sin nada pendiente devuelve lista vacía", () => {
    expect(calcularNotificaciones({ jugadas: [], proximas: [], productos: [], ahora: AHORA })).toEqual([]);
  });
});

describe("calcularHuella", () => {
  it("es estable ante el orden de los ids", () => {
    expect(calcularHuella("sin-pago", ["c", "a", "b"])).toBe(calcularHuella("sin-pago", ["a", "b", "c"]));
  });

  it("cambia si cambia el conjunto aunque la cantidad sea la misma", () => {
    expect(calcularHuella("sin-pago", ["a", "b", "c"])).not.toBe(calcularHuella("sin-pago", ["a", "b", "d"]));
  });

  it("cambia con la cantidad y con el tipo", () => {
    expect(calcularHuella("sin-pago", ["a", "b"])).not.toBe(calcularHuella("sin-pago", ["a"]));
    expect(calcularHuella("sin-pago", ["a"])).not.toBe(calcularHuella("stock-bajo", ["a"]));
  });
});

describe("descartes en localStorage", () => {
  it("ida y vuelta", () => {
    guardarDescartes({ "sin-pago": "h1" });
    expect(leerDescartes()).toEqual({ "sin-pago": "h1" });
  });

  it("JSON corrupto o de forma inesperada → sin descartes, sin lanzar", () => {
    for (const crudo of ["{no-json", "[1,2]", "42", "null", '"x"']) {
      window.localStorage.setItem(DESCARTES_STORAGE_KEY, crudo);
      expect(leerDescartes()).toEqual({});
    }
  });

  it("ignora tipos desconocidos y valores que no son string", () => {
    window.localStorage.setItem(DESCARTES_STORAGE_KEY, JSON.stringify({ "sin-pago": "ok", inventado: "x", "stock-bajo": 3 }));
    expect(leerDescartes()).toEqual({ "sin-pago": "ok" });
  });

  it("storage inaccesible no rompe ni al leer ni al escribir", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denegado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denegado");
    });
    expect(leerDescartes()).toEqual({});
    expect(() => guardarDescartes({ "sin-pago": "h" })).not.toThrow();
  });

  it("guardar vacío borra la clave", () => {
    guardarDescartes({ "sin-pago": "h1" });
    guardarDescartes({});
    expect(window.localStorage.getItem(DESCARTES_STORAGE_KEY)).toBeNull();
  });
});
