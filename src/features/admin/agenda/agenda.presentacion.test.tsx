/** @vitest-environment jsdom */
// Tests de agenda.presentacion.tsx (R3) — formateo de texto/color de los
// bloques de la grilla: regla de >=60min (hora + nombre en dos líneas) vs.
// 30-45min ("10:00 · Nombre" en una sola línea), estilo por tipo
// (reserva/fijo/bloqueado) y el indicador de pago pendiente.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CeldaOcupada } from "./agenda.grid";
import type { ReservaConHorario } from "./agenda.logic";
import { AgendaBloqueContenido, estaPagoPendiente, estiloBloque, nombreCelda, tituloCelda } from "./agenda.presentacion";

afterEach(cleanup);

function reservaData(overrides: Partial<ReservaConHorario> = {}): ReservaConHorario {
  return {
    id: "r1",
    fecha: "2026-06-01",
    hora_inicio: "10:00:00",
    hora_fin: "10:30:00",
    horaInicio: "10:00",
    horaFin: "10:30",
    nombre: "Juan Reserva",
    telefono: "3771111111",
    precio: 20000,
    creado: new Date().toISOString(),
    bloqueado: false,
    confirmada: true,
    pago_efectivo: 0,
    pago_transferencia: 0,
    turno_fijo_id: null,
    telefono_normalizado: null,
    hora_apertura_vigente: null,
    ...overrides,
  };
}

function celdaReserva(overrides: Partial<ReservaConHorario> = {}): CeldaOcupada {
  return { estado: "reserva", reserva: reservaData(overrides) };
}

function celdaBloqueado(overrides: Partial<ReservaConHorario> = {}): CeldaOcupada {
  return { estado: "bloqueado", reserva: reservaData({ bloqueado: true, ...overrides }) };
}

function celdaFijo(): CeldaOcupada {
  return {
    estado: "fijo",
    fecha: "2026-06-01",
    turnoFijo: {
      id: "t1",
      titular_id: "titular-1",
      dia_semana: 1,
      nombre: "Fijo Martin",
      telefono: "3773333333",
      horaInicio: "18:00",
      horaFin: "18:30",
    },
  };
}

describe("AgendaBloqueContenido", () => {
  it(">=60 min: hora y nombre en dos líneas separadas", () => {
    render(<AgendaBloqueContenido celda={celdaReserva()} duracionMin={90} />);
    expect(screen.getByText("10:00")).toBeTruthy();
    expect(screen.getByText("Juan Reserva")).toBeTruthy();
  });

  it("30-45 min: hora y nombre en una sola línea 'HH:MM · Nombre'", () => {
    render(<AgendaBloqueContenido celda={celdaReserva()} duracionMin={30} />);
    expect(screen.getByText("10:00 · Juan Reserva")).toBeTruthy();
  });

  it("turno fijo de 30 min: usa su propia hora/nombre en una sola línea", () => {
    render(<AgendaBloqueContenido celda={celdaFijo()} duracionMin={30} />);
    expect(screen.getByText("18:00 · Fijo Martin")).toBeTruthy();
  });
});

describe("nombreCelda / tituloCelda", () => {
  it("bloqueado muestra 'Bloqueado' como nombre, sin datos de jugador", () => {
    expect(nombreCelda(celdaBloqueado())).toBe("Bloqueado");
  });

  it("tituloCelda agrega 'Pago pendiente' solo cuando no hay ningún monto registrado", () => {
    expect(tituloCelda(celdaReserva())).toBe("Juan Reserva · 3771111111 · 10:00-10:30 · Pago pendiente");
    expect(tituloCelda(celdaReserva({ pago_efectivo: 20000 }))).toBe("Juan Reserva · 3771111111 · 10:00-10:30");
  });

  it("tituloCelda de bloqueado/fijo no menciona pago", () => {
    expect(tituloCelda(celdaBloqueado())).toBe("Bloqueado (10:00-10:30)");
    expect(tituloCelda(celdaFijo())).toBe("Turno fijo: Fijo Martin · 3773333333 · 18:00-18:30");
  });
});

describe("estaPagoPendiente", () => {
  it("reserva sin ningún monto registrado: pendiente", () => {
    expect(estaPagoPendiente(celdaReserva())).toBe(true);
  });

  it("reserva con algún monto registrado (parcial o total): no pendiente", () => {
    expect(estaPagoPendiente(celdaReserva({ pago_transferencia: 5000 }))).toBe(false);
  });

  it("bloqueado/fijo nunca están 'pendientes de pago'", () => {
    expect(estaPagoPendiente(celdaBloqueado())).toBe(false);
    expect(estaPagoPendiente(celdaFijo())).toBe(false);
  });
});

describe("estiloBloque — un color/tratamiento distinto por tipo", () => {
  it("reserva, fijo y bloqueado tienen className distintos entre sí", () => {
    const clases = new Set([estiloBloque(celdaReserva()).className, estiloBloque(celdaFijo()).className, estiloBloque(celdaBloqueado()).className]);
    expect(clases.size).toBe(3);
  });

  it("fijo usa el token secundario/cian", () => {
    expect(estiloBloque(celdaFijo()).className).toContain("secondary");
  });

  it("bloqueado tiene un tratamiento rayado (no un color sólido de estado)", () => {
    const { style } = estiloBloque(celdaBloqueado());
    expect(style?.backgroundImage).toContain("repeating-linear-gradient");
  });
});


describe("identidad visual de ocurrencias fijas", () => {
  it("futuro y materializado comparten el mismo color y fondo", () => {
    expect(estiloBloque(celdaReserva({ turno_fijo_id: "t1" }))).toEqual(estiloBloque(celdaFijo()));
    expect(tituloCelda(celdaReserva({ turno_fijo_id: "t1" }))).toContain("Turno fijo:");
  });

  it.each([30, 60, 90, 120, 180])("mantiene el indicador de fijo y EN JUEGO en %i minutos", (duracionMin) => {
    const { rerender, unmount } = render(<AgendaBloqueContenido celda={celdaFijo()} duracionMin={duracionMin} enCurso />);
    expect(screen.getByRole("img", { name: "Turno fijo" })).toBeTruthy();
    expect(screen.getByText("En juego")).toBeTruthy();
    rerender(<AgendaBloqueContenido celda={celdaReserva({ turno_fijo_id: "t1" })} duracionMin={duracionMin} />);
    expect(screen.getByRole("img", { name: "Turno fijo" })).toBeTruthy();
    expect(screen.queryByText("En juego")).toBeNull();
    unmount();
  });

  it("una reserva normal o un bloqueo no adquieren identidad de fijo", () => {
    const { rerender, unmount } = render(<AgendaBloqueContenido celda={celdaReserva()} duracionMin={90} />);
    expect(screen.queryByRole("img", { name: "Turno fijo" })).toBeNull();
    const bloqueo = celdaBloqueado({ turno_fijo_id: "t1" });
    rerender(<AgendaBloqueContenido celda={bloqueo} duracionMin={90} />);
    expect(screen.queryByRole("img", { name: "Turno fijo" })).toBeNull();
    expect(estiloBloque(bloqueo).style?.backgroundImage).toContain("repeating-linear-gradient");
    unmount();
  });
});
