/** @vitest-environment jsdom */
// Tests de useLineaAhora (R3.1) — posición de la línea de "hora actual".
// Puramente derivado de la hora del sistema + el rango horario de la
// grilla, sin tocar nada de reservas/turnos fijos.

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLineaAhora } from "./AgendaColumnaDia";

const APERTURA_MIN = 8 * 60; // 08:00
const CANTIDAD_FILAS = 34; // 08:00 .. 01:00 del día siguiente, cada 30min
const SLOT_PX = 32;

afterEach(() => {
  vi.useRealTimers();
});

describe("useLineaAhora", () => {
  it("inactivo (otra semana): no devuelve nada, aunque la hora esté dentro del rango", () => {
    vi.setSystemTime(new Date("2026-06-03T10:00:00"));
    const { result } = renderHook(() => useLineaAhora(false, APERTURA_MIN, CANTIDAD_FILAS, SLOT_PX));
    expect(result.current).toBeNull();
  });

  it("activo, dentro del horario: fecha de hoy y offset correcto (10:00 -> 2h después de apertura)", () => {
    vi.setSystemTime(new Date("2026-06-03T10:00:00"));
    const { result } = renderHook(() => useLineaAhora(true, APERTURA_MIN, CANTIDAD_FILAS, SLOT_PX));
    expect(result.current).toEqual({ fechaISO: "2026-06-03", topPx: 4 * SLOT_PX }); // (10:00-08:00)=120min = 4 slots
  });

  it("activo, justo en la apertura: offset 0", () => {
    vi.setSystemTime(new Date("2026-06-03T08:00:00"));
    const { result } = renderHook(() => useLineaAhora(true, APERTURA_MIN, CANTIDAD_FILAS, SLOT_PX));
    expect(result.current).toEqual({ fechaISO: "2026-06-03", topPx: 0 });
  });

  it("activo, después de medianoche y antes de la apertura: pertenece a la columna del día ANTERIOR", () => {
    vi.setSystemTime(new Date("2026-06-04T00:30:00")); // jueves 00:30 -> columna del miércoles
    const { result } = renderHook(() => useLineaAhora(true, APERTURA_MIN, CANTIDAD_FILAS, SLOT_PX));
    // 00:30 = 30min reales -> extendido = 30+1440 = 1470min; apertura=480 -> (1470-480)/30 = 33 slots
    expect(result.current).toEqual({ fechaISO: "2026-06-03", topPx: 33 * SLOT_PX });
  });

  it("activo, fuera del rango operativo (ya cerrado): no devuelve nada", () => {
    vi.setSystemTime(new Date("2026-06-04T02:00:00")); // 02:00, después del cierre (01:00)
    const { result } = renderHook(() => useLineaAhora(true, APERTURA_MIN, CANTIDAD_FILAS, SLOT_PX));
    expect(result.current).toBeNull();
  });

  it("activo, mucho antes de abrir en el mismo día calendario (ej. 03:00, no es la madrugada del cierre): no devuelve nada", () => {
    vi.setSystemTime(new Date("2026-06-03T03:00:00"));
    const { result } = renderHook(() => useLineaAhora(true, APERTURA_MIN, CANTIDAD_FILAS, SLOT_PX));
    expect(result.current).toBeNull();
  });
});
