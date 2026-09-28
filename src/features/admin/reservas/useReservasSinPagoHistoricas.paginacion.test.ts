/** @vitest-environment jsdom */
// H2 — la campana lee 8 semanas de reservas. PostgREST corta cada respuesta en
// max-rows (1000 en Supabase) y, como la query ordena por fecha ascendente, lo
// que se perdía eran justamente las semanas MÁS RECIENTES. Acá corre el hook y
// la API reales contra un query builder falso que aplica ese tope.

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AHORA, crearReserva } from "../notificaciones/notificaciones.fixtures";
import { reservasJugadasSinPago } from "../notificaciones/notificaciones.logic";
import type { ReservaProcesada } from "./reservas.types";

const MAX_ROWS = 1000;

const db = vi.hoisted(() => ({
  filas: [] as Record<string, unknown>[],
  // Se ejecuta antes de resolver cada página (para simular escrituras concurrentes).
  antesDePagina: null as null | ((nroPagina: number) => void),
  paginas: 0,
}));

vi.mock("../../../lib/supabase", () => {
  function query() {
    const filtros: ((r: Record<string, unknown>) => boolean)[] = [];
    const orden: string[] = [];
    let desde = 0;
    let hasta = Number.POSITIVE_INFINITY;
    const b = {
      select: () => b,
      gte: (c: string, v: string) => { filtros.push((r) => String(r[c]) >= v); return b; },
      lte: (c: string, v: string) => { filtros.push((r) => String(r[c]) <= v); return b; },
      order: (c: string) => { orden.push(c); return b; },
      range: (a: number, z: number) => { desde = a; hasta = z; return b; },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        db.antesDePagina?.(db.paginas);
        db.paginas++;
        const filas = db.filas
          .filter((r) => filtros.every((f) => f(r)))
          .sort((x, y) => {
            for (const c of orden) {
              const a = String(x[c]), z = String(y[c]);
              if (a !== z) return a < z ? -1 : 1;
            }
            return 0;
          })
          // range() inclusivo + tope de PostgREST por respuesta
          .slice(desde, Math.min(hasta + 1, desde + MAX_ROWS));
        return Promise.resolve({ data: filas, error: null }).then(ok, ko);
      },
    };
    return b;
  }
  return { supabase: { from: () => query() } };
});

import { aplicarPago } from "./reservas.logic";
import { obtenerReservasPorRango, obtenerReservasPorRangoCompleto } from "./reservas.api";
import { useReservasSinPagoHistoricas } from "./useReservasSinPagoHistoricas";

// Ventana con AHORA = mié 17/06/2026: lun 20/04 → dom 14/06 (56 días).
const INICIO = "2026-04-20";
const FIN = "2026-06-14";
const ULTIMA_SEMANA = ["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14"];

function dias(desde: string, n: number): string[] {
  const d = new Date(`${desde}T12:00:00`);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  });
}

// 56 días x 40 turnos = 2240 reservas jugadas sin pago dentro de las 8 semanas,
// más una fila de la semana actual y una anterior a la ventana (no deben venir).
function sembrar(): ReservaProcesada[] {
  const filas: ReservaProcesada[] = [];
  for (const fecha of dias(INICIO, 56)) {
    for (let i = 0; i < 40; i++) {
      const hi = `${String(8 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}:00`;
      filas.push(crearReserva({ id: `${fecha}-${String(i).padStart(2, "0")}`, fecha, hora_inicio: hi, hora_fin: hi }));
    }
  }
  filas.push(crearReserva({ id: "semana-actual", fecha: "2026-06-16" }));
  filas.push(crearReserva({ id: "fuera-de-ventana", fecha: "2026-04-19" }));
  db.filas = filas as unknown as Record<string, unknown>[];
  return filas;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  db.antesDePagina = null;
  db.paginas = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("H2 — notificaciones históricas con más de 1000 filas", () => {
  it("control: la query SIN paginar se trunca en 1000 y pierde las semanas más recientes", async () => {
    sembrar();
    const { data } = await obtenerReservasPorRango(INICIO, FIN);
    expect(data).toHaveLength(MAX_ROWS);
    expect(data!.some((r) => ULTIMA_SEMANA.includes(r.fecha))).toBe(false);
  });

  it("trae las 2240 filas del rango: sin truncar, sin duplicados, con la última semana", async () => {
    sembrar();
    const { result } = renderHook(() => useReservasSinPagoHistoricas());
    await waitFor(() => expect(result.current.data).toHaveLength(56 * 40));

    const ids = result.current.data.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fecha of ULTIMA_SEMANA) expect(result.current.data.filter((r) => r.fecha === fecha)).toHaveLength(40);
    expect(ids).not.toContain("semana-actual");
    expect(ids).not.toContain("fuera-de-ventana");
    expect(db.paginas).toBeGreaterThan(2); // realmente paginó (500 por página)
  });

  it("badge: cuenta todos los turnos sin pago de las 8 semanas; pagar uno lo saca", async () => {
    sembrar();
    const { result } = renderHook(() => useReservasSinPagoHistoricas());
    await waitFor(() => expect(result.current.data).toHaveLength(56 * 40));
    expect(reservasJugadasSinPago(result.current.data, AHORA)).toHaveLength(56 * 40);

    act(() => result.current.actualizarLocal((prev) => aplicarPago(prev, "2026-06-14-39", { efectivo: 20000, transferencia: 0 })));

    const sinPago = reservasJugadasSinPago(result.current.data, AHORA);
    expect(sinPago).toHaveLength(56 * 40 - 1);
    expect(sinPago.map((r) => r.id)).not.toContain("2026-06-14-39");
  });

  it("una fila que entra entre página y página no duplica resultados (corrimiento de offset)", async () => {
    const originales = [...sembrar()];
    // La fila nueva cae antes del offset ya leído: esta carga no la ve (la trae
    // la próxima recarga), pero NINGUNA fila existente se pierde ni se duplica.
    db.antesDePagina = (n) => {
      if (n === 1) db.filas.push(crearReserva({ id: "0-nueva", fecha: INICIO, hora_inicio: "07:00:00" }) as unknown as Record<string, unknown>);
    };
    const { data } = await obtenerReservasPorRangoCompleto(INICIO, FIN);
    const ids = data!.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const enRango = originales.filter((r) => r.fecha >= INICIO && r.fecha <= FIN).map((r) => r.id);
    expect(enRango.every((id) => ids.includes(id))).toBe(true);
  });
});
