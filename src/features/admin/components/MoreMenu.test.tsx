/** @vitest-environment jsdom */
// Tests de MoreMenu (R2, sección 12/22): contiene los destinos secundarios
// (todo lo que no está en BottomNav), tema y logout, y cierra al elegir un
// destino o al clickear el fondo.

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../lib/theme";
import { MoreMenu } from "./MoreMenu";

afterEach(() => {
  cleanup();
});

function renderMenu(overrides: Partial<Parameters<typeof MoreMenu>[0]> = {}) {
  const props = {
    vista: "fijos" as const,
    onSeleccionar: vi.fn(),
    onClose: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  render(
    <ThemeProvider>
      <MoreMenu {...props} />
    </ThemeProvider>,
  );
  return props;
}

describe("MoreMenu", () => {
  it("contiene los destinos secundarios (todo lo que no está en BottomNav)", () => {
    renderMenu();
    ["Turnos fijos", "Bloqueos", "Productos", "Historial", "Reportes", "Backup"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    });
    // Los 4 principales de BottomNav no se repiten acá.
    ["Agenda", "Vender", "Caja"].forEach((label) => {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    });
  });

  it("incluye theme switch y logout", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onLogout, onClose });

    expect(screen.getByRole("button", { name: /Cambiar a tema/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("elegir un destino llama a onSeleccionar y cierra el menú", async () => {
    const user = userEvent.setup();
    const onSeleccionar = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onSeleccionar, onClose });

    await user.click(screen.getByRole("button", { name: "Reportes" }));
    expect(onSeleccionar).toHaveBeenCalledWith("reportes");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clickear el fondo cierra el menú", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderMenu({ onClose });

    await user.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
