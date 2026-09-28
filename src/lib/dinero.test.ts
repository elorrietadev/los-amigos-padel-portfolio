import { describe, expect, it } from "vitest";
import { aCentavos, desdeCentavos, formatearCentavos, parsearMontoInput, sumarCentavos } from "./dinero";

describe("dinero en centavos", () => {
  it("aCentavos absorbe el error binario de valores con 2 decimales", () => {
    expect(aCentavos(6172.83)).toBe(617283);
    expect(aCentavos("6172.84")).toBe(617284);
    expect(aCentavos(0.1 + 0.2)).toBe(30);
    expect(aCentavos(null)).toBe(0);
    expect(aCentavos(undefined)).toBe(0);
    expect(aCentavos("")).toBe(0);
    expect(aCentavos(-2500.5)).toBe(-250050);
  });
  it("sumarCentavos es exacto donde la suma float no lo es", () => {
    const xs = [10000.1, 20000.2];
    expect(xs.reduce((a, b) => a + b, 0)).not.toBe(30000.3); // el problema real
    expect(sumarCentavos(xs, (x) => x)).toBe(3000030);
    expect(desdeCentavos(3000030)).toBe(30000.3);
  });
  it("parsearMontoInput: acepta coma o punto, máx. 2 decimales; rechaza basura y negativos", () => {
    expect(parsearMontoInput("")).toBe(0);
    expect(parsearMontoInput("1500")).toBe(150000);
    expect(parsearMontoInput("1500,5")).toBe(150050);
    expect(parsearMontoInput("1500.55")).toBe(150055);
    expect(parsearMontoInput("1500.555")).toBeNull();
    expect(parsearMontoInput("-1")).toBeNull();
    expect(parsearMontoInput("1e3")).toBeNull();
    expect(parsearMontoInput("abc")).toBeNull();
  });
  it("formatearCentavos muestra centavos solo si existen", () => {
    expect(formatearCentavos(2000000)).toBe("$20.000");
    expect(formatearCentavos(250050)).toBe("$2.500,50");
    expect(formatearCentavos(0)).toBe("$0");
  });
});
