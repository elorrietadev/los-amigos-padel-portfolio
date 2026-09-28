/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../lib/theme";
import { PublicTopNav } from "./PublicTopNav";

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // no-op
  }
  document.documentElement.removeAttribute("data-theme");
});

function renderTopNav(vista: Parameters<typeof PublicTopNav>[0]["vista"] = "home") {
  const onSeleccionar = vi.fn();
  render(
    <ThemeProvider>
      <PublicTopNav vista={vista} onSeleccionar={onSeleccionar} />
    </ThemeProvider>,
  );
  return onSeleccionar;
}

describe("PublicTopNav", () => {
  it("marca aria-current en el destino activo", () => {
    renderTopNav("informacion");
    expect(screen.getByRole("button", { name: "Información" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Inicio" }).getAttribute("aria-current")).toBeNull();
  });

  it("navega al hacer click en un destino", async () => {
    const onSeleccionar = renderTopNav("home");
    await userEvent.click(screen.getByRole("button", { name: "Catálogo" }));
    expect(onSeleccionar).toHaveBeenCalledWith("catalogo");
  });

  it("el CTA Reservar ahora navega a la vista reservar", async () => {
    const onSeleccionar = renderTopNav("home");
    await userEvent.click(screen.getByRole("button", { name: "Reservar ahora" }));
    expect(onSeleccionar).toHaveBeenCalledWith("reservar");
  });

  it("el toggle de tema cambia data-theme en <html>", async () => {
    renderTopNav("home");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Cambiar a tema claro" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
