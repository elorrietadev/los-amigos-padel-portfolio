/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevolucionModal, type DevolucionModalProps } from "./DevolucionModal";

afterEach(() => {
  cleanup();
});

function renderModal(overrides: Partial<DevolucionModalProps> = {}) {
  const onGuardar = vi.fn();
  const onClose = vi.fn();
  render(
    <DevolucionModal
      productoNombre="Pelotas"
      cantidadVigente={3}
      precioSnapshot={10000}
      guardando={false}
      onGuardar={onGuardar}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onGuardar, onClose };
}

describe("DevolucionModal", () => {
  it("cantidad default 1, medio default efectivo, monto a devolver visible desde el inicio", () => {
    renderModal({ precioSnapshot: 5000 });

    expect((screen.getByLabelText("Cantidad") as HTMLInputElement).value).toBe("1");
    expect(screen.getByRole("button", { name: "Efectivo" }).className).toContain("border-success");
    expect(screen.getByText("Monto a devolver: $5.000")).toBeTruthy();
  });

  it("el monto a devolver se recalcula en vivo al cambiar la cantidad", async () => {
    const user = userEvent.setup();
    renderModal({ precioSnapshot: 5000 });

    const cantidad = screen.getByLabelText("Cantidad");
    await user.clear(cantidad);
    await user.type(cantidad, "3");

    expect(screen.getByText("Monto a devolver: $15.000")).toBeTruthy();
  });

  it("bloquea el submit con mensaje si la cantidad es 0, sin llamar a onGuardar", async () => {
    const user = userEvent.setup();
    const { onGuardar } = renderModal();

    const cantidad = screen.getByLabelText("Cantidad");
    await user.clear(cantidad);
    await user.type(cantidad, "0");
    await user.click(screen.getByRole("button", { name: "Devolver" }));

    expect(screen.getByText("La cantidad tiene que ser un entero entre 1 y 3.")).toBeTruthy();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it("bloquea el submit si la cantidad supera el máximo (cantidadVigente)", async () => {
    const user = userEvent.setup();
    const { onGuardar } = renderModal({ cantidadVigente: 2 });

    const cantidad = screen.getByLabelText("Cantidad");
    await user.clear(cantidad);
    await user.type(cantidad, "3");
    await user.click(screen.getByRole("button", { name: "Devolver" }));

    expect(screen.getByText("La cantidad tiene que ser un entero entre 1 y 2.")).toBeTruthy();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it("bloquea el submit con una cantidad decimal", async () => {
    const user = userEvent.setup();
    const { onGuardar } = renderModal({ cantidadVigente: 5 });

    const cantidad = screen.getByLabelText("Cantidad");
    await user.clear(cantidad);
    await user.type(cantidad, "1.5");
    await user.click(screen.getByRole("button", { name: "Devolver" }));

    expect(screen.getByText("La cantidad tiene que ser un entero entre 1 y 5.")).toBeTruthy();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it("motivo vacío se manda como null", async () => {
    const user = userEvent.setup();
    const { onGuardar } = renderModal();

    await user.click(screen.getByRole("button", { name: "Devolver" }));

    expect(onGuardar).toHaveBeenCalledWith({ cantidad: 1, motivo: null, medioReembolso: "efectivo" });
  });

  it("motivo con espacios se recorta antes de enviarse", async () => {
    const user = userEvent.setup();
    const { onGuardar } = renderModal();

    await user.type(screen.getByLabelText("Motivo (opcional)"), "  roto  ");
    await user.click(screen.getByRole("button", { name: "Devolver" }));

    expect(onGuardar).toHaveBeenCalledWith({ cantidad: 1, motivo: "roto", medioReembolso: "efectivo" });
  });

  it("cambiar a Transferencia se refleja en el payload enviado", async () => {
    const user = userEvent.setup();
    const { onGuardar } = renderModal();

    await user.click(screen.getByRole("button", { name: "Transferencia" }));
    await user.click(screen.getByRole("button", { name: "Devolver" }));

    expect(onGuardar).toHaveBeenCalledWith({ cantidad: 1, motivo: null, medioReembolso: "transferencia" });
  });

  it("guardando=true: inputs y botones deshabilitados", () => {
    renderModal({ guardando: true });

    expect((screen.getByLabelText("Cantidad") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Efectivo" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Guardando..." })).toBeTruthy();
  });

  it("click en el overlay cierra si no está guardando", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole("dialog").parentElement!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("click en el overlay NO cierra mientras está guardando", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({ guardando: true });

    await user.click(screen.getByRole("dialog").parentElement!);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("click en 'Cancelar' cierra el modal", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
