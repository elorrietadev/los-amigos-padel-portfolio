// Test de CONTRATO DE TIPOS (no de lógica de negocio): confirma que la RPC
// pública crear_reserva ya no acepta ningún precio del cliente. C2 eliminó
// p_precio (que antes viajaba pero el servidor lo ignoraba por completo) y
// CrearReservaArgs se deriva 1:1 del codegen real de Supabase — si alguien
// reintrodujera p_precio a mano en un caller, o si la RPC real volviera a
// aceptarlo y se regenerara database.types.ts, este archivo deja de compilar
// (falla en `npm run build`/`tsc -b`, no en runtime).
import { describe, expect, it } from "vitest";
import type { CrearReservaArgs } from "./reservations.types";

describe("CrearReservaArgs (contrato de tipos, C2)", () => {
  it("solo tiene los 5 campos reales de la firma actual de crear_reserva", () => {
    const args: CrearReservaArgs = {
      p_fecha: "2026-01-01",
      p_hora_inicio: "10:00",
      p_hora_fin: "11:00",
      p_nombre: "Test",
      p_telefono: "3775000000",
    };
    expect(Object.keys(args).sort()).toEqual(
      ["p_fecha", "p_hora_fin", "p_hora_inicio", "p_nombre", "p_telefono"].sort(),
    );
  });

  it("no compila si se intenta mandar p_precio (excess property check)", () => {
    const conPrecio: CrearReservaArgs = {
      p_fecha: "2026-01-01",
      p_hora_inicio: "10:00",
      p_hora_fin: "11:00",
      p_nombre: "Test",
      p_telefono: "3775000000",
      // @ts-expect-error p_precio ya no existe en la firma real de
      // crear_reserva (C2) — si este error deja de ocurrir, es porque
      // p_precio volvió a aparecer en el tipo generado, y la build tiene
      // que fallar acá.
      p_precio: 20000,
    };
    expect(conPrecio).toBeDefined();
  });
});
