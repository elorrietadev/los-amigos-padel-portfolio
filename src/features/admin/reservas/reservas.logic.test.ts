import { filtrarReservasParaReporte } from "../reportes/reportes.logic";
import { procesarReservasGrilla } from "../agenda/agenda.logic";
import { describe, expect, it } from "vitest";
import {
  aplicarPago,
  calcularOcupacionHoy,
  calcularPendientesUrgentes,
  calcularHorasSemana,
  calcularSplitPago,
  construirLinkWhatsapp,
  construirListaJugadas,
  construirListaProximas,
  determinarEstadoInicialPago,
  ERROR_RESERVA_INEXISTENTE,
  duracionHoras,
  esSobrepago,
  fechaFueraDeRangoCargado,
  formatearBadgeFecha,
  marcarConfirmada,
  MENSAJE_RESERVA_CON_PAGOS,
  MENSAJE_RESERVA_CON_VENTAS,
  mensajeErrorReserva,
  obtenerLunes,
  obtenerRangoSemana,
  obtenerRangoUltimosDias,
  tieneMovimientoContable,
  ocurrenciasFijasVirtuales,
  ordenarJugadas,
  ordenarProximas,
  pasaFiltros,
  pasaFiltrosVirtual,
  procesarReservas,
  quitarPorId,
  textoPago,
} from "./reservas.logic";
import type {
  ExcepcionTurnoFijoRow,
  FiltrosReservas,
  ReservaProcesada,
  ReservaRow,
  ReservaVirtual,
  TurnoFijoConHorario,
} from "./reservas.types";

const APERTURA_MIN = 8 * 60; // 08:00, igual que config.horaApertura real
const AHORA = new Date("2026-01-07T15:00:00-03:00").getTime(); // miércoles

function crearReserva(overrides: Partial<ReservaRow> = {}): ReservaRow {
  return {
    id: "r1",
    fecha: "2026-01-07",
    hora_inicio: "10:00:00",
    hora_fin: "11:00:00",
    nombre: "Juan",
    telefono: "3771111111",
    precio: 20000,
    creado: new Date(AHORA).toISOString(),
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

function procesarUna(overrides: Partial<ReservaRow> = {}, ahora = AHORA): ReservaProcesada | undefined {
  return procesarReservas([crearReserva(overrides)], ahora).vigentes[0];
}

describe("procesarReservas — vigencia", () => {
  it("una reserva confirmada es vigente aunque esté vencida en el tiempo", () => {
    const creadoHaceHoras = new Date(AHORA - 3 * 60 * 60 * 1000).toISOString();
    const { vigentes, vencidas } = procesarReservas([crearReserva({ confirmada: true, creado: creadoHaceHoras })], AHORA);
    expect(vigentes).toHaveLength(1);
    expect(vencidas).toHaveLength(0);
  });

  it("una pendiente reciente (creada hace menos de 15min) es vigente", () => {
    const creado = new Date(AHORA - 5 * 60 * 1000).toISOString();
    const { vigentes, vencidas } = procesarReservas([crearReserva({ confirmada: false, creado })], AHORA);
    expect(vigentes).toHaveLength(1);
    expect(vencidas).toHaveLength(0);
  });

  it("una pendiente vencida (>=15min sin confirmar) se marca para borrar, no vigente", () => {
    const creado = new Date(AHORA - 20 * 60 * 1000).toISOString();
    const { vigentes, vencidas } = procesarReservas([crearReserva({ confirmada: false, creado })], AHORA);
    expect(vigentes).toHaveLength(0);
    expect(vencidas).toHaveLength(1);
  });

  it("una bloqueada es vigente sin importar antigüedad ni confirmada", () => {
    const creadoHaceHoras = new Date(AHORA - 5 * 60 * 60 * 1000).toISOString();
    const { vigentes } = procesarReservas(
      [crearReserva({ bloqueado: true, confirmada: false, creado: creadoHaceHoras })],
      AHORA,
    );
    expect(vigentes).toHaveLength(1);
  });

  it("límite exacto: justo antes de los 15min todavía es vigente", () => {
    const creado = new Date(AHORA - (15 * 60 * 1000 - 1)).toISOString();
    const { vigentes } = procesarReservas([crearReserva({ creado })], AHORA);
    expect(vigentes).toHaveLength(1);
  });

  it("límite exacto: a los 15min exactos ya es vencida", () => {
    const creado = new Date(AHORA - 15 * 60 * 1000).toISOString();
    const { vencidas } = procesarReservas([crearReserva({ creado })], AHORA);
    expect(vencidas).toHaveLength(1);
  });

  it("creado null no rompe el cálculo (se trata como muy antiguo, no como reciente)", () => {
    const { vencidas } = procesarReservas([crearReserva({ confirmada: false, creado: null })], AHORA);
    expect(vencidas).toHaveLength(1);
  });
});

describe("procesarReservas — horarios", () => {
  it("recorta hora_inicio/hora_fin a HH:MM y conserva los campos crudos", () => {
    const r = procesarUna({ hora_inicio: "10:00:00", hora_fin: "11:30:00" });
    expect(r?.horaInicio).toBe("10:00");
    expect(r?.horaFin).toBe("11:30");
    expect(r?.hora_inicio).toBe("10:00:00");
  });
});

describe("duracionHoras", () => {
  it("caso normal", () => {
    expect(duracionHoras("10:00", "11:00")).toBe(1);
  });

  it("cruce de medianoche", () => {
    expect(duracionHoras("23:00", "01:00")).toBe(2);
  });

  it("media hora", () => {
    expect(duracionHoras("10:00", "10:30")).toBe(0.5);
  });
});

describe("pasaFiltros / pasaFiltrosVirtual", () => {
  const base: FiltrosReservas = { filtroFecha: "", filtroNombre: "", filtroRapido: null };

  it("filtra por nombre (case-insensitive, substring)", () => {
    const r = crearReserva({ nombre: "María Pérez" });
    expect(pasaFiltros(r, { ...base, filtroNombre: "maría" }, AHORA)).toBe(true);
    expect(pasaFiltros(r, { ...base, filtroNombre: "juan" }, AHORA)).toBe(false);
  });

  it("filtra por fecha exacta", () => {
    const r = crearReserva({ fecha: "2026-01-07" });
    expect(pasaFiltros(r, { ...base, filtroFecha: "2026-01-07" }, AHORA)).toBe(true);
    expect(pasaFiltros(r, { ...base, filtroFecha: "2026-01-08" }, AHORA)).toBe(false);
  });

  it("filtro rápido 'hoy'", () => {
    const hoy = crearReserva({ fecha: "2026-01-07" });
    const otro = crearReserva({ fecha: "2026-01-08" });
    expect(pasaFiltros(hoy, { ...base, filtroRapido: "hoy" }, AHORA)).toBe(true);
    expect(pasaFiltros(otro, { ...base, filtroRapido: "hoy" }, AHORA)).toBe(false);
  });

  it("filtro rápido 'manana'", () => {
    const manana = crearReserva({ fecha: "2026-01-08" });
    expect(pasaFiltros(manana, { ...base, filtroRapido: "manana" }, AHORA)).toBe(true);
  });

  it("filtro rápido 'semana' respeta el rango lunes-domingo", () => {
    const dentro = crearReserva({ fecha: "2026-01-10" }); // sábado de la misma semana (lunes 05 -> domingo 11)
    const fuera = crearReserva({ fecha: "2026-01-12" }); // lunes siguiente
    expect(pasaFiltros(dentro, { ...base, filtroRapido: "semana" }, AHORA)).toBe(true);
    expect(pasaFiltros(fuera, { ...base, filtroRapido: "semana" }, AHORA)).toBe(false);
  });

  it("filtro rápido 'pendientes' excluye confirmadas y bloqueadas", () => {
    const pendiente = crearReserva({ confirmada: false, bloqueado: false });
    const confirmada = crearReserva({ confirmada: true });
    const bloqueada = crearReserva({ bloqueado: true });
    expect(pasaFiltros(pendiente, { ...base, filtroRapido: "pendientes" }, AHORA)).toBe(true);
    expect(pasaFiltros(confirmada, { ...base, filtroRapido: "pendientes" }, AHORA)).toBe(false);
    expect(pasaFiltros(bloqueada, { ...base, filtroRapido: "pendientes" }, AHORA)).toBe(false);
  });

  it("pasaFiltrosVirtual descarta 'pendientes' sin evaluar el resto", () => {
    const virtual: ReservaVirtual = {
      virtual: true,
      turnoFijoId: "t1",
      fecha: "2026-01-07",
      horaInicio: "10:00",
      horaFin: "11:00",
      nombre: "Pedro",
      telefono: "377222",
    };
    expect(pasaFiltrosVirtual(virtual, { ...base, filtroRapido: "pendientes" }, AHORA)).toBe(false);
    expect(pasaFiltrosVirtual(virtual, base, AHORA)).toBe(true);
  });
});

describe("ordenarProximas / ordenarJugadas", () => {
  it("ordenarProximas ordena ascendente por fecha+hora, intercalando reales y virtuales", () => {
    const real = procesarUna({ id: "real", fecha: "2026-01-07", hora_inicio: "09:00:00", hora_fin: "10:00:00" })!;
    const virtual: ReservaVirtual = {
      virtual: true,
      turnoFijoId: "t1",
      fecha: "2026-01-07",
      horaInicio: "08:00",
      horaFin: "09:00",
      nombre: "Fijo",
      telefono: "377",
    };
    const [primero, segundo] = ordenarProximas([real, virtual]);
    expect(primero).toBe(virtual);
    expect(segundo).toBe(real);
  });

  it("ordenarJugadas 'recientes' pone la fecha más nueva primero", () => {
    const vieja = procesarUna({ id: "vieja", fecha: "2026-01-01" })!;
    const nueva = procesarUna({ id: "nueva", fecha: "2026-01-07" })!;
    const [primero] = ordenarJugadas([vieja, nueva], "recientes");
    expect(primero.id).toBe("nueva");
  });

  it("ordenarJugadas 'antiguos' pone la fecha más vieja primero", () => {
    const vieja = procesarUna({ id: "vieja", fecha: "2026-01-01" })!;
    const nueva = procesarUna({ id: "nueva", fecha: "2026-01-07" })!;
    const [primero] = ordenarJugadas([vieja, nueva], "antiguos");
    expect(primero.id).toBe("vieja");
  });
});

describe("construirListaProximas / construirListaJugadas", () => {
  const sinFiltros: FiltrosReservas = { filtroFecha: "", filtroNombre: "", filtroRapido: null };

  it("excluye de próximos lo que ya pasó y aplica filtros", () => {
    const futura = procesarUna({ id: "futura", fecha: "2026-01-10", nombre: "Ana" })!;
    const pasada = procesarUna({
      id: "pasada",
      fecha: "2026-01-01",
      hora_inicio: "09:00:00",
      hora_fin: "10:00:00",
      nombre: "Ana",
    })!;
    const lista = construirListaProximas([futura, pasada], [], sinFiltros, APERTURA_MIN, AHORA);
    expect(lista.map((r) => (r as ReservaProcesada).id)).toEqual(["futura"]);
  });

  it("construirListaJugadas incluye solo lo ya jugado y respeta el orden pedido", () => {
    const futura = procesarUna({ id: "futura", fecha: "2026-01-10" })!;
    const pasada = procesarUna({ id: "pasada", fecha: "2026-01-01", hora_inicio: "09:00:00", hora_fin: "10:00:00" })!;
    const lista = construirListaJugadas([futura, pasada], sinFiltros, AHORA, "recientes");
    expect(lista.map((r) => r.id)).toEqual(["pasada"]);
  });

  // CFG-F2 — reservas reales usan SU PROPIA hora_apertura_vigente (columna
  // poblada en su momento), nunca un aperturaMin global de "hoy".
  it("una reserva real usa su propia apertura vigente, nunca un aperturaMin global del día de hoy", () => {
    // A las 07:00 abría la cancha cuando se jugó este turno (hora_apertura_vigente),
    // aunque la apertura configurada de "hoy" sea otra (08:00, como APERTURA_MIN
    // acá arriba) — 07:30 con vigente=07:00 NO cruza medianoche (horario normal
    // de la mañana), así que el turno ya pasó (AHORA es el mismo día a las
    // 15:00). Si en cambio se reinterpretara con un aperturaMin global de 08:00,
    // 07:30 < 08:00 correría el inicio al día SIGUIENTE y este turno parecería
    // todavía no jugado — exactamente el bug que hora_apertura_vigente evita.
    const turno = procesarUna({
      id: "vigente-propia",
      fecha: "2026-01-07",
      hora_inicio: "07:30:00",
      hora_fin: "08:30:00",
      hora_apertura_vigente: "07:00:00",
    })!;
    const lista = construirListaJugadas([turno], sinFiltros, AHORA, "recientes");
    expect(lista.map((r) => r.id)).toEqual(["vigente-propia"]);
  });
});

describe("ocurrenciasFijasVirtuales", () => {
  const turno: TurnoFijoConHorario = {
    id: "t1",
    titular_id: "titular-1",
    dia_semana: 3, // miércoles
    nombre: "Fijo Miércoles",
    telefono: "377999",
    horaInicio: "18:00",
    horaFin: "19:00",
  };

  it("genera una ocurrencia para el próximo día que coincide con dia_semana", () => {
    const out = ocurrenciasFijasVirtuales([turno], [], [], AHORA, 10);
    expect(out.some((o) => o.fecha === "2026-01-07")).toBe(true); // AHORA es miércoles
  });

  it("excluye una fecha cancelada por excepción", () => {
    const excepciones: ExcepcionTurnoFijoRow[] = [
      { id: "e1", turno_fijo_id: "t1", fecha: "2026-01-07", creado: null },
    ];
    const out = ocurrenciasFijasVirtuales([turno], excepciones, [], AHORA, 10);
    expect(out.some((o) => o.fecha === "2026-01-07")).toBe(false);
  });

  it("no duplica si ya existe una reserva real materializada para esa fecha/turno", () => {
    const yaExiste = procesarUna({ id: "r-mat", fecha: "2026-01-07", turno_fijo_id: "t1" })!;
    const out = ocurrenciasFijasVirtuales([turno], [], [yaExiste], AHORA, 10);
    expect(out.some((o) => o.fecha === "2026-01-07")).toBe(false);
  });

  // FINAL-F3 (M5) — instante_inicio_real(ocurrencia) >= turnos_fijos.creado.
  // Instantes con el constructor local de Date (mismo huso que usa el cálculo).
  describe("no proyecta ocurrencias anteriores a la creación del turno fijo", () => {
    const L = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).toISOString();
    const AHORA_LOCAL = new Date(2026, 0, 7, 21, 0).getTime(); // miércoles 07/01 21:00 (hora local)
    const fechas = (out: ReturnType<typeof ocurrenciasFijasVirtuales>) => out.map((o) => o.fecha);

    it("mismo día, horario terminado antes de la creación (creado 20:00, turno 18:00-19:00): la de hoy NO, la de la semana siguiente SÍ", () => {
      const t = { ...turno, creado: L(2026, 1, 7, 20, 0) };
      const out = ocurrenciasFijasVirtuales([t], [], [], AHORA_LOCAL, 10, 480);
      expect(fechas(out)).not.toContain("2026-01-07");
      expect(fechas(out)).toContain("2026-01-14");
    });

    it("mismo día, horario futuro respecto de la creación (creado 20:00, turno 21:00-22:00): la de hoy SÍ", () => {
      const t = { ...turno, horaInicio: "21:00", horaFin: "22:00", creado: L(2026, 1, 7, 20, 0) };
      const out = ocurrenciasFijasVirtuales([t], [], [], AHORA_LOCAL, 10, 480);
      expect(fechas(out)).toContain("2026-01-07");
    });

    it("creado EXACTAMENTE al inicio: la de hoy sí (>=)", () => {
      const t = { ...turno, creado: L(2026, 1, 7, 18, 0) };
      expect(fechas(ocurrenciasFijasVirtuales([t], [], [], AHORA_LOCAL, 10, 480))).toContain("2026-01-07");
    });

    it("cruce de medianoche: turno 00:30 del día operativo de hoy (inicio real mañana 00:30), creado hoy 20:00: sí; creado mañana 00:45: no", () => {
      const madrugada = { ...turno, horaInicio: "00:30", horaFin: "01:30" };
      const antes = ocurrenciasFijasVirtuales([{ ...madrugada, creado: L(2026, 1, 7, 20, 0) }], [], [], AHORA_LOCAL, 10, 480);
      expect(fechas(antes)).toContain("2026-01-07");
      const despues = ocurrenciasFijasVirtuales([{ ...madrugada, creado: L(2026, 1, 8, 0, 45) }], [], [], AHORA_LOCAL, 10, 480);
      expect(fechas(despues)).not.toContain("2026-01-07");
      expect(fechas(despues)).toContain("2026-01-14");
    });

    it("sin `creado` (dato incompleto): sin cota inferior, la de hoy se proyecta como siempre", () => {
      expect(fechas(ocurrenciasFijasVirtuales([turno], [], [], AHORA_LOCAL, 10, 480))).toContain("2026-01-07");
    });

    it("los días posteriores a hoy nunca se filtran por creación (aunque no se conozca la apertura de hoy)", () => {
      const t = { ...turno, creado: L(2026, 1, 7, 20, 0) };
      expect(fechas(ocurrenciasFijasVirtuales([t], [], [], AHORA_LOCAL, 10, null))).toContain("2026-01-14");
    });
  });
});

// D7 movió los campos de plata (efectivo/transferencia/sin registrar/
// ingresos) a caja/caja.logic.ts (calcularCajaSemana) — lo que queda acá es
// solo horas, con el mismo criterio de siempre (no filtra por jugada, a
// diferencia de Caja). Ver caja.logic.test.ts para la cobertura de plata,
// incluyendo el caso de la reserva futura que antes sí sumaba a "caja" y ya no.
describe("calcularHorasSemana", () => {
  const semanaInicio = "2026-01-05";
  const semanaFin = "2026-01-11";

  it("una reserva pasada de la semana suma sus horas", () => {
    // Martes 2026-01-06, ya pasado respecto de AHORA (miércoles 2026-01-07).
    const pasada = procesarUna({ id: "pasada", fecha: "2026-01-06", hora_inicio: "09:00:00", hora_fin: "10:00:00" })!;
    const horas = calcularHorasSemana([pasada], semanaInicio, semanaFin, AHORA);
    expect(horas).toBe(1);
  });

  it("una reserva futura de la misma semana NO suma horas", () => {
    // Sábado 2026-01-10, todavía no jugado respecto de AHORA (miércoles).
    const futura = procesarUna({ id: "futura", fecha: "2026-01-10", hora_inicio: "09:00:00", hora_fin: "10:30:00" })!;
    const horas = calcularHorasSemana([futura], semanaInicio, semanaFin, AHORA);
    expect(horas).toBe(0);
  });

  it("una reserva bloqueada NO suma horas, aunque ya haya pasado", () => {
    const bloqueada = procesarUna({
      id: "bloqueo",
      fecha: "2026-01-06",
      bloqueado: true,
      hora_inicio: "09:00:00",
      hora_fin: "10:00:00",
    })!;
    const horas = calcularHorasSemana([bloqueada], semanaInicio, semanaFin, AHORA);
    expect(horas).toBe(0);
  });

  it("suma varias reservas pasadas de la semana, sin contar la bloqueada ni la futura", () => {
    const pasada = procesarUna({ id: "pasada", fecha: "2026-01-06", hora_inicio: "09:00:00", hora_fin: "10:00:00" })!;
    const bloqueada = procesarUna({
      id: "bloqueo",
      fecha: "2026-01-06",
      bloqueado: true,
      hora_inicio: "09:00:00",
      hora_fin: "10:00:00",
    })!;
    const futura = procesarUna({ id: "futura", fecha: "2026-01-10", hora_inicio: "09:00:00", hora_fin: "10:30:00" })!;
    const horas = calcularHorasSemana([pasada, bloqueada, futura], semanaInicio, semanaFin, AHORA);
    expect(horas).toBe(1);
  });

  it("excluye reservas fuera del rango de la semana", () => {
    const fueraDeRango = procesarUna({ id: "fuera", fecha: "2026-01-12", hora_inicio: "09:00:00", hora_fin: "10:00:00" })!;
    const horas = calcularHorasSemana([fueraDeRango], semanaInicio, semanaFin, AHORA);
    expect(horas).toBe(0);
  });
});

describe("calcularOcupacionHoy", () => {
  it("calcula el porcentaje jugado/total de hoy, excluyendo bloqueos", () => {
    const jugada = procesarUna({ id: "j", fecha: "2026-01-07", hora_inicio: "09:00:00", hora_fin: "10:00:00" })!;
    const pendiente = procesarUna({ id: "p", fecha: "2026-01-07", hora_inicio: "20:00:00", hora_fin: "21:00:00" })!;
    const bloqueo = procesarUna({ id: "b", fecha: "2026-01-07", bloqueado: true })!;
    const resultado = calcularOcupacionHoy([jugada, pendiente, bloqueo], "2026-01-07", AHORA);
    expect(resultado.reservasHoy).toHaveLength(2);
    expect(resultado.reservasHoyJugadas).toHaveLength(1);
    expect(resultado.ocupacionHoyPct).toBe(50);
  });

  it("0% cuando no hay reservas hoy (evita división por cero)", () => {
    const resultado = calcularOcupacionHoy([], "2026-01-07", AHORA);
    expect(resultado.ocupacionHoyPct).toBe(0);
  });
});

describe("calcularPendientesUrgentes", () => {
  it("incluye solo pendientes no bloqueadas y no jugadas todavía", () => {
    const pendiente = procesarUna({ id: "pend", fecha: "2026-01-10", confirmada: false })!;
    const confirmada = procesarUna({ id: "conf", fecha: "2026-01-10", confirmada: true })!;
    const bloqueada = procesarUna({ id: "bloq", fecha: "2026-01-10", bloqueado: true, confirmada: false })!;
    const pasada = procesarUna({ id: "pasada", fecha: "2026-01-01", confirmada: false, hora_inicio: "09:00:00", hora_fin: "10:00:00" })!;
    const out = calcularPendientesUrgentes([pendiente, confirmada, bloqueada, pasada], AHORA);
    expect(out.map((r) => r.id)).toEqual(["pend"]);
  });
});

describe("calcularSplitPago", () => {
  it("todo efectivo", () => {
    expect(calcularSplitPago("efectivo", 20000, 0, 0)).toEqual({ efectivo: 20000, transferencia: 0 });
  });

  it("todo transferencia", () => {
    expect(calcularSplitPago("transferencia", 20000, 0, 0)).toEqual({ efectivo: 0, transferencia: 20000 });
  });

  it("mixto usa los montos cargados, no el precio", () => {
    expect(calcularSplitPago("mixto", 20000, 12000, 8000)).toEqual({ efectivo: 12000, transferencia: 8000 });
  });

  it("mixto con desajuste: no fuerza que sumen el precio (paridad legacy, sin validación nueva)", () => {
    expect(calcularSplitPago("mixto", 20000, 5000, 5000)).toEqual({ efectivo: 5000, transferencia: 5000 });
  });

  it("precio 0", () => {
    expect(calcularSplitPago("efectivo", 0, 0, 0)).toEqual({ efectivo: 0, transferencia: 0 });
  });
});

// E4.3.1 — espejo del lado del cliente de reservas_pago_no_supera_precio_check.
// Pendiente ($0), parcial y exacto tienen que seguir dando false: el único
// caso que bloqueamos es sobrepago real.
describe("esSobrepago", () => {
  it("pago exacto no es sobrepago", () => {
    expect(esSobrepago(20000, 20000, 0)).toBe(false);
  });

  it("pago parcial (menor al precio) no es sobrepago", () => {
    expect(esSobrepago(20000, 5000, 10000)).toBe(false);
  });

  it("pago pendiente ($0) no es sobrepago", () => {
    expect(esSobrepago(20000, 0, 0)).toBe(false);
  });

  it("pago mayor al precio es sobrepago", () => {
    expect(esSobrepago(20000, 15000, 6000)).toBe(true);
  });

  it("sobrepago en un solo medio de pago (todo efectivo, por encima del precio)", () => {
    expect(esSobrepago(20000, 25000, 0)).toBe(true);
  });
});

describe("determinarEstadoInicialPago", () => {
  it("sin pagos previos, arranca en modo efectivo con el precio precargado", () => {
    const estado = determinarEstadoInicialPago({ precio: 20000, pago_efectivo: 0, pago_transferencia: 0 });
    expect(estado).toEqual({ modo: "efectivo", montoEfectivo: 20000, montoTransferencia: 0 });
  });

  it("con ambos montos cargados, detecta modo mixto", () => {
    const estado = determinarEstadoInicialPago({ precio: 20000, pago_efectivo: 12000, pago_transferencia: 8000 });
    expect(estado.modo).toBe("mixto");
  });

  it("con solo transferencia cargada, detecta modo transferencia", () => {
    const estado = determinarEstadoInicialPago({ precio: 20000, pago_efectivo: 0, pago_transferencia: 20000 });
    expect(estado.modo).toBe("transferencia");
  });
});

describe("formatearBadgeFecha", () => {
  it("formatea con día abreviado y ceros a la izquierda", () => {
    expect(formatearBadgeFecha("2026-01-07")).toBe("MIÉ 07/01");
  });
});

describe("obtenerRangoSemana / obtenerLunes", () => {
  it("si hoy es lunes, la semana arranca hoy mismo", () => {
    const lunes = new Date("2026-01-05T10:00:00-03:00").getTime();
    expect(obtenerRangoSemana(lunes)).toEqual({ inicio: "2026-01-05", fin: "2026-01-11" });
  });

  it("si hoy es domingo, la semana arranca el lunes anterior (cruce de año)", () => {
    const domingo = new Date("2026-01-04T10:00:00-03:00").getTime();
    expect(obtenerRangoSemana(domingo)).toEqual({ inicio: "2025-12-29", fin: "2026-01-04" });
  });

  it("cruce de mes dentro de la misma semana", () => {
    const miercoles = new Date("2026-01-28T10:00:00-03:00").getTime();
    expect(obtenerRangoSemana(miercoles)).toEqual({ inicio: "2026-01-26", fin: "2026-02-01" });
  });

  it("cruce de año explícito (fin de diciembre)", () => {
    const finDeAnio = new Date("2025-12-31T10:00:00-03:00").getTime();
    expect(obtenerRangoSemana(finDeAnio)).toEqual({ inicio: "2025-12-29", fin: "2026-01-04" });
  });

  it("obtenerLunes con offset navega semanas hacia adelante/atrás", () => {
    const base = new Date("2026-01-07T10:00:00-03:00").getTime();
    expect(obtenerLunes(base, 1).getDate()).toBe(12);
    expect(obtenerLunes(base, -1).getDate()).toBe(29);
  });
});

describe("obtenerRangoUltimosDias — D4 (picker de reservas para venta atada)", () => {
  it("7 días = hoy + los 6 días calendario anteriores", () => {
    const miercoles = new Date("2026-01-07T15:00:00-03:00").getTime();
    expect(obtenerRangoUltimosDias(miercoles, 7)).toEqual({ inicio: "2026-01-01", fin: "2026-01-07" });
  });

  it("cruce de mes", () => {
    const ahora = new Date("2026-02-03T10:00:00-03:00").getTime();
    expect(obtenerRangoUltimosDias(ahora, 7)).toEqual({ inicio: "2026-01-28", fin: "2026-02-03" });
  });

  it("cruce de año", () => {
    const ahora = new Date("2026-01-02T10:00:00-03:00").getTime();
    expect(obtenerRangoUltimosDias(ahora, 7)).toEqual({ inicio: "2025-12-27", fin: "2026-01-02" });
  });

  it("dias=1 devuelve un solo día (hoy)", () => {
    const ahora = new Date("2026-01-07T15:00:00-03:00").getTime();
    expect(obtenerRangoUltimosDias(ahora, 1)).toEqual({ inicio: "2026-01-07", fin: "2026-01-07" });
  });

  it("la hora exacta de `ahora` dentro del día no cambia el resultado", () => {
    const madrugada = new Date("2026-01-07T00:05:00-03:00").getTime();
    const nochePasada = new Date("2026-01-07T23:55:00-03:00").getTime();
    expect(obtenerRangoUltimosDias(madrugada, 7)).toEqual(obtenerRangoUltimosDias(nochePasada, 7));
  });
});

describe("marcarConfirmada", () => {
  it("marca confirmada=true solo la reserva con el id indicado", () => {
    const a = procesarUna({ id: "a", confirmada: false })!;
    const b = procesarUna({ id: "b", confirmada: false })!;
    const resultado = marcarConfirmada([a, b], "a");
    expect(resultado.find((r) => r.id === "a")?.confirmada).toBe(true);
    expect(resultado.find((r) => r.id === "b")?.confirmada).toBe(false);
  });

  it("no toca la referencia de las reservas no afectadas", () => {
    const a = procesarUna({ id: "a", confirmada: false })!;
    const b = procesarUna({ id: "b", confirmada: false })!;
    const resultado = marcarConfirmada([a, b], "a");
    expect(resultado).not.toBe([a, b]);
    expect(resultado[0]).not.toBe(a);
    expect(resultado[1]).toBe(b);
  });

  it("id inexistente devuelve un array nuevo con el mismo contenido", () => {
    const a = procesarUna({ id: "a", confirmada: false })!;
    const resultado = marcarConfirmada([a], "no-existe");
    expect(resultado).not.toBe([a]);
    expect(resultado).toEqual([a]);
  });
});

describe("quitarPorId", () => {
  it("quita solo la reserva con el id indicado", () => {
    const a = procesarUna({ id: "a" })!;
    const b = procesarUna({ id: "b" })!;
    const resultado = quitarPorId([a, b], "a");
    expect(resultado).toEqual([b]);
  });

  it("id inexistente devuelve un array nuevo con el mismo contenido", () => {
    const a = procesarUna({ id: "a" })!;
    const resultado = quitarPorId([a], "no-existe");
    expect(resultado).not.toBe([a]);
    expect(resultado).toEqual([a]);
  });
});

describe("textoPago", () => {
  it("sin efectivo ni transferencia: pago sin registrar", () => {
    expect(textoPago({ pago_efectivo: 0, pago_transferencia: 0 })).toBe("Pago sin registrar");
  });

  it("solo efectivo", () => {
    expect(textoPago({ pago_efectivo: 20000, pago_transferencia: 0 })).toBe("Efectivo $20.000");
  });

  it("solo transferencia", () => {
    expect(textoPago({ pago_efectivo: 0, pago_transferencia: 15000 })).toBe("Transferencia $15.000");
  });

  it("mixto: efectivo y transferencia combinados", () => {
    expect(textoPago({ pago_efectivo: 5000, pago_transferencia: 15000 })).toBe(
      "Mixto: $5.000 ef. + $15.000 transf.",
    );
  });
});

describe("aplicarPago", () => {
  it("modo efectivo: actualiza pago_efectivo/pago_transferencia solo de la reserva indicada", () => {
    const a = procesarUna({ id: "a", pago_efectivo: 0, pago_transferencia: 0 })!;
    const b = procesarUna({ id: "b", pago_efectivo: 0, pago_transferencia: 0 })!;
    const resultado = aplicarPago([a, b], "a", { efectivo: 20000, transferencia: 0 });
    expect(resultado.find((r) => r.id === "a")).toMatchObject({ pago_efectivo: 20000, pago_transferencia: 0 });
    expect(resultado.find((r) => r.id === "b")).toBe(b);
  });

  it("modo transferencia", () => {
    const a = procesarUna({ id: "a", pago_efectivo: 0, pago_transferencia: 0 })!;
    const resultado = aplicarPago([a], "a", { efectivo: 0, transferencia: 20000 });
    expect(resultado[0]).toMatchObject({ pago_efectivo: 0, pago_transferencia: 20000 });
  });

  it("modo mixto", () => {
    const a = procesarUna({ id: "a", pago_efectivo: 0, pago_transferencia: 0 })!;
    const resultado = aplicarPago([a], "a", { efectivo: 5000, transferencia: 15000 });
    expect(resultado[0]).toMatchObject({ pago_efectivo: 5000, pago_transferencia: 15000 });
  });

  it("preserva el resto de los campos de la reserva afectada", () => {
    const a = procesarUna({ id: "a", nombre: "Juan", precio: 20000 })!;
    const resultado = aplicarPago([a], "a", { efectivo: 20000, transferencia: 0 });
    expect(resultado[0]).toMatchObject({ nombre: "Juan", precio: 20000 });
  });

  it("id inexistente devuelve un array nuevo con el mismo contenido", () => {
    const a = procesarUna({ id: "a" })!;
    const resultado = aplicarPago([a], "no-existe", { efectivo: 1, transferencia: 1 });
    expect(resultado).not.toBe([a]);
    expect(resultado).toEqual([a]);
  });
});

describe("fechaFueraDeRangoCargado", () => {
  const HOY = "2026-01-07";

  it("sin fecha: false", () => {
    expect(fechaFueraDeRangoCargado("", "2025-12-01", HOY)).toBe(false);
  });

  it("fecha de hoy: false (siempre cubierta por Próximos)", () => {
    expect(fechaFueraDeRangoCargado(HOY, "2025-12-01", HOY)).toBe(false);
  });

  it("fecha futura: false", () => {
    expect(fechaFueraDeRangoCargado("2026-02-01", "2025-12-01", HOY)).toBe(false);
  });

  it("fecha pasada dentro del histórico ya cargado: false", () => {
    expect(fechaFueraDeRangoCargado("2025-12-15", "2025-12-01", HOY)).toBe(false);
  });

  it("fecha pasada anterior al histórico ya cargado: true", () => {
    expect(fechaFueraDeRangoCargado("2025-11-20", "2025-12-01", HOY)).toBe(true);
  });

  it("sin semana más antigua cargada todavía (null): fecha pasada siempre está fuera de rango", () => {
    expect(fechaFueraDeRangoCargado("2025-12-15", null, HOY)).toBe(true);
  });
});

describe("construirLinkWhatsapp", () => {
  it("arma el link wa.me con teléfono limpio y mensaje pre-armado", () => {
    const r = { nombre: "Juan", fecha: "2026-01-07", horaInicio: "10:00", horaFin: "11:00", telefono: "3771111111" };
    const link = construirLinkWhatsapp(r, "Los amigos padel");
    expect(link).toMatch(/^https:\/\/wa\.me\/5493771111111\?text=/);
    const texto = decodeURIComponent(link.split("?text=")[1]);
    expect(texto).toBe(
      "Hola Juan! Te escribo por tu turno del MIÉ 07/01 de 10:00 a 11:00 en Los amigos padel. " +
        "Te confirmo el turno. ¡Gracias!",
    );
  });
});

describe("mensajeErrorReserva — FINAL-F4", () => {
  it("reserva con ventas: mensaje de trazabilidad, sin prometer una salida que hoy no existe", () => {
    const m = mensajeErrorReserva({ message: "reserva_con_ventas" }, "cancelar");
    expect(m).toBe("Esta reserva tiene ventas asociadas y no puede eliminarse para preservar la trazabilidad.");
    expect(m).toBe(MENSAJE_RESERVA_CON_VENTAS);
    expect(m).not.toMatch(/resolv/i);
  });

  it("reserva solo con pagos: pide registrar el reintegro", () => {
    expect(mensajeErrorReserva({ message: "reserva_con_pagos" }, "cancelar")).toBe(
      "Esta reserva tiene dinero cobrado. Registrá el reintegro desde Pago antes de cancelarla (el historial se conserva).",
    );
    expect(MENSAJE_RESERVA_CON_PAGOS).toContain("reintegro");
  });

  it("el mensaje de PostgREST puede traer texto extra: se detecta igual", () => {
    expect(mensajeErrorReserva({ message: "P0001: reserva_con_ventas (detalle)" }, "cancelar")).toBe(MENSAJE_RESERVA_CON_VENTAS);
  });

  it("reserva inexistente: mensaje específico por acción, nunca el genérico de reintento", () => {
    const e = { message: ERROR_RESERVA_INEXISTENTE };
    expect(mensajeErrorReserva(e, "confirmar")).toMatch(/ya no existe.*No se confirmó/);
    expect(mensajeErrorReserva(e, "cancelar")).toMatch(/ya no existe/);
    expect(mensajeErrorReserva(e, "desbloquear")).toMatch(/bloqueo ya no existe/);
    expect(mensajeErrorReserva(e, "pago")).toMatch(/el pago no se guardó/);
  });

  it("sobrepago solo aplica al pago (E4.3.1 conservado)", () => {
    const e = { message: 'new row violates check constraint "reservas_pago_no_supera_precio_check"' };
    expect(mensajeErrorReserva(e, "pago")).toBe("El pago no puede superar el precio de la reserva.");
    expect(mensajeErrorReserva(e, "cancelar")).toBe("No se pudo cancelar. Probá de nuevo.");
  });

  it("error desconocido / sin mensaje: genérico por acción (mismos textos de antes)", () => {
    expect(mensajeErrorReserva({ message: "fallo" }, "confirmar")).toBe("No se pudo confirmar. Probá de nuevo.");
    expect(mensajeErrorReserva({ message: "fallo" }, "cancelar")).toBe("No se pudo cancelar. Probá de nuevo.");
    expect(mensajeErrorReserva({ message: "fallo" }, "desbloquear")).toBe("No se pudo desbloquear. Probá de nuevo.");
    expect(mensajeErrorReserva(undefined, "pago")).toBe("No se pudo guardar el pago. Probá de nuevo.");
  });

  it("los mensajes de dinero no se filtran a confirmar/pago", () => {
    expect(mensajeErrorReserva({ message: "reserva_con_ventas" }, "confirmar")).toBe("No se pudo confirmar. Probá de nuevo.");
  });
});


describe("vencimiento y contabilidad", () => {
  it.each([{ pago_efectivo: 500 }, { pago_transferencia: 500 }, { ventas: [{ count: 1 }] }])("conserva movimiento %j sin ocupar cancha", (movimiento) => {
    const r = crearReserva({ ...movimiento, creado: "2020-01-01T00:00:00Z", hora_apertura_vigente: "08:00:00" });
    const { visibles: vigentes, conservadas } = procesarReservas([r], AHORA);
    expect(conservadas).toHaveLength(1);
    expect(vigentes).toHaveLength(1);
    expect(procesarReservasGrilla([r], AHORA)).toEqual([]);
    expect(filtrarReservasParaReporte([r], AHORA)).toEqual([r]);
    // FINAL-F6: Caja ya no suma el snapshot de reservas (suma movimientos);
    // acá se garantiza que la reserva con dinero sigue VISIBLE.
    expect(tieneMovimientoContable(r)).toBe(true);
    expect(calcularHorasSemana(vigentes, "2026-01-05", "2026-01-11", AHORA)).toBe(0);
  });
});
