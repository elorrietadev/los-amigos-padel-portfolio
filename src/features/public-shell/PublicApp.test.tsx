/** @vitest-environment jsdom */
// Test de integración de la navegación (PUBLIC-R2/R3): qué vista queda
// montada según el destino elegido. Las 4 vistas se mockean acá a propósito
// — cada una ya tiene sus propios tests; esto solo prueba que PublicApp
// cablea la navegación (y el ocultamiento de la bottom nav en Reservar) bien.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../lib/theme";
import { PublicApp } from "./PublicApp";

beforeEach(() => { window.scrollTo = vi.fn(); });

function renderApp() {
  return render(
    <ThemeProvider>
      <PublicApp />
    </ThemeProvider>,
  );
}

vi.mock("./PublicHomeView", () => ({
  PublicHomeView: ({ onNavegar }: { onNavegar: (v: string) => void }) => (
    <div>
      <span>vista-home</span>
      <button onClick={() => onNavegar("catalogo")}>ir a catálogo</button>
    </div>
  ),
}));
vi.mock("./PublicCatalogoView", () => ({ PublicCatalogoView: () => <div><h1>vista-catalogo</h1></div> }));
vi.mock("./PublicInformacionView", () => ({ PublicInformacionView: () => <div>vista-informacion</div> }));
vi.mock("./PublicReservarView", () => ({ PublicReservarView: () => <div>vista-reservar</div> }));

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // no-op
  }
  document.documentElement.removeAttribute("data-theme");
});

describe("PublicApp — navegación", () => {
  it("arranca en Home", () => {
    renderApp();
    expect(screen.getByText("vista-home")).toBeTruthy();
  });

  it("la bottom nav cambia de vista", async () => {
    renderApp();
    await userEvent.click(screen.getAllByRole("button", { name: "Catálogo" })[0]);
    // AnimatePresence espera a que la vista saliente termine su animación de
    // salida antes de montar la entrante — en el test no hay rAF real, así
    // que se espera con waitFor en vez de asumir que el cambio es síncrono.
    await waitFor(() => expect(screen.getByText("vista-catalogo")).toBeTruthy());
    expect(screen.queryByText("vista-home")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "vista-catalogo" }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
  });

  it("Reservar monta el flujo rediseñado y oculta la bottom nav", async () => {
    renderApp();
    // Hay 2 <nav> con el mismo aria-label (top nav desktop + bottom nav
    // mobile, ambas montadas siempre en jsdom sin media queries reales).
    expect(screen.getAllByRole("navigation", { name: "Navegación principal" }).length).toBe(2);
    await userEvent.click(screen.getAllByRole("button", { name: "Reservar" })[0]);
    await waitFor(() => expect(screen.getByText("vista-reservar")).toBeTruthy());
    // Con Reservar activo solo debería quedar la top nav (la bottom nav se
    // desmonta del todo, no solo se oculta con CSS).
    expect(screen.getAllByRole("navigation", { name: "Navegación principal" }).length).toBe(1);
  });

  it("una vista puede navegar a otra (Home -> Catálogo por su propio CTA)", async () => {
    renderApp();
    await userEvent.click(screen.getByText("ir a catálogo"));
    await waitFor(() => expect(screen.getByText("vista-catalogo")).toBeTruthy());
  });
});
