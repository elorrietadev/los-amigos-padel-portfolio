// Tests de construirBloquesDia (R3) — agrupación de celdas de 30min en
// bloques por duración real. calcularCelda/esFinDeBloque (agenda.logic.ts) no
// se tocan ni se retestean acá, ya están cubiertos por agenda.logic.test.ts.

import { describe, expect, it } from "vitest";
import { construirFilasGrilla } from "./agenda.logic";
import { construirBloquesDia } from "./agenda.grid";
import type { ReservaConHorario, TurnoFijoConHorario } from "./agenda.logic";

const APERTURA_MIN = 8 * 60; // 08:00
const FILAS = construirFilasGrilla(APERTURA_MIN, 20 * 60); // 08:00..19:30

function reserva(overrides: Partial<ReservaConHorario> = {}): ReservaConHorario {
  return {
    id: "r1",
    fecha: "2026-06-01",
    hora_inicio: "10:00:00",
    hora_fin: "10:30:00",
    horaInicio: "10:00",
    horaFin: "10:30",
    nombre: "Juan",
    telefono: "111",
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

describe("construirBloquesDia", () => {
  it("una reserva de 30 min da un único bloque de span 1", () => {
    const bloques = construirBloquesDia("2026-06-01", FILAS, [reserva()], [], [], APERTURA_MIN);
    expect(bloques).toHaveLength(1);
    expect(bloques[0].span).toBe(1);
    expect(bloques[0].filaInicio).toBe(FILAS.indexOf("10:00"));
  });

  it("una reserva de 90 min da un único bloque de span 3", () => {
    const bloques = construirBloquesDia(
      "2026-06-01",
      FILAS,
      [reserva({ hora_inicio: "10:00:00", hora_fin: "11:30:00", horaInicio: "10:00", horaFin: "11:30" })],
      [],
      [],
      APERTURA_MIN,
    );
    expect(bloques).toHaveLength(1);
    expect(bloques[0].span).toBe(3);
    const celda = bloques[0].celda;
    if (celda.estado === "fijo") throw new Error("no debería ser turno fijo");
    expect(celda.reserva.id).toBe("r1");
  });

  it("dos reservas separadas por un hueco libre dan dos bloques distintos", () => {
    const bloques = construirBloquesDia(
      "2026-06-01",
      FILAS,
      [
        reserva({ id: "a", hora_inicio: "10:00:00", hora_fin: "10:30:00", horaInicio: "10:00", horaFin: "10:30" }),
        reserva({ id: "b", hora_inicio: "12:00:00", hora_fin: "12:30:00", horaInicio: "12:00", horaFin: "12:30" }),
      ],
      [],
      [],
      APERTURA_MIN,
    );
    expect(bloques).toHaveLength(2);
    expect(bloques.map((b) => b.span)).toEqual([1, 1]);
  });

  it("un bloqueado inmediatamente después de una reserva no se funde en un solo bloque (cambia identidad)", () => {
    const bloques = construirBloquesDia(
      "2026-06-01",
      FILAS,
      [
        reserva({ id: "a", hora_inicio: "10:00:00", hora_fin: "10:30:00", horaInicio: "10:00", horaFin: "10:30" }),
        reserva({ id: "b", bloqueado: true, hora_inicio: "10:30:00", hora_fin: "11:00:00", horaInicio: "10:30", horaFin: "11:00" }),
      ],
      [],
      [],
      APERTURA_MIN,
    );
    expect(bloques).toHaveLength(2);
    expect(bloques[0].celda.estado).toBe("reserva");
    expect(bloques[1].celda.estado).toBe("bloqueado");
  });

  it("un turno fijo de 30 min sin excepción da un bloque de span 1", () => {
    const turno: TurnoFijoConHorario = {
      id: "t1",
      titular_id: "titular-1",
      dia_semana: new Date("2026-06-01T00:00:00").getDay(),
      nombre: "Fijo Martin",
      telefono: "222",
      horaInicio: "18:00",
      horaFin: "18:30",
    };
    const bloques = construirBloquesDia("2026-06-01", FILAS, [], [turno], [], APERTURA_MIN);
    expect(bloques).toHaveLength(1);
    expect(bloques[0].span).toBe(1);
    expect(bloques[0].celda.estado).toBe("fijo");
  });

  it("sin ocupación, no arma ningún bloque", () => {
    const bloques = construirBloquesDia("2026-06-01", FILAS, [], [], [], APERTURA_MIN);
    expect(bloques).toHaveLength(0);
  });

  it("una reserva que termina en la última fila visible cierra el bloque correctamente", () => {
    const filasCortas = construirFilasGrilla(APERTURA_MIN, 8 * 60 + 60); // 08:00, 08:30 solamente
    const bloques = construirBloquesDia(
      "2026-06-01",
      filasCortas,
      [reserva({ hora_inicio: "08:30:00", hora_fin: "09:00:00", horaInicio: "08:30", horaFin: "09:00" })],
      [],
      [],
      APERTURA_MIN,
    );
    expect(bloques).toHaveLength(1);
    expect(bloques[0]).toEqual({ celda: bloques[0].celda, filaInicio: 1, span: 1 });
  });
});
