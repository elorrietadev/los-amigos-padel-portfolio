import { describe, expect, it } from "vitest";
import { cantidadDevolucionValida, esErrorDevolucionExcedeDisponible, medioReembolsoValido } from "./devoluciones.logic";

describe("medioReembolsoValido", () => {
  it("acepta 'efectivo' y 'transferencia'", () => {
    expect(medioReembolsoValido("efectivo")).toBe(true);
    expect(medioReembolsoValido("transferencia")).toBe(true);
  });

  it("rechaza cualquier otro valor", () => {
    expect(medioReembolsoValido("mixto")).toBe(false);
    expect(medioReembolsoValido("")).toBe(false);
    expect(medioReembolsoValido("Efectivo")).toBe(false);
  });
});

describe("cantidadDevolucionValida", () => {
  it("acepta cualquier entero entre 1 y el máximo, inclusive", () => {
    expect(cantidadDevolucionValida(1, 5)).toBe(true);
    expect(cantidadDevolucionValida(3, 5)).toBe(true);
    expect(cantidadDevolucionValida(5, 5)).toBe(true);
  });

  it("rechaza 0, negativos y valores por encima del máximo", () => {
    expect(cantidadDevolucionValida(0, 5)).toBe(false);
    expect(cantidadDevolucionValida(-1, 5)).toBe(false);
    expect(cantidadDevolucionValida(6, 5)).toBe(false);
  });

  it("rechaza decimales aunque estén dentro del rango", () => {
    expect(cantidadDevolucionValida(1.5, 5)).toBe(false);
  });
});

describe("esErrorDevolucionExcedeDisponible", () => {
  it("true solo con el mensaje exacto del RAISE EXCEPTION", () => {
    expect(esErrorDevolucionExcedeDisponible({ message: "devolucion_excede_disponible" })).toBe(true);
  });

  it("false para cualquier otro error, mensaje vacío o ausente", () => {
    expect(esErrorDevolucionExcedeDisponible({ message: "network" })).toBe(false);
    expect(esErrorDevolucionExcedeDisponible({ message: "" })).toBe(false);
    expect(esErrorDevolucionExcedeDisponible(null)).toBe(false);
    expect(esErrorDevolucionExcedeDisponible(undefined)).toBe(false);
  });
});
