/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

function resetear() {
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
}

beforeEach(resetear);
afterEach(() => {
  cleanup();
  resetear();
});

function Lector() {
  const { theme } = useTheme();
  return <span>{theme}</span>;
}

function BotonToggle() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

function BotonFijarDark() {
  const { theme, setTheme } = useTheme();
  return <button onClick={() => setTheme("dark")}>{theme}</button>;
}

describe("ThemeProvider", () => {
  it("usa dark por defecto cuando no hay atributo previo en <html>", () => {
    render(
      <ThemeProvider>
        <Lector />
      </ThemeProvider>,
    );
    expect(screen.getByText("dark")).toBeTruthy();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("respeta data-theme=light si ya estaba puesto antes del mount (simula theme-init.js)", () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(
      <ThemeProvider>
        <Lector />
      </ThemeProvider>,
    );
    expect(screen.getByText("light")).toBeTruthy();
  });

  it("toggleTheme cambia el atributo del documento y persiste en localStorage", async () => {
    render(
      <ThemeProvider>
        <BotonToggle />
      </ThemeProvider>,
    );
    const boton = screen.getByRole("button");
    expect(boton.textContent).toBe("dark");

    await act(async () => {
      boton.click();
    });

    expect(boton.textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("lap-theme")).toBe("light");
  });

  it("setTheme('dark') persiste dark explícitamente aunque el tema previo fuera light", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    window.localStorage.setItem("lap-theme", "light");

    render(
      <ThemeProvider>
        <BotonFijarDark />
      </ThemeProvider>,
    );

    await act(async () => {
      screen.getByRole("button").click();
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("lap-theme")).toBe("dark");
  });

  it("useTheme fuera de ThemeProvider tira un error claro", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    function Roto() {
      useTheme();
      return null;
    }
    expect(() => render(<Roto />)).toThrow("useTheme debe usarse dentro de <ThemeProvider>");
    consoleError.mockRestore();
  });
});
