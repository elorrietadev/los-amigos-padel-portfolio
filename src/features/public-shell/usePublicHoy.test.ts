/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConfiguracionCanchaPublicaRow,
  FranjaOperativaRow,
} from "../reservations-public/reservations.types";
import { usePublicHoy } from "./usePublicHoy";

const obtenerFranjaOperativaMock = vi.hoisted(() => vi.fn());
const obtenerConfiguracionReservasMock = vi.hoisted(() => vi.fn());
const obtenerTurnosFijosPublicosMock = vi.hoisted(() => vi.fn());
const obtenerExcepcionesTurnoFijoMock = vi.hoisted(() => vi.fn());
const obtenerReservasPublicasPorFechaMock = vi.hoisted(() => vi.fn());

vi.mock("../reservations-public/reservations.api", () => ({
  obtenerFranjaOperativa: obtenerFranjaOperativaMock,
  obtenerConfiguracionReservas: obtenerConfiguracionReservasMock,
  obtenerTurnosFijosPublicos: obtenerTurnosFijosPublicosMock,
  obtenerExcepcionesTurnoFijo: obtenerExcepcionesTurnoFijoMock,
  obtenerReservasPublicasPorFecha: obtenerReservasPublicasPorFechaMock,
}));

const CONFIG_ROW: ConfiguracionCanchaPublicaRow = {
  duracion_minima_minutos: 60,
  duracion_maxima_minutos: 180,
  anticipacion_maxima_dias: 14,
  anticipacion_minima_minutos: 0,
  limite_reservas_activas_telefono: 3,
  cancelacion_horas_minimas: 4,
};

function franjaAbiertaTodoElDia(): FranjaOperativaRow[] {
  return [{ cerrado: false, hora_apertura: "00:00:00", hora_cierre: "23:59:00" }];
}

// usePublicHoy usa la hora real (new Date()) tanto para `fecha` (hoyISO) como
// para `abierta`/`horarios` (horasInicioDisponibles). Corrido cerca de la
// medianoche real, "horarios" puede quedar vacío (ver horasInicioDisponibles
// en reservations.logic.ts: `esHoy && t < corteMin` descarta todos los
// candidatos cuando ya pasaron las ~22:30) y el test 2 flaquea. Se fija un
// reloj estable — 15:00, hora de Buenos Aires, lejos de cualquier borde de
// apertura/cierre o de medianoche — sin tocar la lógica productiva.
const AHORA_ESTABLE = new Date(2026, 0, 15, 15, 0, 0);

beforeEach(() => {
  vi.setSystemTime(AHORA_ESTABLE);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

function mockearSinOcupacion() {
  obtenerTurnosFijosPublicosMock.mockResolvedValue({ data: [], error: null });
  obtenerExcepcionesTurnoFijoMock.mockResolvedValue({ data: [], error: null });
  obtenerReservasPublicasPorFechaMock.mockResolvedValue({ data: [], error: null });
}

describe("usePublicHoy", () => {
  it("día cerrado: sin horarios, cerrado=true, abierta=false, sin loading ni error", async () => {
    mockearSinOcupacion();
    obtenerFranjaOperativaMock.mockResolvedValue({
      data: [{ cerrado: true, hora_apertura: null, hora_cierre: null }],
      error: null,
    });
    obtenerConfiguracionReservasMock.mockResolvedValue({ data: CONFIG_ROW, error: null });

    const { result } = renderHook(() => usePublicHoy());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.cerrado).toBe(true);
    expect(result.current.abierta).toBe(false);
    expect(result.current.horarios).toEqual([]);
  });

  it("día abierto sin reservas: devuelve horarios reales calculados con la config real", async () => {
    mockearSinOcupacion();
    obtenerFranjaOperativaMock.mockResolvedValue({ data: franjaAbiertaTodoElDia(), error: null });
    obtenerConfiguracionReservasMock.mockResolvedValue({ data: CONFIG_ROW, error: null });

    const { result } = renderHook(() => usePublicHoy());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.cerrado).toBe(false);
    expect(result.current.horarios.length).toBeGreaterThan(0);
    expect(result.current.horarios.length).toBeLessThanOrEqual(3);
    // Todo horario devuelto respeta el paso de 30 min que usa
    // horasInicioDisponibles (reservations.logic.ts), sin inventar formato.
    for (const h of result.current.horarios) {
      expect(h).toMatch(/^\d{2}:(00|30)$/);
    }
  });

  it("falla la franja operativa: error=true, degrada a sin horarios (nunca inventa)", async () => {
    mockearSinOcupacion();
    obtenerFranjaOperativaMock.mockResolvedValue({ data: null, error: new Error("boom") });
    obtenerConfiguracionReservasMock.mockResolvedValue({ data: CONFIG_ROW, error: null });

    const { result } = renderHook(() => usePublicHoy());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.horarios).toEqual([]);
    expect(result.current.abierta).toBe(false);
  });
});
