import { describe, expect, it } from "vitest";
import { formatearMoneda, limpiarTelefonoWa, montosIguales } from "./format";

describe("limpiarTelefonoWa", () => {
  it("saca el 0 inicial", () => {
    expect(limpiarTelefonoWa("03775550100")).toBe("5493775550100");
  });

  it("respeta un número que ya tiene el prefijo 549 (celular)", () => {
    expect(limpiarTelefonoWa("5493775550100")).toBe("5493775550100");
  });

  it("respeta un número que ya tiene el prefijo 54 sin el 9 (fijo)", () => {
    expect(limpiarTelefonoWa("5411555512345")).toBe("5411555512345");
  });

  it("agrega el prefijo 549 si no tiene ninguno", () => {
    expect(limpiarTelefonoWa("3775550100")).toBe("5493775550100");
  });

  it("ignora espacios", () => {
    expect(limpiarTelefonoWa("377 555 0100")).toBe("5493775550100");
  });

  it("ignora guiones", () => {
    expect(limpiarTelefonoWa("377-555-0100")).toBe("5493775550100");
  });

  it("ignora paréntesis y puntos", () => {
    expect(limpiarTelefonoWa("(377) 555.0100")).toBe("5493775550100");
  });

  it("un número que ya trae un 54 real al principio no se toca (aunque no sea prefijo de país)", () => {
    // "+54" antes del número deja dígitos "54" reales, no solo separadores —
    // la función los toma como si ya fuera el prefijo 54 y no antepone 549.
    // Es el comportamiento real de la función, documentado acá para que no
    // sorprenda: no es un caso "correcto" de uso, es el límite real de la regla.
    expect(limpiarTelefonoWa("+54 (377) 555-0100")).toBe("543775550100");
  });

  it("un string vacío se mantiene vacío (no le agrega prefijo)", () => {
    expect(limpiarTelefonoWa("")).toBe("");
  });
});

describe("formatearMoneda", () => {
  it("formatea sin opciones igual que el patrón dominante del legacy ($ + toLocaleString es-AR)", () => {
    expect(formatearMoneda(20000)).toBe("$20.000");
  });

  it("formatea un monto con decimales sin opciones (comportamiento default de toLocaleString)", () => {
    // Valor literal verificado con: node -e "console.log((9166.666666).toLocaleString('es-AR'))"
    // -> "9.166,667" (3 decimales por default, no 2 — a diferencia de la variante con opciones).
    expect(formatearMoneda(9166.666666)).toBe("$9.166,667");
  });

  it("respeta maximumFractionDigits, igual que la calculadora de Reponer Stock", () => {
    expect(formatearMoneda(9166.666666, { maximumFractionDigits: 2 })).toBe("$9.166,67");
  });

  it("formatea 0 correctamente", () => {
    expect(formatearMoneda(0)).toBe("$0");
  });
});

describe("montosIguales", () => {
  it("montos idénticos -> true", () => {
    expect(montosIguales(10000, 10000)).toBe(true);
  });

  it("montos distintos -> false", () => {
    expect(montosIguales(10000, 10001)).toBe(false);
  });

  it("error de precisión de punto flotante no cuenta como desajuste (0.1 + 0.2 vs 0.3)", () => {
    expect(montosIguales(0.1 + 0.2, 0.3)).toBe(true);
  });

  it("compara con 2 decimales de precisión — una diferencia de 1 centavo sí cuenta", () => {
    expect(montosIguales(100.01, 100.02)).toBe(false);
  });

  it("una diferencia menor a 1 centavo (ruido de flotante) no cuenta", () => {
    expect(montosIguales(100.004999, 100)).toBe(true);
  });
});
