/** @vitest-environment jsdom */
// Tests de ReportesView (R2) — "casa" de navegación para exportaciones que
// ya existían (E5/E6). No se re-testea el todo-o-nada de cada exportación
// (ya cubierto en exportarStock.test.ts/exportCajaActividad.test.ts): acá
// solo que el botón llama a la función correcta y feedback ok/error.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportarStock } from "./exportarStock";
import { ReportesView } from "./ReportesView";

vi.mock("./exportarStock", () => ({
  exportarStock: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportesView", () => {
  it("muestra las 2 cards de reporte", () => {
    render(<ReportesView mostrarToast={vi.fn()} />);
    expect(screen.getByText("Caja y actividad")).toBeTruthy();
    expect(screen.getByText("Productos y stock")).toBeTruthy();
  });

  it("Exportar de Caja y actividad (primera card) abre el modal de exportación", async () => {
    const user = userEvent.setup();
    render(<ReportesView mostrarToast={vi.fn()} />);

    const [botonCaja] = screen.getAllByRole("button", { name: "Exportar" });
    await user.click(botonCaja);

    expect(screen.getByRole("dialog", { name: "Exportar reporte de caja y actividad" })).toBeTruthy();
  });

  it("Exportar de Productos y stock (segunda card): éxito llama exportarStock y muestra toast", async () => {
    const user = userEvent.setup();
    const mostrarToast = vi.fn();
    vi.mocked(exportarStock).mockResolvedValue({ ok: true });
    render(<ReportesView mostrarToast={mostrarToast} />);

    const [, botonStock] = screen.getAllByRole("button", { name: "Exportar" });
    await user.click(botonStock);

    await waitFor(() => expect(exportarStock).toHaveBeenCalledTimes(1));
    expect(mostrarToast).toHaveBeenCalledWith("Excel de stock generado.", "ok");
  });

  it("Exportar de Productos y stock: error muestra el mensaje específico", async () => {
    const user = userEvent.setup();
    const mostrarToast = vi.fn();
    vi.mocked(exportarStock).mockResolvedValue({ ok: false, error: "No se pudo generar el reporte de stock." });
    render(<ReportesView mostrarToast={mostrarToast} />);

    const [, botonStock] = screen.getAllByRole("button", { name: "Exportar" });
    await user.click(botonStock);

    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith("No se pudo generar el reporte de stock.", "error"),
    );
  });
});
