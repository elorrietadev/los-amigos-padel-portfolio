import { describe, expect, it } from "vitest";
import { normalizarTelefonoArgentino } from "./telefono";

// PHONE-FIX — los 5 formatos del pedido original: representan el mismo
// celular argentino y deben normalizar a la misma forma canónica de 10
// dígitos.
describe("normalizarTelefonoArgentino — formatos equivalentes", () => {
  const CANONICO = "3775550100";

  it("ya en forma canónica (10 dígitos)", () => {
    expect(normalizarTelefonoArgentino("3775550100")).toBe(CANONICO);
  });

  it("con espacios y guiones", () => {
    expect(normalizarTelefonoArgentino("3775 55-0100")).toBe(CANONICO);
  });

  it("con +54 9 (celular, formato internacional completo)", () => {
    expect(normalizarTelefonoArgentino("+54 9 3775 55-0100")).toBe(CANONICO);
  });

  it("con +54 sin el 9", () => {
    expect(normalizarTelefonoArgentino("+54 3775 55-0100")).toBe(CANONICO);
  });

  it("con prefijo móvil viejo 15 (sin 0 ni +54) — antes era rechazado", () => {
    expect(normalizarTelefonoArgentino("377515550100")).toBe(CANONICO);
  });

  it("con 0 inicial + prefijo 15", () => {
    expect(normalizarTelefonoArgentino("0377515550100")).toBe(CANONICO);
  });

  it("con +54 9 y prefijo 15 (redundante pero se resuelve igual)", () => {
    expect(normalizarTelefonoArgentino("+54 9 3775 15 55-0100")).toBe(CANONICO);
  });
});

describe("normalizarTelefonoArgentino — inválidos, no inventa números incompletos", () => {
  it("vacío", () => {
    expect(normalizarTelefonoArgentino("")).toBeNull();
  });

  it("solo letras (sin dígitos)", () => {
    expect(normalizarTelefonoArgentino("abcdefghij")).toBeNull();
  });

  it("muy corto (9 dígitos)", () => {
    expect(normalizarTelefonoArgentino("377550336")).toBeNull();
  });

  it("largo sin sentido (14 dígitos, no matchea ningún patrón conocido)", () => {
    expect(normalizarTelefonoArgentino("12345678901234")).toBeNull();
  });

  it("12 dígitos con el '15' en una posición ambigua (2 posibles cortes): no se adivina", () => {
    // "37" + "15" + "15" + "550100" — matchea "15" tanto tomando área de 2
    // dígitos ("37") como de 4 ("3715"): son 2 coincidencias (aunque el
    // resultado final coincida en ambos cortes), y la función rechaza
    // cualquier caso con más de 1 coincidencia por diseño, sin adivinar.
    expect(normalizarTelefonoArgentino("371515550100")).toBeNull();
  });

  it("12 dígitos sin ningún '15' en posición de corte válida", () => {
    expect(normalizarTelefonoArgentino("377512345678")).toBeNull();
  });
});
