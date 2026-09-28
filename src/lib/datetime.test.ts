import { describe, expect, it } from "vitest";
import {
  calcularCierreExtendido,
  esPasado,
  esReservaVigente,
  extenderReserva,
  finReservaDate,
  generarOpcionesHorario,
  generarProximosDias,
  horaToMinutos,
  inicioReservaDate,
  minutosToHora,
  ocurrenciaEsPosteriorACreacion,
  opcionesFinDesde,
} from "./datetime";

const APERTURA = horaToMinutos("08:00"); // 480

describe("horaToMinutos", () => {
  it("convierte horarios simples", () => {
    expect(horaToMinutos("08:00")).toBe(480);
    expect(horaToMinutos("23:30")).toBe(1410);
    expect(horaToMinutos("00:00")).toBe(0);
  });
});

describe("minutosToHora", () => {
  it("convierte minutos a HH:MM", () => {
    expect(minutosToHora(480)).toBe("08:00");
  });

  it("normaliza valores negativos (wraparound hacia el día anterior)", () => {
    expect(minutosToHora(-30)).toBe("23:30");
  });

  it("normaliza valores que superan las 24hs (wraparound hacia el día siguiente)", () => {
    expect(minutosToHora(1500)).toBe("01:00");
  });
});

describe("extenderReserva", () => {
  it("caso normal, sin cruce de medianoche", () => {
    expect(extenderReserva("10:00", "11:00", APERTURA)).toEqual({ ini: 600, fin: 660 });
  });

  it("cruce de medianoche (23:00 -> 01:00)", () => {
    expect(extenderReserva("23:00", "01:00", APERTURA)).toEqual({ ini: 1380, fin: 1500 });
  });

  it("horario de madrugada, antes de la apertura (00:30 -> 02:00)", () => {
    expect(extenderReserva("00:30", "02:00", APERTURA)).toEqual({ ini: 1470, fin: 1560 });
  });
});

describe("calcularCierreExtendido", () => {
  it("apertura 08:00 / cierre 23:00: no cruza medianoche, sin extensión", () => {
    expect(calcularCierreExtendido(480, 1380)).toBe(1380);
  });

  it("apertura 08:00 / cierre 02:00: cruza medianoche, se extiende al día siguiente", () => {
    expect(calcularCierreExtendido(480, 120)).toBe(120 + 1440);
  });

  it("cierre == apertura: preserva la semántica legacy de <= (también se extiende)", () => {
    expect(calcularCierreExtendido(480, 480)).toBe(480 + 1440);
  });
});

describe("generarOpcionesHorario", () => {
  it("apertura 08:00 / cierre 23:00: sin cruce de medianoche, pasos de 30min inclusive en ambos extremos", () => {
    const out = generarOpcionesHorario("08:00", "23:00");
    expect(out[0]).toBe("08:00");
    expect(out[out.length - 1]).toBe("23:00");
    expect(out).toContain("08:30");
    expect(out).toHaveLength(31); // (23:00-08:00)*2 + 1
  });

  it("apertura 08:00 / cierre 01:00: cruza medianoche, incluye horas de madrugada extendidas", () => {
    const out = generarOpcionesHorario("08:00", "01:00");
    expect(out[0]).toBe("08:00");
    expect(out[out.length - 1]).toBe("01:00");
    expect(out).toContain("00:30");
  });
});

describe("opcionesFinDesde", () => {
  it("sin horaInicio: devuelve vacío", () => {
    expect(opcionesFinDesde("", "08:00", "23:00")).toEqual([]);
  });

  it("offset por defecto (60min): la primera opción es inicio+60, no inicio+30", () => {
    const out = opcionesFinDesde("10:00", "08:00", "23:00");
    expect(out[0]).toBe("11:00");
  });

  it("offset explícito de 30min (Bloqueos): la primera opción es inicio+30", () => {
    const out = opcionesFinDesde("10:00", "08:00", "23:00", 30);
    expect(out[0]).toBe("10:30");
  });

  it("no pasa del cierre extendido", () => {
    const out = opcionesFinDesde("22:30", "08:00", "23:00", 30);
    expect(out).toEqual(["23:00"]);
  });

  it("cruce de medianoche: horaInicio de madrugada (antes de apertura) se extiende igual que extenderReserva", () => {
    const out = opcionesFinDesde("00:00", "08:00", "01:00", 30);
    // 00:00 se extiende a 24:00 (1440); +30min = 00:30 del día siguiente (1470),
    // hasta el cierre extendido (01:00 -> 25:00 = 1500).
    expect(out[0]).toBe("00:30");
    expect(out[out.length - 1]).toBe("01:00");
  });

  // C5.1 — maxOffsetMin (turnos fijos ya no quedan sin techo de duración).
  it("maxOffsetMin explícito: no pasa de inicio+max aunque el cierre esté más lejos", () => {
    const out = opcionesFinDesde("10:00", "08:00", "23:00", 60, 180);
    expect(out[0]).toBe("11:00");
    expect(out[out.length - 1]).toBe("13:00");
  });

  it("maxOffsetMin explícito: si el cierre llega antes que el máximo, gana el cierre", () => {
    const out = opcionesFinDesde("22:00", "08:00", "23:00", 60, 180);
    expect(out[out.length - 1]).toBe("23:00");
  });

  it("maxOffsetMin con cruce de medianoche: el techo se calcula en minutos extendidos, no sobre el string ya formateado", () => {
    const out = opcionesFinDesde("23:00", "08:00", "02:00", 30, 90);
    // 23:00 = 1380min (ya por encima de la apertura, sin extender); +90min de
    // techo = 1470 (00:30 del día siguiente) — no debe incluir "01:00", que
    // en minutos reales (1440+60=1500) superaría ese techo aunque, comparado
    // como string, "01:00" parezca "antes" que "00:30".
    expect(out).toEqual(["23:30", "00:00", "00:30"]);
  });
});

describe("finReservaDate", () => {
  it("bug histórico: 23:00 -> 01:00 del 2026-01-01 termina el 2026-01-02, no el 2026-01-01", () => {
    const fin = finReservaDate({ fecha: "2026-01-01", horaInicio: "23:00", horaFin: "01:00" }, APERTURA);
    // Comparación por componentes locales (no ISO/UTC) para no depender del timezone de la máquina.
    expect(fin.getFullYear()).toBe(2026);
    expect(fin.getMonth()).toBe(0); // enero
    expect(fin.getDate()).toBe(2);
    expect(fin.getHours()).toBe(1);
    expect(fin.getMinutes()).toBe(0);
  });

  it("turno de madrugada (00:30 -> 02:00) también corre al día siguiente por completo", () => {
    const fin = finReservaDate({ fecha: "2026-01-01", horaInicio: "00:30", horaFin: "02:00" }, APERTURA);
    expect(fin.getFullYear()).toBe(2026);
    expect(fin.getMonth()).toBe(0);
    expect(fin.getDate()).toBe(2);
    expect(fin.getHours()).toBe(2);
    expect(fin.getMinutes()).toBe(0);
  });

  it("caso normal, sin cruce, no corre de día", () => {
    const fin = finReservaDate({ fecha: "2026-01-01", horaInicio: "10:00", horaFin: "11:00" }, APERTURA);
    expect(fin.getDate()).toBe(1);
    expect(fin.getHours()).toBe(11);
  });
});

describe("inicioReservaDate", () => {
  it("bug histórico: 23:00 del 2026-01-01 arranca ese mismo día, no el siguiente", () => {
    const inicio = inicioReservaDate({ fecha: "2026-01-01", horaInicio: "23:00", horaFin: "01:00" }, APERTURA);
    expect(inicio.getFullYear()).toBe(2026);
    expect(inicio.getMonth()).toBe(0);
    expect(inicio.getDate()).toBe(1);
    expect(inicio.getHours()).toBe(23);
    expect(inicio.getMinutes()).toBe(0);
  });

  it("turno de madrugada (00:30, antes de la apertura) arranca el día calendario SIGUIENTE al de `fecha`", () => {
    const inicio = inicioReservaDate({ fecha: "2026-01-01", horaInicio: "00:30", horaFin: "02:00" }, APERTURA);
    expect(inicio.getDate()).toBe(2);
    expect(inicio.getHours()).toBe(0);
    expect(inicio.getMinutes()).toBe(30);
  });

  it("caso normal, sin cruce, arranca el mismo día", () => {
    const inicio = inicioReservaDate({ fecha: "2026-01-01", horaInicio: "10:00", horaFin: "11:00" }, APERTURA);
    expect(inicio.getDate()).toBe(1);
    expect(inicio.getHours()).toBe(10);
  });
});

describe("esPasado", () => {
  const reserva = { fecha: "2026-01-01", horaInicio: "23:00", horaFin: "01:00" };
  const finMs = finReservaDate(reserva, APERTURA).getTime();

  it("es false justo antes del fin", () => {
    expect(esPasado(reserva, APERTURA, finMs - 1)).toBe(false);
  });

  it("es true justo después del fin", () => {
    expect(esPasado(reserva, APERTURA, finMs + 1)).toBe(true);
  });

  it("es true en el instante exacto (la comparación real es <=, no <)", () => {
    expect(esPasado(reserva, APERTURA, finMs)).toBe(true);
  });
});

describe("esReservaVigente", () => {
  const ahora = Date.now();

  it("una reserva bloqueada siempre es vigente, sin importar la antigüedad", () => {
    expect(
      esReservaVigente({ bloqueado: true, confirmada: false, creado: new Date(ahora - 60 * 60 * 1000).toISOString() }, { ahora }),
    ).toBe(true);
  });

  it("una reserva confirmada siempre es vigente, sin importar la antigüedad", () => {
    expect(
      esReservaVigente({ bloqueado: false, confirmada: true, creado: new Date(ahora - 60 * 60 * 1000).toISOString() }, { ahora }),
    ).toBe(true);
  });

  it("pendiente (ni bloqueada ni confirmada) hace 10 min es vigente (bajo el umbral de 15)", () => {
    const creado = new Date(ahora - 10 * 60 * 1000).toISOString();
    expect(esReservaVigente({ bloqueado: false, confirmada: false, creado }, { ahora })).toBe(true);
  });

  it("pendiente hace 20 min ya no es vigente (superó el umbral de 15)", () => {
    const creado = new Date(ahora - 20 * 60 * 1000).toISOString();
    expect(esReservaVigente({ bloqueado: false, confirmada: false, creado }, { ahora })).toBe(false);
  });

  it("pendiente a exactamente 15 min ya NO es vigente (la comparación real es <, no <=)", () => {
    const creado = new Date(ahora - 15 * 60 * 1000).toISOString();
    expect(esReservaVigente({ bloqueado: false, confirmada: false, creado }, { ahora })).toBe(false);
  });

  it("respeta un minVencimientoMs custom", () => {
    const creado = new Date(ahora - 5 * 60 * 1000).toISOString();
    expect(
      esReservaVigente({ bloqueado: false, confirmada: false, creado }, { ahora, minVencimientoMs: 60 * 1000 }),
    ).toBe(false);
  });
});

describe("generarProximosDias", () => {
  it("genera exactamente `cantidad` días", () => {
    expect(generarProximosDias(14, new Date(2026, 5, 1)).length).toBe(14);
  });

  it("empieza desde la fecha base, truncando la hora a medianoche", () => {
    const [primero] = generarProximosDias(5, new Date(2026, 5, 1, 15, 30));
    expect(primero.iso).toBe("2026-06-01");
  });

  it("cruza fin de mes correctamente", () => {
    const out = generarProximosDias(3, new Date(2026, 5, 29)); // 29 jun
    expect(out.map((d) => d.iso)).toEqual(["2026-06-29", "2026-06-30", "2026-07-01"]);
  });

  it("cruza fin de año correctamente", () => {
    const out = generarProximosDias(3, new Date(2026, 11, 30)); // 30 dic
    expect(out.map((d) => d.iso)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("mantiene el formato ISO (YYYY-MM-DD) en cada elemento", () => {
    for (const d of generarProximosDias(4, new Date(2026, 0, 5))) {
      expect(d.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("día de semana y mes abreviados correctos contra un caso conocido", () => {
    // 2026-06-01 es lunes (mismo dato ya usado en reservations.logic.test.ts)
    const [dia] = generarProximosDias(1, new Date(2026, 5, 1));
    expect(dia).toEqual({ iso: "2026-06-01", diaSemana: "LUN", diaNum: 1, mes: "JUN" });
  });
});

// FINAL-F3 (M5) — instante_inicio_real(ocurrencia) >= turnos_fijos.creado, por
// INSTANTE (no por fecha). Todos los instantes se construyen con el constructor
// local de Date (mismo huso que usa inicioReservaDate), así los tests valen en
// cualquier huso de la máquina que los corre.
describe("ocurrenciaEsPosteriorACreacion", () => {
  const L = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).toISOString();

  it("fecha anterior a la creación: no", () => {
    // fijo de martes creado el viernes 25/09 20:00 -> el martes 22/09 no existía
    expect(ocurrenciaEsPosteriorACreacion("2026-09-22", "18:00", APERTURA, L(2026, 9, 25, 20, 0))).toBe(false);
  });

  it("mismo día, horario ya terminado antes de la creación: no", () => {
    expect(ocurrenciaEsPosteriorACreacion("2026-09-25", "18:00", APERTURA, L(2026, 9, 25, 20, 0))).toBe(false);
  });

  it("mismo día, horario ya empezado (creado a mitad del turno): no", () => {
    expect(ocurrenciaEsPosteriorACreacion("2026-09-25", "18:00", APERTURA, L(2026, 9, 25, 18, 30))).toBe(false);
  });

  it("mismo día, horario futuro respecto de la creación: sí", () => {
    expect(ocurrenciaEsPosteriorACreacion("2026-09-25", "21:00", APERTURA, L(2026, 9, 25, 20, 0))).toBe(true);
  });

  it("creado EXACTAMENTE al instante de inicio: sí (>=)", () => {
    expect(ocurrenciaEsPosteriorACreacion("2026-09-25", "18:00", APERTURA, L(2026, 9, 25, 18, 0))).toBe(true);
  });

  it("siguiente semana: sí", () => {
    expect(ocurrenciaEsPosteriorACreacion("2026-09-29", "18:00", APERTURA, L(2026, 9, 25, 20, 0))).toBe(true);
  });

  it("cruce de medianoche: la madrugada pertenece al día calendario SIGUIENTE (con la apertura de esa fecha)", () => {
    // día operativo 25/09, 00:30 < apertura 08:00 => inicio real 26/09 00:30
    expect(ocurrenciaEsPosteriorACreacion("2026-09-25", "00:30", APERTURA, L(2026, 9, 25, 23, 0))).toBe(true);
    expect(ocurrenciaEsPosteriorACreacion("2026-09-25", "00:30", APERTURA, L(2026, 9, 26, 0, 45))).toBe(false);
  });

  it("no compara por fecha: creado el mismo día operativo pero ANTES del inicio real de madrugada: sí", () => {
    expect(ocurrenciaEsPosteriorACreacion("2026-09-25", "00:30", APERTURA, L(2026, 9, 25, 12, 0))).toBe(true);
  });

  it("horario que cruza medianoche por hora_fin: solo importa el inicio", () => {
    expect(ocurrenciaEsPosteriorACreacion("2026-09-25", "23:00", APERTURA, L(2026, 9, 25, 22, 59))).toBe(true);
    expect(ocurrenciaEsPosteriorACreacion("2026-09-25", "23:00", APERTURA, L(2026, 9, 25, 23, 15))).toBe(false);
  });

  it("sin apertura conocida (null) no corre el día: degrada seguro, igual que inicioReservaDate", () => {
    expect(ocurrenciaEsPosteriorACreacion("2026-09-25", "00:30", null, L(2026, 9, 25, 12, 0))).toBe(false);
  });

  it("creado ausente, nulo o ilegible: sin cota inferior (true)", () => {
    expect(ocurrenciaEsPosteriorACreacion("2026-09-22", "18:00", APERTURA, null)).toBe(true);
    expect(ocurrenciaEsPosteriorACreacion("2026-09-22", "18:00", APERTURA, undefined)).toBe(true);
    expect(ocurrenciaEsPosteriorACreacion("2026-09-22", "18:00", APERTURA, "no-es-fecha")).toBe(true);
  });
});
