/** @vitest-environment jsdom */
// Tests de Sidebar (R2): navegación entre destinos, ítem activo, colapso y
// tooltips/aria en modo colapsado. El deslizamiento de la cápsula en sí
// (Motion/layoutId) no se testea acá — es puramente visual, sin lógica que
// romperse; lo que sí importa es que el ítem correcto quede marcado
// aria-current y que el layout no pierda accesibilidad al colapsar.

import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../lib/theme";
import { Sidebar, type SidebarProps } from "./Sidebar";

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // no-op
  }
});

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    vista: "reservas",
    onSeleccionar: vi.fn(),
    colapsada: false,
    onToggleColapsada: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  render(
    <ThemeProvider>
      <Sidebar {...props} />
    </ThemeProvider>,
  );
  return props;
}

describe("Sidebar — navegación", () => {
  it("muestra los 3 grupos con sus destinos, agrupados", () => {
    renderSidebar();
    const nav = screen.getByLabelText("Navegación principal");
    expect(within(nav).getByText("Operación")).toBeTruthy();
    expect(within(nav).getByText("Ventas")).toBeTruthy();
    expect(within(nav).getByText("Administración")).toBeTruthy();
    ["Agenda", "Reservas", "Turnos fijos", "Bloqueos", "Vender", "Productos", "Historial", "Caja", "Reportes", "Backup"].forEach(
      (label) => {
        expect(within(nav).getByRole("button", { name: label })).toBeTruthy();
      },
    );
  });

  it("Torneos no aparece en la navegación", () => {
    renderSidebar();
    expect(screen.queryByText("Torneos")).toBeNull();
  });

  it("marca aria-current en el ítem de la vista actual, ninguno más", () => {
    renderSidebar({ vista: "caja" });
    const nav = screen.getByLabelText("Navegación principal");
    expect(within(nav).getByRole("button", { name: "Caja" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("button", { name: "Reservas" }).getAttribute("aria-current")).toBeNull();
  });

  it("clickear un destino llama a onSeleccionar con esa vista", async () => {
    const user = userEvent.setup();
    const onSeleccionar = vi.fn();
    renderSidebar({ onSeleccionar });

    await user.click(screen.getByRole("button", { name: "Productos" }));
    expect(onSeleccionar).toHaveBeenCalledWith("productos");
  });
});

describe("Sidebar — colapso", () => {
  it("expandida: muestra labels de texto y de grupo", () => {
    renderSidebar({ colapsada: false });
    expect(screen.getByText("Agenda")).toBeTruthy();
    expect(screen.getByText("Operación")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Colapsar menú" })).toBeTruthy();
  });

  it("colapsada: conserva los labels en el layout, ocultos al lector, con aria-label y title por ítem", () => {
    renderSidebar({ colapsada: true });
    expect(screen.getByText("Agenda").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Operación").getAttribute("aria-hidden")).toBe("true");

    const boton = screen.getByRole("button", { name: "Agenda" });
    expect(boton.getAttribute("title")).toBe("Agenda");
    expect(screen.getByRole("button", { name: "Expandir menú" })).toBeTruthy();
  });

  it("el botón de colapso llama a onToggleColapsada", async () => {
    const user = userEvent.setup();
    const onToggleColapsada = vi.fn();
    renderSidebar({ onToggleColapsada });

    await user.click(screen.getByRole("button", { name: "Colapsar menú" }));
    expect(onToggleColapsada).toHaveBeenCalledTimes(1);
  });
});

describe("Sidebar — pie", () => {
  it("incluye el theme switch y el botón de logout", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: /Cambiar a tema/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
  });

  // R9.1 — logout ahora pide confirmación (ConfirmModal) en vez de disparar
  // onLogout al primer click, para que no sea una acción de un solo click
  // accidental.
  it("logout pide confirmación antes de llamar a onLogout", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderSidebar({ onLogout });

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(onLogout).not.toHaveBeenCalled();

    const dialogo = screen.getByRole("dialog", { name: "Confirmar cierre de sesión" });
    await user.click(within(dialogo).getByRole("button", { name: "Sí, cerrar sesión" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("cancelar la confirmación de logout no llama a onLogout", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderSidebar({ onLogout });

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    const dialogo = screen.getByRole("dialog", { name: "Confirmar cierre de sesión" });
    await user.click(within(dialogo).getByRole("button", { name: "Volver" }));

    expect(onLogout).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Confirmar cierre de sesión" })).toBeNull();
  });
});


it("muestra labels al navegar con teclado y conserva el preview al salir el mouse", async () => {
  const user = userEvent.setup();
  renderSidebar({ colapsada: true });
  await user.tab();
  expect(screen.getByText("Operación")).toBeTruthy();
  const nav = screen.getByLabelText("Navegación principal");
  await user.unhover(nav);
  expect(screen.getByText("Operación")).toBeTruthy();
  act(() => (document.activeElement as HTMLElement).blur());
  expect(screen.getByText("Operación").getAttribute("aria-hidden")).toBe("true");
});
