/** @vitest-environment jsdom */
// CFG-F1 — Configuración pasó de opt-in a visible por defecto:
// VITE_ADMIN_CONFIGURACION_UI ahora es solo un kill-switch de emergencia
// (ausente o "true" = visible, "false" = oculta). Cada caso necesita su
// propio módulo fresco porque CONFIGURACION_UI_ENABLED se calcula una sola
// vez al importar nav.config.ts (constante de módulo, no una función).
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function configuracionVisible(): Promise<boolean> {
  const { NAV_GROUPS } = await import("./nav.config");
  return NAV_GROUPS.find((g) => g.label === "Administración")!.items.some(
    (i) => i.vista === "configuracion",
  );
}

it("sin la env var definida, Configuración queda visible (default-on)", async () => {
  vi.stubEnv("VITE_ADMIN_CONFIGURACION_UI", undefined as unknown as string);
  expect(await configuracionVisible()).toBe(true);
});

it("con la env var en \"true\", Configuración queda visible", async () => {
  vi.stubEnv("VITE_ADMIN_CONFIGURACION_UI", "true");
  expect(await configuracionVisible()).toBe(true);
});

it("con la env var en \"false\" (kill-switch), Configuración se oculta", async () => {
  vi.stubEnv("VITE_ADMIN_CONFIGURACION_UI", "false");
  expect(await configuracionVisible()).toBe(false);
});
