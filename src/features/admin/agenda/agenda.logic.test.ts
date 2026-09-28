import { describe, expect, it } from "vitest";
import {
  calcularCelda,
  calcularRangoGrillaSemana,
  construirDiasGrilla,
  construirFilasGrilla,
  construirLinkWhatsappCancelacion,
  construirLinkWhatsappReserva,
  esFinDeBloque,
  etiquetaSemana,
  formatearBadgeFecha,
  obtenerLunesOffset,
  procesarReservasGrilla,
  telefonoParaWhatsapp,
  type CeldaGrilla,
  type ExcepcionTurnoFijo,
  type ReservaConHorario,
  type TurnoFijoConHorario,
} from "./agenda.logic";
import { formatearISO } from "../../../lib/datetime";

const APERTURA_MIN = 8 * 60; // 08:00

function crearReserva(overrides: Partial<ReservaConHorario> = {}): ReservaConHorario {
  return {
    id: "r1",
    fecha: "2026-06-01",
    hora_inicio: "10:00:00",
    hora_fin: "11:00:00",
    horaInicio: "10:00",
    horaFin: "11:00",
    nombre: "Juan",
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

function crearTurnoFijo(overrides: Partial<TurnoFijoConHorario> = {}): TurnoFijoConHorario {
  return {
    id: "t1",
    titular_id: "titular-1",
    dia_semana: 1, // lunes
    nombre: "Fijo Lunes",
    telefono: "3772222222",
    horaInicio: "18:00",
    horaFin: "19:00",
    ...overrides,
  };
}

function crearExcepcion(overrides: Partial<ExcepcionTurnoFijo> = {}): ExcepcionTurnoFijo {
  return {
    id: "e1",
    turno_fijo_id: "t1",
    fecha: "2026-06-01",
    creado: new Date().toISOString(),
    ...overrides,
  };
}

describe("calcularCelda", () => {
  it("sin datos: libre", () => {
    expect(calcularCelda("2026-06-01", "10:00", [], [], [], APERTURA_MIN)).toEqual({ estado: "libre" });
  });

  it("una reserva no bloqueada cubre el slot: estado reserva con la reserva completa", () => {
    const r = crearReserva();
    const celda = calcularCelda("2026-06-01", "10:00", [r], [], [], APERTURA_MIN);
    expect(celda).toEqual({ estado: "reserva", reserva: r });
  });

  it("una reserva bloqueada cubre el slot: estado bloqueado", () => {
    const r = crearReserva({ bloqueado: true, nombre: "", telefono: "" });
    const celda = calcularCelda("2026-06-01", "10:00", [r], [], [], APERTURA_MIN);
    expect(celda).toEqual({ estado: "bloqueado", reserva: r });
  });

  it("extremo inicial inclusivo: el slot igual a hora_inicio pertenece al bloque", () => {
    const r = crearReserva({ horaInicio: "10:00", horaFin: "11:00" });
    const celda = calcularCelda("2026-06-01", "10:00", [r], [], [], APERTURA_MIN);
    expect(celda.estado).toBe("reserva");
  });

  it("extremo final exclusivo: el slot igual a hora_fin ya NO pertenece al bloque", () => {
    const r = crearReserva({ horaInicio: "10:00", horaFin: "11:00" });
    const celda = calcularCelda("2026-06-01", "11:00", [r], [], [], APERTURA_MIN);
    expect(celda).toEqual({ estado: "libre" });
  });

  it("el slot inmediatamente anterior a hora_fin (30 min antes) sigue perteneciendo al bloque", () => {
    const r = crearReserva({ horaInicio: "10:00", horaFin: "11:00" });
    const celda = calcularCelda("2026-06-01", "10:30", [r], [], [], APERTURA_MIN);
    expect(celda.estado).toBe("reserva");
  });

  it("una reserva de otra fecha no afecta la celda", () => {
    const r = crearReserva({ fecha: "2026-06-02" });
    const celda = calcularCelda("2026-06-01", "10:00", [r], [], [], APERTURA_MIN);
    expect(celda).toEqual({ estado: "libre" });
  });

  it("turno fijo del día de la semana correcto, sin reserva real: estado fijo", () => {
    // 2026-06-01 es lunes (dia_semana 1)
    const t = crearTurnoFijo({ dia_semana: 1, horaInicio: "18:00", horaFin: "19:00" });
    const celda = calcularCelda("2026-06-01", "18:00", [], [t], [], APERTURA_MIN);
    expect(celda).toEqual({ estado: "fijo", turnoFijo: t, fecha: "2026-06-01" });
  });

  it("turno fijo de otro día de la semana no aparece", () => {
    // 2026-06-02 es martes, turno es dia_semana 1 (lunes)
    const t = crearTurnoFijo({ dia_semana: 1, horaInicio: "18:00", horaFin: "19:00" });
    const celda = calcularCelda("2026-06-02", "18:00", [], [t], [], APERTURA_MIN);
    expect(celda).toEqual({ estado: "libre" });
  });

  it("prioridad: una reserva real materializada sobre el mismo slot de un turno fijo gana sobre el turno fijo", () => {
    const t = crearTurnoFijo({ id: "t1", dia_semana: 1, horaInicio: "18:00", horaFin: "19:00" });
    const r = crearReserva({
      id: "r-materializada",
      fecha: "2026-06-01",
      horaInicio: "18:00",
      horaFin: "19:00",
      turno_fijo_id: "t1",
    });
    const celda = calcularCelda("2026-06-01", "18:00", [r], [t], [], APERTURA_MIN);
    expect(celda).toEqual({ estado: "reserva", reserva: r });
  });

  it("excepción puntual: el turno fijo no aparece esa fecha exacta...", () => {
    const t = crearTurnoFijo({ id: "t1", dia_semana: 1, horaInicio: "18:00", horaFin: "19:00" });
    const excepcion = crearExcepcion({ turno_fijo_id: "t1", fecha: "2026-06-01" });
    const celda = calcularCelda("2026-06-01", "18:00", [], [t], [excepcion], APERTURA_MIN);
    expect(celda).toEqual({ estado: "libre" });
  });

  it("...pero sí aparece en otra semana donde no hay excepción cargada para esa fecha", () => {
    const t = crearTurnoFijo({ id: "t1", dia_semana: 1, horaInicio: "18:00", horaFin: "19:00" });
    const excepcion = crearExcepcion({ turno_fijo_id: "t1", fecha: "2026-06-01" });
    // 2026-06-08 también es lunes, pero la excepción es solo para 2026-06-01.
    const celda = calcularCelda("2026-06-08", "18:00", [], [t], [excepcion], APERTURA_MIN);
    expect(celda).toEqual({ estado: "fijo", turnoFijo: t, fecha: "2026-06-08" });
  });

  it("datos inconsistentes (dos reservas superpuestas el mismo slot): gana la primera del array, igual que el legacy", () => {
    const primera = crearReserva({ id: "primera", horaInicio: "10:00", horaFin: "11:00" });
    const segunda = crearReserva({ id: "segunda", horaInicio: "10:00", horaFin: "11:00" });
    const celda = calcularCelda("2026-06-01", "10:00", [primera, segunda], [], [], APERTURA_MIN);
    expect(celda).toEqual({ estado: "reserva", reserva: primera });
  });

  it("cruce de medianoche: una reserva 23:00-01:00 cubre el slot 00:30 en la columna de SU día", () => {
    const r = crearReserva({ fecha: "2026-06-01", horaInicio: "23:00", horaFin: "01:00" });
    const celda = calcularCelda("2026-06-01", "00:30", [r], [], [], APERTURA_MIN);
    expect(celda).toEqual({ estado: "reserva", reserva: r });
  });

  it("cruce de medianoche: un turno fijo 23:00-01:00 cubre el slot 00:30 en la columna de SU día", () => {
    // 2026-06-01 es lunes (dia_semana 1) — el turno fijo se ubica por el día en que EMPIEZA.
    const t = crearTurnoFijo({ dia_semana: 1, horaInicio: "23:00", horaFin: "01:00" });
    const celda = calcularCelda("2026-06-01", "00:30", [], [t], [], APERTURA_MIN);
    expect(celda).toEqual({ estado: "fijo", turnoFijo: t, fecha: "2026-06-01" });
  });

  it("slot exactamente en el límite de apertura (00:00, antes de aperturaMin) se evalúa en el día extendido", () => {
    const r = crearReserva({ fecha: "2026-06-01", horaInicio: "23:30", horaFin: "01:30" });
    const celda = calcularCelda("2026-06-01", "00:00", [r], [], [], APERTURA_MIN);
    expect(celda.estado).toBe("reserva");
  });
});

// AUDIT-DAY (punto 5) — calcularRangoGrillaSemana usa un único aperturaMin
// GLOBAL (el mínimo de los 7 días visibles) para TODA la semana, y AgendaView
// pasa ese mismo valor global a calcularCelda para cada columna/día (en vez
// de la apertura real de cada día). Con horarios muy distintos entre días,
// un turno fijo obsoleto (creado cuando su día abría más temprano) puede
// quedar mal ubicado en la grilla.
describe("calcularCelda con aperturaMin global de la semana vs. apertura real del día (AUDIT-DAY #5)", () => {
  // Semana: lunes abre 08:00 (el más temprano -> define el aperturaMin
  // GLOBAL = 480), martes abre 16:00-02:00 (dia_semana 2, cruza medianoche).
  const APERTURA_GLOBAL = 8 * 60; // 480 — lo que calcularRangoGrillaSemana/AgendaView usan hoy para TODAS las columnas
  const APERTURA_MARTES = 16 * 60; // 960 — la apertura real y vigente de ESE día

  it("sanity check: calcularRangoGrillaSemana efectivamente colapsa a la apertura más temprana de la semana (lunes 08:00), no a la de cada día", () => {
    const franjas = [
      { cerrado: false, horaApertura: "08:00", horaCierre: "23:00" }, // lunes
      { cerrado: false, horaApertura: "16:00", horaCierre: "02:00" }, // martes
    ];
    expect(calcularRangoGrillaSemana(franjas)?.aperturaMin).toBe(APERTURA_GLOBAL);
  });

  it("BUG: un turno fijo obsoleto de martes (creado cuando abría antes de las 16:00) aparece ocupando un slot de la noche que ya no le corresponde, si se usa el aperturaMin GLOBAL de la semana", () => {
    // Turno fijo histórico de martes 09:00-01:00, de cuando ese día todavía
    // abría temprano como el lunes. Hoy martes abre recién a las 16:00, así
    // que este turno (por debajo de la apertura real de SU día) debería
    // interpretarse corrido al día siguiente — igual que ya hace
    // reservas.logic.ts con las ocurrencias virtuales de turno fijo por
    // debajo de la apertura vigente — y por lo tanto NO debería aparecer a
    // las 23:00 de ese martes.
    const turnoObsoleto = crearTurnoFijo({ id: "tf-obsoleto", dia_semana: 2, horaInicio: "09:00", horaFin: "01:00" });

    // Con la apertura REAL de martes (960): el turno se corre entero al día
    // siguiente (09:00-01:00 del día extendido), así que las 23:00 de ese
    // martes quedan libres.
    const celdaCorrecta = calcularCelda("2026-06-02", "23:00", [], [turnoObsoleto], [], APERTURA_MARTES);
    expect(celdaCorrecta).toEqual({ estado: "libre" });

    // Con el aperturaMin GLOBAL de la semana (480, heredado del lunes) —
    // que es lo que AgendaView.tsx realmente pasa hoy a CADA columna vía
    // rangoGrilla.aperturaMin (ver AgendaView.tsx:375/393) — el mismo turno
    // NO se corre, y termina "ocupando" las 23:00 del martes: una fila que,
    // según la apertura real y vigente de ese día, debería estar libre.
    const celdaConAperturaGlobal = calcularCelda("2026-06-02", "23:00", [], [turnoObsoleto], [], APERTURA_GLOBAL);
    expect(celdaConAperturaGlobal).toEqual({
      estado: "fijo",
      turnoFijo: turnoObsoleto,
      fecha: "2026-06-02",
    });
  });
});

// FINAL-F3 (M5) — las ocurrencias virtuales de un turno fijo no se proyectan
// antes de que el turno exista: instante_inicio_real(ocurrencia) >= creado.
// 2026-09-25 es viernes; 22/09 y 29/09 son martes. Instantes con el constructor
// local de Date (mismo huso que usa el cálculo) => vale en cualquier huso.
describe("calcularCelda — no proyecta ocurrencias anteriores a la creación del turno fijo (M5)", () => {
  const L = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).toISOString();
  const creadoViernes2000 = L(2026, 9, 25, 20, 0);

  it("fecha anterior a la creación: no aparece (martes 22/09 con el fijo creado el viernes 25/09)", () => {
    const t = crearTurnoFijo({ dia_semana: 2, horaInicio: "18:00", horaFin: "19:00", creado: creadoViernes2000 });
    expect(calcularCelda("2026-09-22", "18:00", [], [t], [], APERTURA_MIN)).toEqual({ estado: "libre" });
    expect(calcularCelda("2026-09-22", "18:30", [], [t], [], APERTURA_MIN)).toEqual({ estado: "libre" });
  });

  it("siguiente semana: aparece desde la primera ocurrencia posterior a la creación (martes 29/09)", () => {
    const t = crearTurnoFijo({ dia_semana: 2, horaInicio: "18:00", horaFin: "19:00", creado: creadoViernes2000 });
    expect(calcularCelda("2026-09-29", "18:00", [], [t], [], APERTURA_MIN)).toEqual({ estado: "fijo", turnoFijo: t, fecha: "2026-09-29" });
  });

  it("mismo día, horario terminado antes de la creación (creado 20:00, turno 18:00-19:00): no aparece", () => {
    const t = crearTurnoFijo({ dia_semana: 5, horaInicio: "18:00", horaFin: "19:00", creado: creadoViernes2000 });
    expect(calcularCelda("2026-09-25", "18:00", [], [t], [], APERTURA_MIN)).toEqual({ estado: "libre" });
    expect(calcularCelda("2026-09-25", "18:30", [], [t], [], APERTURA_MIN)).toEqual({ estado: "libre" });
  });

  it("mismo día, horario futuro respecto de la creación (creado 20:00, turno 21:00-22:00): aparece en todas sus filas", () => {
    const t = crearTurnoFijo({ dia_semana: 5, horaInicio: "21:00", horaFin: "22:00", creado: creadoViernes2000 });
    expect(calcularCelda("2026-09-25", "21:00", [], [t], [], APERTURA_MIN)).toEqual({ estado: "fijo", turnoFijo: t, fecha: "2026-09-25" });
    expect(calcularCelda("2026-09-25", "21:30", [], [t], [], APERTURA_MIN)).toEqual({ estado: "fijo", turnoFijo: t, fecha: "2026-09-25" });
  });

  it("mismo día, creado a mitad del turno: no aparece (ni siquiera la parte que todavía no pasó)", () => {
    const t = crearTurnoFijo({ dia_semana: 5, horaInicio: "18:00", horaFin: "19:30", creado: L(2026, 9, 25, 18, 30) });
    expect(calcularCelda("2026-09-25", "19:00", [], [t], [], APERTURA_MIN)).toEqual({ estado: "libre" });
  });

  it("creado EXACTAMENTE al inicio del turno: aparece (>=)", () => {
    const t = crearTurnoFijo({ dia_semana: 5, horaInicio: "18:00", horaFin: "19:00", creado: L(2026, 9, 25, 18, 0) });
    expect(calcularCelda("2026-09-25", "18:00", [], [t], [], APERTURA_MIN).estado).toBe("fijo");
  });

  it("cruce de medianoche: turno de madrugada (00:30-01:30 del día operativo 25/09, inicio real 26/09 00:30)", () => {
    const antes = crearTurnoFijo({ dia_semana: 5, horaInicio: "00:30", horaFin: "01:30", creado: L(2026, 9, 25, 23, 0) });
    // creado el mismo día calendario 25/09 pero ANTES del inicio real (26/09 00:30): aparece — no se filtra por fecha
    expect(calcularCelda("2026-09-25", "00:30", [], [antes], [], APERTURA_MIN).estado).toBe("fijo");
    const despues = crearTurnoFijo({ dia_semana: 5, horaInicio: "00:30", horaFin: "01:30", creado: L(2026, 9, 26, 0, 45) });
    expect(calcularCelda("2026-09-25", "00:30", [], [despues], [], APERTURA_MIN)).toEqual({ estado: "libre" });
  });

  it("cruce de medianoche por hora_fin (23:00-00:30): solo cuenta el inicio", () => {
    const t = crearTurnoFijo({ dia_semana: 5, horaInicio: "23:00", horaFin: "00:30", creado: L(2026, 9, 25, 23, 15) });
    expect(calcularCelda("2026-09-25", "23:00", [], [t], [], APERTURA_MIN)).toEqual({ estado: "libre" });
    expect(calcularCelda("2026-10-02", "23:00", [], [t], [], APERTURA_MIN).estado).toBe("fijo");
  });

  it("usa la apertura de ESA columna: con apertura 00:00 el mismo 00:30 ya no cruza la medianoche", () => {
    // día operativo que abre 00:00: 00:30 pertenece al MISMO día calendario 25/09 (inicio 25/09 00:30)
    const t = crearTurnoFijo({ dia_semana: 5, horaInicio: "00:30", horaFin: "01:30", creado: L(2026, 9, 25, 12, 0) });
    expect(calcularCelda("2026-09-25", "00:30", [], [t], [], 0)).toEqual({ estado: "libre" });
    // con apertura 08:00 (inicio real 26/09 00:30, posterior a la creación) sí aparece
    expect(calcularCelda("2026-09-25", "00:30", [], [t], [], APERTURA_MIN).estado).toBe("fijo");
  });

  it("turno fijo sin `creado` (dato incompleto): sin cota inferior, se proyecta como siempre", () => {
    const t = crearTurnoFijo({ dia_semana: 2, horaInicio: "18:00", horaFin: "19:00" });
    expect(calcularCelda("2026-09-22", "18:00", [], [t], [], APERTURA_MIN).estado).toBe("fijo");
  });

  it("una reserva real de una fecha previa a la creación SÍ se muestra (la regla solo aplica a las virtuales)", () => {
    const t = crearTurnoFijo({ dia_semana: 2, horaInicio: "18:00", horaFin: "19:00", creado: creadoViernes2000 });
    const r = crearReserva({ fecha: "2026-09-22", horaInicio: "18:00", horaFin: "19:00", turno_fijo_id: "t1" });
    expect(calcularCelda("2026-09-22", "18:00", [r], [t], [], APERTURA_MIN)).toEqual({ estado: "reserva", reserva: r });
  });
});

describe("obtenerLunesOffset", () => {
  it("offset 0: devuelve el lunes de la semana de 'ahora' (miércoles)", () => {
    const ahora = new Date("2026-06-03T15:00:00").getTime(); // miércoles
    expect(formatearISO(obtenerLunesOffset(ahora, 0))).toBe("2026-06-01");
  });

  it("offset 0 cuando 'ahora' ya es lunes: devuelve ese mismo lunes", () => {
    const ahora = new Date("2026-06-01T09:00:00").getTime();
    expect(formatearISO(obtenerLunesOffset(ahora, 0))).toBe("2026-06-01");
  });

  it("offset 0 cuando 'ahora' es domingo: devuelve el lunes de ESA semana (hacia atrás, no hacia adelante)", () => {
    const ahora = new Date("2026-06-07T09:00:00").getTime(); // domingo
    expect(formatearISO(obtenerLunesOffset(ahora, 0))).toBe("2026-06-01");
  });

  it("offset positivo: semanas hacia adelante", () => {
    const ahora = new Date("2026-06-03T15:00:00").getTime();
    expect(formatearISO(obtenerLunesOffset(ahora, 1))).toBe("2026-06-08");
    expect(formatearISO(obtenerLunesOffset(ahora, 2))).toBe("2026-06-15");
  });

  it("offset negativo: semanas hacia atrás", () => {
    const ahora = new Date("2026-06-03T15:00:00").getTime();
    expect(formatearISO(obtenerLunesOffset(ahora, -1))).toBe("2026-05-25");
  });

  it("ignora la hora del día (siempre devuelve medianoche de ese lunes)", () => {
    const ahora = new Date("2026-06-03T23:59:00").getTime();
    const lunes = obtenerLunesOffset(ahora, 0);
    expect(lunes.getHours()).toBe(0);
    expect(lunes.getMinutes()).toBe(0);
  });
});

describe("construirDiasGrilla", () => {
  it("7 días consecutivos a partir de un lunes, con diaAbrev/diaNum correctos", () => {
    const lunes = new Date("2026-06-01T00:00:00"); // lunes
    const dias = construirDiasGrilla(lunes);
    expect(dias).toHaveLength(7);
    expect(dias[0]).toEqual({ iso: "2026-06-01", diaAbrev: "Lun", diaNum: 1 });
    expect(dias[6]).toEqual({ iso: "2026-06-07", diaAbrev: "Dom", diaNum: 7 });
  });

  it("funciona igual con un lunes de una semana con offset (pasada o futura)", () => {
    const lunesSemanaSiguiente = new Date("2026-06-08T00:00:00");
    const dias = construirDiasGrilla(lunesSemanaSiguiente);
    expect(dias[0].iso).toBe("2026-06-08");
    expect(dias[6].iso).toBe("2026-06-14");
  });
});

describe("construirFilasGrilla", () => {
  it("cierre normal (sin cruzar medianoche): un slot cada 30 min, sin incluir el cierre", () => {
    const filas = construirFilasGrilla(8 * 60, 23 * 60); // 08:00 a 23:00
    expect(filas[0]).toBe("08:00");
    expect(filas[filas.length - 1]).toBe("22:30");
    expect(filas).toHaveLength(30); // (23-8)*2
  });

  it("cierre que cruza medianoche: sigue generando slots después de las 24:00 (cierreExt > 1440)", () => {
    const filas = construirFilasGrilla(8 * 60, 25 * 60); // 08:00 a 01:00 (extendido a 25:00)
    expect(filas[filas.length - 1]).toBe("00:30");
    expect(filas).toHaveLength(34); // (25-8)*2
  });
});

// CFG-F2 — la grilla es una sola fila de horas compartida por los 7 días de
// la semana visible: su rango tiene que ser el más amplio real (horarios_semana
// + fecha especial, ya resueltos por franja_operativa para cada fecha), no un
// hardcode de 08:00-01:00.
describe("calcularRangoGrillaSemana", () => {
  it("los 7 días con el mismo horario: el rango es simplemente ese horario", () => {
    const franjas = Array.from({ length: 7 }, () => ({ cerrado: false, horaApertura: "08:00", horaCierre: "01:00" }));
    expect(calcularRangoGrillaSemana(franjas)).toEqual({ aperturaMin: 8 * 60, cierreExt: 25 * 60 });
  });

  it("un día abre más temprano que el resto: la apertura del rango es la más temprana", () => {
    const franjas = [
      { cerrado: false, horaApertura: "08:00", horaCierre: "23:00" },
      { cerrado: false, horaApertura: "07:00", horaCierre: "23:00" }, // domingo abre 1h antes
    ];
    expect(calcularRangoGrillaSemana(franjas)?.aperturaMin).toBe(7 * 60);
  });

  it("un día cierra más tarde que el resto (cruzando medianoche): el cierre del rango es el más tardío", () => {
    const franjas = [
      { cerrado: false, horaApertura: "08:00", horaCierre: "23:00" },
      { cerrado: false, horaApertura: "08:00", horaCierre: "02:00" }, // viernes cierra a las 2am
    ];
    // cierreExt se calcula relativo a la apertura común (08:00 = 480): 02:00
    // extendido cruzando medianoche es 26:00 (1560), más tarde que 23:00 (1380).
    expect(calcularRangoGrillaSemana(franjas)?.cierreExt).toBe(26 * 60);
  });

  it("un día cerrado no participa del rango (ni su apertura ni su cierre)", () => {
    const franjas = [
      { cerrado: false, horaApertura: "08:00", horaCierre: "23:00" },
      { cerrado: true, horaApertura: null, horaCierre: null }, // lunes cerrado
    ];
    expect(calcularRangoGrillaSemana(franjas)).toEqual({ aperturaMin: 8 * 60, cierreExt: 23 * 60 });
  });

  it("los 7 días cerrados: no hay ningún rango que mostrar (null, nunca un fallback a 08:00-01:00)", () => {
    const franjas = Array.from({ length: 7 }, () => ({ cerrado: true, horaApertura: null, horaCierre: null }));
    expect(calcularRangoGrillaSemana(franjas)).toBeNull();
  });
});

describe("etiquetaSemana", () => {
  it("semana dentro del mismo mes", () => {
    const dias = construirDiasGrilla(new Date("2026-06-01T00:00:00"));
    expect(etiquetaSemana(dias)).toBe("1 - 7 Jun");
  });

  it("semana que cruza de mes: usa el mes del ÚLTIMO día", () => {
    const dias = construirDiasGrilla(new Date("2026-06-29T00:00:00")); // lunes 29/6 -> domingo 5/7
    expect(etiquetaSemana(dias)).toBe("29 - 5 Jul");
  });
});

describe("esFinDeBloque", () => {
  const reservaA = crearReserva({ id: "a" });
  const reservaB = crearReserva({ id: "b" });
  const turnoA = crearTurnoFijo({ id: "ta" });
  const turnoB = crearTurnoFijo({ id: "tb" });
  const libre: CeldaGrilla = { estado: "libre" };
  const celdaReservaA: CeldaGrilla = { estado: "reserva", reserva: reservaA };
  const celdaReservaAOtraVez: CeldaGrilla = { estado: "reserva", reserva: reservaA };
  const celdaReservaB: CeldaGrilla = { estado: "reserva", reserva: reservaB };
  const celdaBloqueadaA: CeldaGrilla = { estado: "bloqueado", reserva: { ...reservaA, bloqueado: true } };
  const celdaFijoA: CeldaGrilla = { estado: "fijo", turnoFijo: turnoA, fecha: "2026-06-01" };
  const celdaFijoAOtraFecha: CeldaGrilla = { estado: "fijo", turnoFijo: turnoA, fecha: "2026-06-08" };
  const celdaFijoB: CeldaGrilla = { estado: "fijo", turnoFijo: turnoB, fecha: "2026-06-01" };

  it("una celda libre nunca es fin de bloque, sin importar la siguiente", () => {
    expect(esFinDeBloque(libre, celdaReservaA)).toBe(false);
    expect(esFinDeBloque(libre, libre)).toBe(false);
    expect(esFinDeBloque(libre, null)).toBe(false);
  });

  it("misma reserva real en la celda siguiente: NO es fin de bloque (aunque sea otra instancia con el mismo id)", () => {
    expect(esFinDeBloque(celdaReservaA, celdaReservaAOtraVez)).toBe(false);
  });

  it("mismo turno fijo en la celda siguiente (misma fecha): NO es fin de bloque", () => {
    expect(esFinDeBloque(celdaFijoA, { ...celdaFijoA })).toBe(false);
  });

  it("mismo turno fijo pero id de fecha distinta no cambia la identidad (identidad es por turnoFijo.id, no por fecha)", () => {
    // No es un caso real (una sola celda no cambia de fecha entre slots), pero
    // confirma que la identidad se basa en el id del turno fijo.
    expect(esFinDeBloque(celdaFijoA, celdaFijoAOtraFecha)).toBe(false);
  });

  it("distinta reserva real (id distinto): fin de bloque", () => {
    expect(esFinDeBloque(celdaReservaA, celdaReservaB)).toBe(true);
  });

  it("distinto turno fijo (id distinto): fin de bloque", () => {
    expect(esFinDeBloque(celdaFijoA, celdaFijoB)).toBe(true);
  });

  it("cambio de estado (reserva -> bloqueado), aunque sea la misma reserva subyacente: fin de bloque", () => {
    expect(esFinDeBloque(celdaReservaA, celdaBloqueadaA)).toBe(true);
  });

  it("cambio de entidad (reserva -> fijo): fin de bloque", () => {
    expect(esFinDeBloque(celdaReservaA, celdaFijoA)).toBe(true);
  });

  it("no-libre seguida de libre: fin de bloque", () => {
    expect(esFinDeBloque(celdaReservaA, libre)).toBe(true);
  });

  it("última fila de la grilla (celdaSiguiente null) sobre una celda ocupada: fin de bloque", () => {
    expect(esFinDeBloque(celdaReservaA, null)).toBe(true);
    expect(esFinDeBloque(celdaFijoA, null)).toBe(true);
  });
});

describe("formatearBadgeFecha", () => {
  it("formatea día abreviado en mayúsculas + dd/mm", () => {
    // 2026-06-01 es lunes
    expect(formatearBadgeFecha("2026-06-01")).toBe("LUN 01/06");
  });

  it("rellena con cero día y mes de un dígito", () => {
    expect(formatearBadgeFecha("2026-01-05")).toBe("LUN 05/01");
  });
});

describe("procesarReservasGrilla", () => {
  const AHORA = new Date("2026-06-03T15:00:00").getTime();

  it("data null se trata como lista vacía", () => {
    expect(procesarReservasGrilla(null, AHORA)).toEqual([]);
  });

  it("recorta horaInicio/horaFin y conserva el resto de los campos", () => {
    const fila = crearReserva({ hora_inicio: "10:00:00", hora_fin: "11:00:00", confirmada: true });
    const [out] = procesarReservasGrilla([fila], AHORA);
    expect(out.horaInicio).toBe("10:00");
    expect(out.horaFin).toBe("11:00");
    expect(out.id).toBe(fila.id);
  });

  it("una pendiente reciente (creada hace 5 min) se considera vigente", () => {
    const fila = crearReserva({
      confirmada: false,
      creado: new Date(AHORA - 5 * 60 * 1000).toISOString(),
    });
    expect(procesarReservasGrilla([fila], AHORA)).toHaveLength(1);
  });

  it("una pendiente vencida (creada hace 20 min) se excluye", () => {
    const fila = crearReserva({
      confirmada: false,
      creado: new Date(AHORA - 20 * 60 * 1000).toISOString(),
    });
    expect(procesarReservasGrilla([fila], AHORA)).toHaveLength(0);
  });

  it("un bloqueo siempre es vigente, sin importar cuándo se creó", () => {
    const fila = crearReserva({
      bloqueado: true,
      confirmada: false,
      creado: new Date(AHORA - 60 * 60 * 1000).toISOString(),
    });
    expect(procesarReservasGrilla([fila], AHORA)).toHaveLength(1);
  });
});

describe("telefonoParaWhatsapp", () => {
  it("limpia y prefija un teléfono real", () => {
    expect(telefonoParaWhatsapp("3771111111")).toBe("5493771111111");
  });
  it("teléfono vacío o faltante -> null", () => {
    expect(telefonoParaWhatsapp("")).toBeNull();
    expect(telefonoParaWhatsapp(null)).toBeNull();
    expect(telefonoParaWhatsapp(undefined)).toBeNull();
  });
  it("teléfono con muy pocos dígitos -> null", () => {
    expect(telefonoParaWhatsapp("123")).toBeNull();
  });
});

describe("construirLinkWhatsappReserva", () => {
  const reserva = { nombre: "Juan", fecha: "2026-06-01", horaInicio: "10:00", horaFin: "11:00", telefono: "3771111111" };
  it("arma un link wa.me con el teléfono real y sin autoenvío (solo devuelve el link)", () => {
    const link = construirLinkWhatsappReserva(reserva, "Los amigos padel");
    expect(link).toContain("https://wa.me/5493771111111?text=");
    expect(decodeURIComponent(link!)).toContain("Juan");
    expect(decodeURIComponent(link!)).toContain("Los amigos padel");
  });
  it("teléfono inválido/faltante -> sin link", () => {
    expect(construirLinkWhatsappReserva({ ...reserva, telefono: "" }, "Los amigos padel")).toBeNull();
  });
});

describe("construirLinkWhatsappCancelacion", () => {
  const reserva = { telefono: "3771111111", fecha: "2026-06-01", horaInicio: "10:00" };
  it("arma un mensaje de cancelación con cancha, fecha y hora", () => {
    const link = construirLinkWhatsappCancelacion(reserva, "Los amigos padel");
    const texto = decodeURIComponent(link!);
    expect(texto).toContain("Los amigos padel");
    expect(texto).toContain("10:00");
    expect(texto.toLowerCase()).toContain("cancelado");
  });
  it("teléfono inválido/faltante -> sin link (no hay nada para avisar)", () => {
    expect(construirLinkWhatsappCancelacion({ ...reserva, telefono: "" }, "Los amigos padel")).toBeNull();
  });
});
