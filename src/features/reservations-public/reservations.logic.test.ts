import { describe, expect, it } from "vitest";
import { calcularCierreExtendido } from "../../lib/datetime";
import {
  esReservaPublicaVigente,
  estaAbierta,
  haySolape,
  horasFinDisponibles,
  horasInicioDisponibles,
  ocurrenciasTurnoFijoDelDia,
  procesarConfiguracionReservas,
  procesarFranjaOperativa,
  procesarHorariosSemana,
  procesarReservasPublicas,
  procesarTurnosFijos,
  reservasDelDia,
} from "./reservations.logic";
import type {
  ConfiguracionCanchaPublicaRow,
  ExcepcionTurnoFijo,
  FranjaOperativaRow,
  HorarioSemanaRow,
  OcupacionDelDia,
  ReservaPublica,
  TurnoFijoProcesado,
  TurnoFijoPublico,
} from "./reservations.types";

const APERTURA = 480; // 08:00

describe("esReservaPublicaVigente", () => {
  const ahora = Date.now();

  it("confirmada antigua sigue vigente", () => {
    const creado = new Date(ahora - 60 * 60 * 1000).toISOString();
    expect(esReservaPublicaVigente({ confirmada: true, creado }, ahora)).toBe(true);
  });

  it("pendiente reciente (5 min) sigue vigente", () => {
    const creado = new Date(ahora - 5 * 60 * 1000).toISOString();
    expect(esReservaPublicaVigente({ confirmada: false, creado }, ahora)).toBe(true);
  });

  it("pendiente a exactamente 15 min deja de ser vigente (la regla real es <, no <=)", () => {
    const creado = new Date(ahora - 15 * 60 * 1000).toISOString();
    expect(esReservaPublicaVigente({ confirmada: false, creado }, ahora)).toBe(false);
  });

  it("pendiente vencida (20 min) se excluye", () => {
    const creado = new Date(ahora - 20 * 60 * 1000).toISOString();
    expect(esReservaPublicaVigente({ confirmada: false, creado }, ahora)).toBe(false);
  });
});

describe("procesarReservasPublicas", () => {
  it("recorta horas y aplica el filtro de vigencia sobre datos crudos", () => {
    const ahora = Date.now();
    const data: ReservaPublica[] = [
      {
        id: "a",
        fecha: "2026-06-01",
        hora_inicio: "10:00:00",
        hora_fin: "11:00:00",
        confirmada: true,
        bloqueado: false,
        creado: new Date(ahora - 60 * 60 * 1000).toISOString(),
      },
      {
        id: "b",
        fecha: "2026-06-01",
        hora_inicio: "12:00:00",
        hora_fin: "13:00:00",
        confirmada: false,
        bloqueado: false,
        creado: new Date(ahora - 20 * 60 * 1000).toISOString(), // pendiente vencida
      },
    ];
    const resultado = procesarReservasPublicas(data, ahora);
    expect(resultado).toEqual([{ id: "a", fecha: "2026-06-01", horaInicio: "10:00", horaFin: "11:00" }]);
  });

  it("data null se trata como lista vacía", () => {
    expect(procesarReservasPublicas(null)).toEqual([]);
  });
});

describe("procesarTurnosFijos", () => {
  it("recorta las horas de los turnos fijos crudos", () => {
    const data: TurnoFijoPublico[] = [{ id: "t1", dia_semana: 1, hora_inicio: "18:00:00", hora_fin: "19:00:00" }];
    expect(procesarTurnosFijos(data)).toEqual([{ id: "t1", dia_semana: 1, horaInicio: "18:00", horaFin: "19:00" }]);
  });
});

// C4 — franja_operativa(p_fecha)
describe("procesarFranjaOperativa", () => {
  it("mapea una franja abierta a camelCase con las horas recortadas", () => {
    const data: FranjaOperativaRow[] = [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "01:00:00" }];
    expect(procesarFranjaOperativa(data)).toEqual({ cerrado: false, horaApertura: "08:00", horaCierre: "01:00" });
  });

  it("una franja cerrada trae horas null", () => {
    // El tipo generado marca hora_apertura/hora_cierre como `string` (no
    // nullable) porque Supabase no sabe que franja_operativa devuelve NULL
    // ahí cuando cerrado=true — cast puntual para reflejar el runtime real.
    const data = [{ cerrado: true, hora_apertura: null, hora_cierre: null }] as unknown as FranjaOperativaRow[];
    expect(procesarFranjaOperativa(data)).toEqual({ cerrado: true, horaApertura: null, horaCierre: null });
  });

  it("data null o vacía se trata como 'sin franja resuelta todavía'", () => {
    expect(procesarFranjaOperativa(null)).toBeNull();
    expect(procesarFranjaOperativa([])).toBeNull();
  });
});

// PUBLIC-R5 — horarios_semana_publica
describe("procesarHorariosSemana", () => {
  it("mapea las filas crudas a camelCase con las horas recortadas", () => {
    const data: HorarioSemanaRow[] = [
      { dia_semana: 0, abierto: true, hora_apertura: "08:00:00", hora_cierre: "01:00:00" },
      { dia_semana: 1, abierto: false, hora_apertura: "08:00:00", hora_cierre: "01:00:00" },
    ];
    expect(procesarHorariosSemana(data)).toEqual([
      { diaSemana: 0, abierto: true, horaApertura: "08:00", horaCierre: "01:00" },
      { diaSemana: 1, abierto: false, horaApertura: "08:00", horaCierre: "01:00" },
    ]);
  });

  it("descarta filas sin dia_semana o sin abierto (vista nullable por definición, no debería pasar)", () => {
    const data = [
      { dia_semana: null, abierto: true, hora_apertura: "08:00:00", hora_cierre: "01:00:00" },
      { dia_semana: 2, abierto: null, hora_apertura: "08:00:00", hora_cierre: "01:00:00" },
    ] as unknown as HorarioSemanaRow[];
    expect(procesarHorariosSemana(data)).toEqual([]);
  });

  it("data null o vacía se trata como 'sin horarios resueltos'", () => {
    expect(procesarHorariosSemana(null)).toEqual([]);
    expect(procesarHorariosSemana([])).toEqual([]);
  });
});

// C5/C6 — configuracion_cancha_publica
describe("procesarConfiguracionReservas", () => {
  it("mapea la fila cruda a camelCase", () => {
    const data: ConfiguracionCanchaPublicaRow = {
      duracion_minima_minutos: 60,
      duracion_maxima_minutos: 180,
      anticipacion_maxima_dias: 14,
      anticipacion_minima_minutos: 0,
      limite_reservas_activas_telefono: 3,
      cancelacion_horas_minimas: 4,
    };
    expect(procesarConfiguracionReservas(data)).toEqual({
      duracionMinima: 60,
      duracionMaxima: 180,
      anticipacionMaximaDias: 14,
      anticipacionMinimaMinutos: 0,
      limiteReservasActivasTelefono: 3,
    });
  });

  it("data null, o con algún campo null, se trata como 'sin configuración resuelta todavía'", () => {
    expect(procesarConfiguracionReservas(null)).toBeNull();
    expect(
      procesarConfiguracionReservas({
        duracion_minima_minutos: null,
        duracion_maxima_minutos: 180,
        anticipacion_maxima_dias: 14,
        anticipacion_minima_minutos: 0,
        limite_reservas_activas_telefono: 3,
        cancelacion_horas_minimas: 4,
      }),
    ).toBeNull();
    expect(
      procesarConfiguracionReservas({
        duracion_minima_minutos: 60,
        duracion_maxima_minutos: 180,
        anticipacion_maxima_dias: null,
        anticipacion_minima_minutos: 0,
        limite_reservas_activas_telefono: 3,
        cancelacion_horas_minimas: 4,
      }),
    ).toBeNull();
  });
});

describe("ocurrenciasTurnoFijoDelDia", () => {
  const turnosFijos: TurnoFijoProcesado[] = [
    { id: "t1", dia_semana: 1, horaInicio: "18:00", horaFin: "19:00" }, // lunes
  ];

  it("un turno fijo del día de la semana correcto aparece", () => {
    // 2026-06-01 es lunes
    const out = ocurrenciasTurnoFijoDelDia("2026-06-01", turnosFijos, []);
    expect(out).toEqual([{ id: "t1", dia_semana: 1, horaInicio: "18:00", horaFin: "19:00", fecha: "2026-06-01" }]);
  });

  it("un turno fijo con excepción cargada para esa fecha no aparece", () => {
    // E4.3.4 — excepciones_turno_fijo_publicas solo expone turno_fijo_id/fecha.
    const excepciones: ExcepcionTurnoFijo[] = [{ turno_fijo_id: "t1", fecha: "2026-06-01" }];
    const out = ocurrenciasTurnoFijoDelDia("2026-06-01", turnosFijos, excepciones);
    expect(out).toEqual([]);
  });

  it("otro turno fijo (distinto id) el mismo día NO se ve afectado por la excepción", () => {
    // Confirma que la liberación de fecha es por turno_fijo_id, no global —
    // solo turno_fijo_id/fecha viajan ahora desde la fuente pública mínima.
    const turnosDelDia: TurnoFijoProcesado[] = [
      { id: "t1", dia_semana: 1, horaInicio: "18:00", horaFin: "19:00" },
      { id: "t2", dia_semana: 1, horaInicio: "20:00", horaFin: "21:00" },
    ];
    const excepciones: ExcepcionTurnoFijo[] = [{ turno_fijo_id: "t1", fecha: "2026-06-01" }];
    const out = ocurrenciasTurnoFijoDelDia("2026-06-01", turnosDelDia, excepciones);
    expect(out).toEqual([{ id: "t2", dia_semana: 1, horaInicio: "20:00", horaFin: "21:00", fecha: "2026-06-01" }]);
  });

  it("un turno fijo de otro día de la semana no aparece", () => {
    // 2026-06-02 es martes, el turno es dia_semana 1 (lunes)
    const out = ocurrenciasTurnoFijoDelDia("2026-06-02", turnosFijos, []);
    expect(out).toEqual([]);
  });
});

describe("reservasDelDia", () => {
  it("mergea reservas reales del día con ocurrencias virtuales de turnos fijos, e ignora reservas de otra fecha", () => {
    const reservas = [
      { id: "r1", fecha: "2026-06-01", horaInicio: "10:00", horaFin: "11:00" },
      { id: "r2", fecha: "2026-06-02", horaInicio: "10:00", horaFin: "11:00" }, // otra fecha, no debe aparecer
    ];
    const turnosFijos: TurnoFijoProcesado[] = [{ id: "t1", dia_semana: 1, horaInicio: "18:00", horaFin: "19:00" }];
    const out = reservasDelDia("2026-06-01", reservas, turnosFijos, []);
    expect(out).toEqual([
      { id: "r1", fecha: "2026-06-01", horaInicio: "10:00", horaFin: "11:00" },
      { id: "t1", dia_semana: 1, horaInicio: "18:00", horaFin: "19:00", fecha: "2026-06-01" },
    ]);
  });
});

describe("estaAbierta", () => {
  it("dentro del horario normal (08:00-22:00, ahora 15:00) -> abierta", () => {
    const cierreExt = calcularCierreExtendido(480, 1320); // 22:00
    expect(estaAbierta(900, 480, cierreExt)).toBe(true); // 15:00
  });

  it("antes de abrir (07:00, apertura 08:00) -> cerrada", () => {
    const cierreExt = calcularCierreExtendido(480, 1320);
    expect(estaAbierta(420, 480, cierreExt)).toBe(false); // 07:00
  });

  it("después de cerrar, horario normal (23:00, cierre 22:00) -> cerrada", () => {
    const cierreExt = calcularCierreExtendido(480, 1320);
    expect(estaAbierta(1380, 480, cierreExt)).toBe(false); // 23:00
  });

  it("límite exacto de apertura (08:00) -> abierta (comparación >=)", () => {
    const cierreExt = calcularCierreExtendido(480, 1320);
    expect(estaAbierta(480, 480, cierreExt)).toBe(true);
  });

  it("límite exacto de cierre normal (22:00) -> cerrada (comparación <, exclusiva)", () => {
    const cierreExt = calcularCierreExtendido(480, 1320);
    expect(estaAbierta(1320, 480, cierreExt)).toBe(false);
  });

  describe("cierre cruzando medianoche (08:00 -> 01:00) — caso histórico de bugs de medianoche", () => {
    const cierreExt = calcularCierreExtendido(480, 60); // 01:00 -> se extiende a 1500

    it("23:30, todavía dentro del horario normal previo al cruce -> abierta", () => {
      expect(estaAbierta(1410, 480, cierreExt)).toBe(true);
    });

    it("00:00 (medianoche exacta) -> sigue abierta", () => {
      expect(estaAbierta(0, 480, cierreExt)).toBe(true);
    });

    it("00:30, madrugada que pertenece a la jornada extendida -> abierta", () => {
      expect(estaAbierta(30, 480, cierreExt)).toBe(true);
    });

    it("01:00 exacto (límite del cierre extendido) -> cerrada (comparación < exclusiva)", () => {
      expect(estaAbierta(60, 480, cierreExt)).toBe(false);
    });

    it("01:30, ya pasado el cierre extendido -> cerrada", () => {
      expect(estaAbierta(90, 480, cierreExt)).toBe(false);
    });
  });
});

describe("haySolape", () => {
  const fecha = "2026-06-01";

  it("detecta solape normal (los rangos se cruzan)", () => {
    const ocupacion: OcupacionDelDia[] = [{ id: "r1", fecha, horaInicio: "10:00", horaFin: "11:00" }];
    expect(haySolape(fecha, "10:30", "11:30", ocupacion, APERTURA)).toBe(true);
  });

  it("no hay solape cuando los rangos no se tocan", () => {
    const ocupacion: OcupacionDelDia[] = [{ id: "r1", fecha, horaInicio: "10:00", horaFin: "11:00" }];
    expect(haySolape(fecha, "12:00", "13:00", ocupacion, APERTURA)).toBe(false);
  });

  it("dos turnos que se tocan justo en el borde (fin de uno == inicio del otro) NO se consideran solape", () => {
    const ocupacion: OcupacionDelDia[] = [{ id: "r1", fecha, horaInicio: "10:00", horaFin: "11:00" }];
    expect(haySolape(fecha, "11:00", "12:00", ocupacion, APERTURA)).toBe(false);
  });

  it("detecta solape cruzando medianoche (existente 23:00->01:00 vs. intento 00:30->01:30)", () => {
    const ocupacion: OcupacionDelDia[] = [{ id: "r1", fecha, horaInicio: "23:00", horaFin: "01:00" }];
    expect(haySolape(fecha, "00:30", "01:30", ocupacion, APERTURA)).toBe(true);
  });

  it("una ocupación de otra fecha nunca solapa", () => {
    const ocupacion: OcupacionDelDia[] = [{ id: "r1", fecha: "2026-06-02", horaInicio: "10:00", horaFin: "11:00" }];
    expect(haySolape(fecha, "10:00", "11:00", ocupacion, APERTURA)).toBe(false);
  });
});

describe("horasInicioDisponibles", () => {
  it("respeta apertura y cierre (sin ocupación, día futuro)", () => {
    const out = horasInicioDisponibles("2026-06-01", [], 480, 1380, 60, new Date(2026, 4, 1, 6, 0));
    expect(out[0]).toBe("08:00");
    expect(out[out.length - 1]).toBe("22:00");
    expect(out).not.toContain("22:30"); // 22:30 + 60min pasaría el cierre (23:00)
  });

  it("un horario ocupado desaparece de los candidatos", () => {
    const ocupacion: OcupacionDelDia[] = [{ id: "r1", fecha: "2026-06-01", horaInicio: "10:00", horaFin: "11:00" }];
    const out = horasInicioDisponibles("2026-06-01", ocupacion, 480, 1380, 60, new Date(2026, 4, 1, 6, 0));
    expect(out).not.toContain("10:00");
  });

  it("si la fecha consultada es hoy, los horarios ya pasados desaparecen", () => {
    const ahora = new Date(2026, 5, 1, 10, 15); // 2026-06-01 10:15 local
    const out = horasInicioDisponibles("2026-06-01", [], 480, 1380, 60, ahora);
    expect(out).not.toContain("08:00");
    expect(out[0]).toBe("10:30"); // primer slot de 30min a partir de las 10:15
  });

  it("si la fecha consultada NO es hoy, no filtra por hora aunque 'ahora' sea tarde", () => {
    const ahora = new Date(2026, 5, 1, 22, 0); // 2026-06-01 22:00
    const out = horasInicioDisponibles("2026-06-02", [], 480, 1380, 60, ahora);
    expect(out[0]).toBe("08:00");
  });

  it("madrugada: con cierre extendido (02:00 -> 1560), genera candidatos post-medianoche", () => {
    const cierreExt = calcularCierreExtendido(480, 120); // 02:00 -> 1560
    const out = horasInicioDisponibles("2026-06-01", [], 480, cierreExt, 60, new Date(2026, 4, 1, 6, 0));
    expect(out).toContain("00:00");
    expect(out[out.length - 1]).toBe("01:00");
  });

  // C6 — anticipacionMinimaMinutos (default 0, sin cambiar ningún caso de
  // arriba) empuja el corte de "ya pasó" de hoy hacia adelante, solo para
  // presentación/UX (hora del navegador, no autoridad).
  describe("anticipacionMinimaMinutos (C6)", () => {
    it("con 0 (default) se preserva el comportamiento existente", () => {
      const ahora = new Date(2026, 5, 1, 10, 15);
      const out = horasInicioDisponibles("2026-06-01", [], 480, 1380, 60, ahora);
      expect(out[0]).toBe("10:30");
    });

    it("con anticipación > 0, empuja el primer horario ofrecido más adelante", () => {
      const ahora = new Date(2026, 5, 1, 10, 15); // 10:15
      const out = horasInicioDisponibles("2026-06-01", [], 480, 1380, 60, ahora, 60); // +60min -> corte 11:15
      expect(out[0]).toBe("11:30");
    });

    it("si la fecha consultada NO es hoy, la anticipación no filtra nada", () => {
      const ahora = new Date(2026, 5, 1, 22, 0);
      const out = horasInicioDisponibles("2026-06-02", [], 480, 1380, 60, ahora, 120);
      expect(out[0]).toBe("08:00");
    });
  });
});

describe("horasFinDisponibles", () => {
  it("respeta la duración mínima (no ofrece antes de inicio + duracionMinima)", () => {
    const out = horasFinDisponibles("10:00", [], 480, 1380, 60, 180);
    expect(out[0]).toBe("11:00");
  });

  it("respeta la duración máxima", () => {
    const out = horasFinDisponibles("10:00", [], 480, 1380, 60, 180);
    expect(out[out.length - 1]).toBe("13:00"); // 10:00 + 180min
  });

  it("se acorta si hay una próxima reserva antes del cierre/duración máxima", () => {
    const ocupacion: OcupacionDelDia[] = [{ id: "r1", fecha: "x", horaInicio: "12:00", horaFin: "13:00" }];
    const out = horasFinDisponibles("10:00", ocupacion, 480, 1380, 60, 180);
    expect(out[out.length - 1]).toBe("12:00");
  });

  it("sin horario de inicio elegido, no hay candidatos", () => {
    expect(horasFinDisponibles("", [], 480, 1380, 60, 180)).toEqual([]);
  });
});
