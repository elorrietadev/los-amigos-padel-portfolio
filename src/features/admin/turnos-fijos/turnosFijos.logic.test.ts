import { describe, expect, it } from "vitest";
import type { TurnoFijoConHorario } from "../agenda/agenda.logic";
import {
  agruparPorTitular,
  buscarChoquesTurnoFijoConReservas,
  calcularFechaInicioReal,
  hayHorariosDuplicados,
  haySolapeEntreHorarios,
  haySolapeTurnoFijo,
} from "./turnosFijos.logic";

const APERTURA_MIN = 8 * 60; // 08:00, igual que config.horaApertura real
// Mismo instante/convención que reservas.logic.test.ts (ocurrenciasFijasVirtuales):
// 15:00 -03:00 da margen para que "hoy" caiga en 2026-01-07 (miércoles, dia_semana=3)
// sin importar el huso horario de la máquina que corre el test.
const AHORA = new Date("2026-01-07T15:00:00-03:00").getTime();

function crearTurnoFijo(overrides: Partial<TurnoFijoConHorario> = {}): TurnoFijoConHorario {
  return {
    id: "t1",
    titular_id: "titular-1",
    dia_semana: 3,
    nombre: "Fijo Miércoles",
    telefono: "377999",
    horaInicio: "10:00",
    horaFin: "12:00",
    ...overrides,
  };
}

interface ReservaMin {
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

describe("haySolapeTurnoFijo", () => {
  it("mismo día + rango solapado -> true", () => {
    const existentes = [crearTurnoFijo({ horaInicio: "10:00", horaFin: "12:00" })];
    expect(haySolapeTurnoFijo(3, "11:00", "13:00", existentes, APERTURA_MIN)).toBe(true);
  });

  it("rangos adyacentes (el fin de uno == el inicio del otro) -> false", () => {
    const existentes = [crearTurnoFijo({ horaInicio: "10:00", horaFin: "12:00" })];
    expect(haySolapeTurnoFijo(3, "12:00", "13:00", existentes, APERTURA_MIN)).toBe(false);
    expect(haySolapeTurnoFijo(3, "08:00", "10:00", existentes, APERTURA_MIN)).toBe(false);
  });

  it("día distinto -> false, aunque el horario coincida exacto", () => {
    const existentes = [crearTurnoFijo({ dia_semana: 3, horaInicio: "10:00", horaFin: "12:00" })];
    expect(haySolapeTurnoFijo(2, "10:00", "12:00", existentes, APERTURA_MIN)).toBe(false);
  });

  it("cruce de medianoche: turno existente 23:00-01:00 solapa con uno nuevo 00:30-02:00", () => {
    const existentes = [crearTurnoFijo({ horaInicio: "23:00", horaFin: "01:00" })];
    expect(haySolapeTurnoFijo(3, "00:30", "02:00", existentes, APERTURA_MIN)).toBe(true);
  });

  it("sin turnos fijos cargados -> false", () => {
    expect(haySolapeTurnoFijo(3, "10:00", "12:00", [], APERTURA_MIN)).toBe(false);
  });
});

describe("hayHorariosDuplicados", () => {
  it("dos horarios idénticos (mismo día+inicio+fin) -> true", () => {
    expect(
      hayHorariosDuplicados([
        { diaSemana: 2, horaInicio: "20:00", horaFin: "21:30" },
        { diaSemana: 2, horaInicio: "20:00", horaFin: "21:30" },
      ]),
    ).toBe(true);
  });

  it("mismo horario en días distintos -> false (no es un duplicado)", () => {
    expect(
      hayHorariosDuplicados([
        { diaSemana: 2, horaInicio: "20:00", horaFin: "21:30" },
        { diaSemana: 4, horaInicio: "20:00", horaFin: "21:30" },
      ]),
    ).toBe(false);
  });

  it("un solo horario -> false", () => {
    expect(hayHorariosDuplicados([{ diaSemana: 2, horaInicio: "20:00", horaFin: "21:30" }])).toBe(false);
  });

  it("lista vacía -> false", () => {
    expect(hayHorariosDuplicados([])).toBe(false);
  });
});

describe("haySolapeEntreHorarios", () => {
  const aperturaSiempre8 = () => APERTURA_MIN;

  it("dos horarios que se cruzan en el mismo día -> true", () => {
    expect(
      haySolapeEntreHorarios(
        [
          { diaSemana: 2, horaInicio: "20:00", horaFin: "21:30" },
          { diaSemana: 2, horaInicio: "21:00", horaFin: "22:00" },
        ],
        aperturaSiempre8,
      ),
    ).toBe(true);
  });

  it("rangos adyacentes (el fin de uno == el inicio del otro) -> false", () => {
    expect(
      haySolapeEntreHorarios(
        [
          { diaSemana: 2, horaInicio: "20:00", horaFin: "21:00" },
          { diaSemana: 2, horaInicio: "21:00", horaFin: "22:00" },
        ],
        aperturaSiempre8,
      ),
    ).toBe(false);
  });

  it("mismo horario en días distintos -> false", () => {
    expect(
      haySolapeEntreHorarios(
        [
          { diaSemana: 2, horaInicio: "20:00", horaFin: "21:30" },
          { diaSemana: 4, horaInicio: "20:00", horaFin: "21:30" },
        ],
        aperturaSiempre8,
      ),
    ).toBe(false);
  });

  it("tres horarios sin relación entre sí -> false", () => {
    expect(
      haySolapeEntreHorarios(
        [
          { diaSemana: 2, horaInicio: "20:00", horaFin: "21:30" },
          { diaSemana: 4, horaInicio: "22:00", horaFin: "23:30" },
          { diaSemana: 6, horaInicio: "18:30", horaFin: "20:00" },
        ],
        aperturaSiempre8,
      ),
    ).toBe(false);
  });

  it("solape entre el 1er y 3er horario, aunque el 2do no choque con ninguno -> true", () => {
    expect(
      haySolapeEntreHorarios(
        [
          { diaSemana: 2, horaInicio: "20:00", horaFin: "21:30" },
          { diaSemana: 4, horaInicio: "22:00", horaFin: "23:30" },
          { diaSemana: 2, horaInicio: "21:00", horaFin: "22:00" },
        ],
        aperturaSiempre8,
      ),
    ).toBe(true);
  });

  it("día cerrado (apertura null) -> se salta esos horarios, sin lanzar", () => {
    expect(
      haySolapeEntreHorarios(
        [
          { diaSemana: 0, horaInicio: "20:00", horaFin: "21:30" },
          { diaSemana: 0, horaInicio: "20:30", horaFin: "22:00" },
        ],
        () => null,
      ),
    ).toBe(false);
  });

  it("cruce de medianoche: 23:00-01:00 solapa con 00:30-02:00 del mismo día", () => {
    expect(
      haySolapeEntreHorarios(
        [
          { diaSemana: 5, horaInicio: "23:00", horaFin: "01:00" },
          { diaSemana: 5, horaInicio: "00:30", horaFin: "02:00" },
        ],
        aperturaSiempre8,
      ),
    ).toBe(true);
  });
});

describe("buscarChoquesTurnoFijoConReservas", () => {
  function crearReserva(overrides: Partial<ReservaMin> = {}): ReservaMin {
    return { fecha: "2026-01-07", horaInicio: "10:00", horaFin: "11:00", ...overrides };
  }

  // FINAL-F3 (M5): el turno fijo nuevo tiene `creado` ≈ ahora, así que solo
  // las ocurrencias que todavía no empezaron pueden chocar. AHORA_HOY es un
  // instante LOCAL (constructor local de Date) para no depender del huso.
  const AHORA_HOY = new Date(2026, 0, 7, 15, 0).getTime(); // miércoles 07/01 15:00 local

  it("detecta un choque con una reserva de la fecha correcta que cruza el horario propuesto", () => {
    const reservas = [crearReserva({ fecha: "2026-01-07", horaInicio: "20:30", horaFin: "21:30" })];
    const choques = buscarChoquesTurnoFijoConReservas(3, "20:00", "21:00", reservas, APERTURA_MIN, AHORA_HOY, 10);
    expect(choques).toHaveLength(1);
    expect(choques[0].fecha).toBe("2026-01-07");
    expect(choques[0].reserva).toBe(reservas[0]); // devuelve el objeto original intacto
  });

  it("M5: la ocurrencia de HOY que ya empezó no choca (no va a existir), la de la semana siguiente sí", () => {
    const reservas = [
      crearReserva({ fecha: "2026-01-07", horaInicio: "10:30", horaFin: "11:30" }), // hoy, ya empezó (ahora=15:00)
      crearReserva({ fecha: "2026-01-14", horaInicio: "10:30", horaFin: "11:30" }),
    ];
    const choques = buscarChoquesTurnoFijoConReservas(3, "10:00", "11:00", reservas, APERTURA_MIN, AHORA_HOY, 10);
    expect(choques.map((c) => c.fecha)).toEqual(["2026-01-14"]);
  });

  it("M5: la ocurrencia de HOY de madrugada (inicio real mañana 00:30) todavía no empezó: sí puede chocar", () => {
    const reservas = [crearReserva({ fecha: "2026-01-07", horaInicio: "00:30", horaFin: "01:30" })];
    const choques = buscarChoquesTurnoFijoConReservas(3, "00:30", "01:30", reservas, APERTURA_MIN, AHORA_HOY, 10);
    expect(choques.map((c) => c.fecha)).toEqual(["2026-01-07"]);
  });

  it("ignora reservas de un día de semana distinto, aunque el horario coincida", () => {
    // 2026-01-08 es jueves, no miércoles -> nunca se compara contra esa fecha.
    const reservas = [crearReserva({ fecha: "2026-01-08", horaInicio: "10:00", horaFin: "11:00" })];
    const choques = buscarChoquesTurnoFijoConReservas(3, "10:00", "11:00", reservas, APERTURA_MIN, AHORA, 10);
    expect(choques).toHaveLength(0);
  });

  it("ignora reservas de la fecha correcta que no cruzan el horario propuesto", () => {
    const reservas = [crearReserva({ fecha: "2026-01-07", horaInicio: "14:00", horaFin: "15:00" })];
    const choques = buscarChoquesTurnoFijoConReservas(3, "10:00", "11:00", reservas, APERTURA_MIN, AHORA, 10);
    expect(choques).toHaveLength(0);
  });

  it("devuelve un choque por cada fecha afectada dentro del horizonte", () => {
    const reservas = [
      crearReserva({ fecha: "2026-01-07", horaInicio: "20:30", horaFin: "21:30" }),
      crearReserva({ fecha: "2026-01-14", horaInicio: "20:30", horaFin: "21:30" }),
    ];
    const choques = buscarChoquesTurnoFijoConReservas(3, "20:00", "21:00", reservas, APERTURA_MIN, AHORA_HOY, 10);
    expect(choques.map((c) => c.fecha)).toEqual(["2026-01-07", "2026-01-14"]);
  });

  it("respeta el horizonte configurado: un choque más allá del horizonte no se reporta", () => {
    const reservas = [crearReserva({ fecha: "2026-01-14", horaInicio: "10:30", horaFin: "11:30" })]; // 7 días después
    const conHorizonteChico = buscarChoquesTurnoFijoConReservas(3, "10:00", "11:00", reservas, APERTURA_MIN, AHORA, 3);
    expect(conHorizonteChico).toHaveLength(0);

    const conHorizonteAmplio = buscarChoquesTurnoFijoConReservas(
      3,
      "10:00",
      "11:00",
      reservas,
      APERTURA_MIN,
      AHORA,
      10,
    );
    expect(conHorizonteAmplio).toHaveLength(1);
  });
});

describe("agruparPorTitular", () => {
  it("un titular con un horario -> un grupo con un horario", () => {
    const grupos = agruparPorTitular([crearTurnoFijo({ id: "t1", titular_id: "juan", nombre: "Juan", telefono: "1" })]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ titularId: "juan", nombre: "Juan", telefono: "1" });
    expect(grupos[0].horarios).toHaveLength(1);
  });

  it("un titular con varios horarios -> un solo grupo, horarios ordenados por día y hora", () => {
    const grupos = agruparPorTitular([
      crearTurnoFijo({ id: "t2", titular_id: "juan", nombre: "Juan", dia_semana: 4, horaInicio: "22:00" }),
      crearTurnoFijo({ id: "t1", titular_id: "juan", nombre: "Juan", dia_semana: 2, horaInicio: "20:00" }),
      crearTurnoFijo({ id: "t3", titular_id: "juan", nombre: "Juan", dia_semana: 2, horaInicio: "08:00" }),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].horarios.map((h) => h.id)).toEqual(["t3", "t1", "t2"]);
  });

  it("varios titulares -> varios grupos, ordenados por nombre", () => {
    const grupos = agruparPorTitular([
      crearTurnoFijo({ id: "t1", titular_id: "pedro", nombre: "Pedro" }),
      crearTurnoFijo({ id: "t2", titular_id: "ana", nombre: "Ana" }),
    ]);
    expect(grupos.map((g) => g.nombre)).toEqual(["Ana", "Pedro"]);
  });

  it("dos titulares distintos con el mismo teléfono quedan en grupos separados (sin fusionar)", () => {
    const grupos = agruparPorTitular([
      crearTurnoFijo({ id: "t1", titular_id: "juan", nombre: "Juan", telefono: "1155667788" }),
      crearTurnoFijo({ id: "t2", titular_id: "pedro", nombre: "Pedro", telefono: "1155667788" }),
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.titularId).sort()).toEqual(["juan", "pedro"]);
  });

  it("sin turnos fijos -> sin grupos", () => {
    expect(agruparPorTitular([])).toEqual([]);
  });
});

describe("calcularFechaInicioReal", () => {
  it("sin fechas excluidas: devuelve hoy mismo si su día de semana coincide", () => {
    expect(calcularFechaInicioReal(3, [], AHORA, 10)).toBe("2026-01-07");
  });

  it("con hoy excluido: devuelve la próxima fecha del mismo día de semana", () => {
    expect(calcularFechaInicioReal(3, ["2026-01-07"], AHORA, 10)).toBe("2026-01-14");
  });

  it("todas las fechas del horizonte excluidas o inalcanzables: devuelve null", () => {
    // El próximo miércoles disponible (2026-01-14) queda fuera de un horizonte de 5 días.
    expect(calcularFechaInicioReal(3, ["2026-01-07"], AHORA, 5)).toBeNull();
  });

  // FINAL-F3 (M5) — con `horario`, la ocurrencia de hoy solo cuenta si todavía
  // no empezó (el turno se crea "ahora"). Instantes locales (sin depender del huso).
  describe("con horario (M5)", () => {
    const AHORA_HOY = new Date(2026, 0, 7, 20, 0).getTime(); // miércoles 07/01 20:00 local

    it("hoy ya empezó (18:00 con ahora=20:00): arranca la semana que viene", () => {
      expect(calcularFechaInicioReal(3, [], AHORA_HOY, 10, { horaInicio: "18:00", aperturaMin: APERTURA_MIN })).toBe("2026-01-14");
    });

    it("hoy todavía no empezó (21:00 con ahora=20:00): arranca hoy", () => {
      expect(calcularFechaInicioReal(3, [], AHORA_HOY, 10, { horaInicio: "21:00", aperturaMin: APERTURA_MIN })).toBe("2026-01-07");
    });

    it("cruce de medianoche: 00:30 del día operativo de hoy empieza mañana de madrugada: arranca hoy", () => {
      expect(calcularFechaInicioReal(3, [], AHORA_HOY, 10, { horaInicio: "00:30", aperturaMin: APERTURA_MIN })).toBe("2026-01-07");
    });

    it("combina con fechas excluidas: hoy ya empezó y la semana siguiente está excluida -> la otra", () => {
      expect(calcularFechaInicioReal(3, ["2026-01-14"], AHORA_HOY, 20, { horaInicio: "18:00", aperturaMin: APERTURA_MIN })).toBe("2026-01-21");
    });
  });
});
