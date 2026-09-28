/** @vitest-environment jsdom */
// Tests de useEsDesktop (R3). jsdom no implementa matchMedia (verificado a
// mano), así que el hook cae al fallback por window.innerWidth — estos tests
// ejercitan justamente esa rama, la que realmente corre en este entorno.

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEsDesktop } from "./useEsDesktop";

function setAncho(ancho: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: ancho });
}

afterEach(() => {
  setAncho(1024);
});

describe("useEsDesktop", () => {
  it("con innerWidth >= 1024 (default de jsdom), devuelve true", () => {
    setAncho(1024);
    const { result } = renderHook(() => useEsDesktop());
    expect(result.current).toBe(true);
  });

  it("con innerWidth < 1024, devuelve false", () => {
    setAncho(390);
    const { result } = renderHook(() => useEsDesktop());
    expect(result.current).toBe(false);
  });

  it("reacciona a un resize posterior", () => {
    setAncho(1024);
    const { result } = renderHook(() => useEsDesktop());
    expect(result.current).toBe(true);

    act(() => {
      setAncho(390);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(false);
  });
});
