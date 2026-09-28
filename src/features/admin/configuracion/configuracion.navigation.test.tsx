/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, expect, it, vi } from "vitest";
vi.hoisted(() => {
  vi.stubEnv("VITE_ADMIN_CONFIGURACION_UI", "true");
});
import { Sidebar } from "../components/Sidebar";
import { MoreMenu } from "../components/MoreMenu";
import { BOTTOM_NAV_ITEMS, NAV_GROUPS } from "../nav.config";
import { ThemeProvider } from "../../../lib/theme";
afterEach(cleanup);
afterAll(() => vi.unstubAllEnvs());
it("Configuración pertenece a Administración sin sumar botones al bottom nav", () => {
  expect(
    NAV_GROUPS.find((g) => g.label === "Administración")?.items.some(
      (i) => i.vista === "configuracion",
    ),
  ).toBe(true);
  expect(BOTTOM_NAV_ITEMS).toHaveLength(4);
  expect(BOTTOM_NAV_ITEMS.some((i) => i.vista === "configuracion")).toBe(false);
});
it("Sidebar permite elegir Configuración y marca el destino activo", async () => {
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <Sidebar
        vista="configuracion"
        onSeleccionar={onSelect}
        colapsada={false}
        onToggleColapsada={vi.fn()}
        onLogout={vi.fn()}
      />
    </ThemeProvider>,
  );
  const button = screen.getByRole("button", { name: "Configuración" });
  expect(button.getAttribute("aria-current")).toBe("page");
  await user.click(button);
  expect(onSelect).toHaveBeenCalledWith("configuracion");
});
it("Más navega a Configuración y cierra el menú", async () => {
  const onSelect = vi.fn();
  const close = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <MoreMenu
        vista="reservas"
        onSeleccionar={onSelect}
        onClose={close}
        onLogout={vi.fn()}
      />
    </ThemeProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Configuración" }));
  expect(onSelect).toHaveBeenCalledWith("configuracion");
  expect(close).toHaveBeenCalledOnce();
});
it("Más recibe foco y permite cerrar con Escape", async () => {
  const close = vi.fn();
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <MoreMenu
        vista="configuracion"
        onSeleccionar={vi.fn()}
        onClose={close}
        onLogout={vi.fn()}
      />
    </ThemeProvider>,
  );
  expect(document.activeElement).toBe(
    screen.getByRole("dialog", { name: "Más opciones" }),
  );
  await user.keyboard("{Escape}");
  expect(close).toHaveBeenCalledOnce();
});
