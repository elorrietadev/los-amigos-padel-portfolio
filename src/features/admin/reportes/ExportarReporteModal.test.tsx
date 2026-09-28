/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportarReporteModal } from "./ExportarReporteModal";
import { exportarCajaActividad } from "./exportCajaActividad";

vi.mock("./exportCajaActividad", () => ({
  exportarCajaActividad: vi.fn(),
}));

const AHORA = new Date("2026-01-14T15:00:00-03:00").getTime(); // miércoles

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.mocked(exportarCajaActividad).mockResolvedValue({ ok: true });
});

function renderModal(overrides: Partial<Parameters<typeof ExportarReporteModal>[0]> = {}) {
  const onClose = vi.fn();
  const onExito = vi.fn();
  render(
    <ExportarReporteModal
      rangoInicial="semana"
      ahora={AHORA}
      nombreCancha="Los Amigos Pádel"
      onClose={onClose}
      onExito={onExito}
      {...overrides}
    />,
  );
  return { onClose, onExito };
}

describe("ExportarReporteModal", () => {
  it("arranca en 'Esta semana' cuando rangoInicial='semana' y muestra el rango calculado", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Esta semana" }).className).toContain("border-accent");
    expect(screen.getByText(/Rango: 2026-01-12 a 2026-01-18/)).toBeTruthy();
  });

  it("arranca en 'Personalizado' con la fecha prellenada cuando rangoInicial='personalizado'", () => {
    renderModal({ rangoInicial: "personalizado", fechaInicial: "2026-01-05" });
    expect(screen.getByRole("button", { name: "Personalizado" }).className).toContain("border-accent");
    expect(screen.getByText(/Rango: 2026-01-05 a 2026-01-05/)).toBeTruthy();
  });

  it("elegir 'Personalizado' muestra los inputs desde/hasta", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Personalizado" }));
    expect(screen.getByLabelText("Desde")).toBeTruthy();
    expect(screen.getByLabelText("Hasta")).toBeTruthy();
  });

  it("personalizado incompleto: error inline, no llama a exportarCajaActividad", async () => {
    const user = userEvent.setup();
    renderModal({ rangoInicial: "personalizado" });
    await user.click(screen.getByRole("button", { name: "Generar Excel" }));
    expect(screen.getByText(/Elegí un rango de fechas válido/)).toBeTruthy();
    expect(exportarCajaActividad).not.toHaveBeenCalled();
  });

  it("generar con éxito: llama exportarCajaActividad, dispara onExito y onClose", async () => {
    const user = userEvent.setup();
    const { onClose, onExito } = renderModal();
    await user.click(screen.getByRole("button", { name: "Generar Excel" }));
    await waitFor(() => expect(exportarCajaActividad).toHaveBeenCalledTimes(1));
    expect(exportarCajaActividad).toHaveBeenCalledWith(
      { desde: "2026-01-12", hasta: "2026-01-18" },
      AHORA,
      "Los Amigos Pádel",
    );
    await waitFor(() => expect(onExito).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("los calendarios conservan min/max y envían el rango personalizado intacto", async () => {
    const user = userEvent.setup();
    renderModal({ rangoInicial: "personalizado", fechaInicial: "2026-01-05" });
    await user.click(screen.getByRole("button", { name: "Hasta" }));
    expect(screen.getByRole("button", { name: "4 ene 2026" }).getAttribute("aria-disabled")).toBe("true");
    await user.click(screen.getByRole("button", { name: "20 ene 2026" }));
    await user.click(screen.getByRole("button", { name: "Desde" }));
    expect(screen.getByRole("button", { name: "21 ene 2026" }).getAttribute("aria-disabled")).toBe("true");
    await user.click(screen.getByRole("button", { name: "10 ene 2026" }));
    await user.click(screen.getByRole("button", { name: "Generar Excel" }));
    expect(exportarCajaActividad).toHaveBeenCalledWith(
      { desde: "2026-01-10", hasta: "2026-01-20" }, AHORA, "Los Amigos Pádel",
    );
  });

  it("generar con error: muestra el error, NO cierra el modal, conserva el rango elegido", async () => {
    vi.mocked(exportarCajaActividad).mockResolvedValue({ ok: false, error: "No se pudo generar el reporte. Probá de nuevo." });
    const user = userEvent.setup();
    const { onClose, onExito } = renderModal();
    await user.click(screen.getByRole("button", { name: "Generar Excel" }));
    await waitFor(() => expect(screen.getByText("No se pudo generar el reporte. Probá de nuevo.")).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
    expect(onExito).not.toHaveBeenCalled();
    // El rango sigue mostrándose igual, listo para reintentar.
    expect(screen.getByText(/Rango: 2026-01-12 a 2026-01-18/)).toBeTruthy();
  });

  it("evita doble click: mientras genera, el botón queda deshabilitado", async () => {
    let resolver!: (v: { ok: boolean }) => void;
    vi.mocked(exportarCajaActividad).mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }) as never,
    );
    const user = userEvent.setup();
    renderModal();
    const boton = screen.getByRole("button", { name: "Generar Excel" });
    await user.click(boton);
    expect((screen.getByRole("button", { name: "Generando..." }) as HTMLButtonElement).disabled).toBe(true);
    resolver({ ok: true });
    await waitFor(() => expect(exportarCajaActividad).toHaveBeenCalledTimes(1));
  });

  it("botón Cancelar cierra el modal sin llamar a exportarCajaActividad", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
    expect(exportarCajaActividad).not.toHaveBeenCalled();
  });
});


it("restaura busy si import/generacion/descarga lanza una excepcion", async () => {
  vi.mocked(exportarCajaActividad).mockRejectedValueOnce(new Error("dynamic import failed"));
  const { onClose } = renderModal();
  await userEvent.click(screen.getByRole("button", { name: "Generar Excel" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect((screen.getByRole("button", { name: "Generar Excel" }) as HTMLButtonElement).disabled).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
});
