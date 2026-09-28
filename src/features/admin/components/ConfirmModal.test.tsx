/** @vitest-environment jsdom */
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmModal } from "./ConfirmModal";

afterEach(cleanup);

it("confina Tab y restaura el foco al cerrar con Escape", async () => {
  function Ejemplo() {
    const [abierto, setAbierto] = useState(false);
    return <><button onClick={() => setAbierto(true)}>Abrir</button>{abierto && <ConfirmModal mensaje="¿Continuar?" confirmLabel="Confirmar" onConfirm={() => {}} onClose={() => setAbierto(false)} />}</>;
  }
  const user = userEvent.setup();
  render(<Ejemplo />);
  await user.click(screen.getByRole("button", { name: "Abrir" }));
  expect(document.activeElement).toBe(screen.getByRole("dialog"));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirmar" }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Volver" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abrir" }));
});

it("no cierra ni deja escapar el foco mientras está ocupado", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<ConfirmModal mensaje="Guardando" confirmLabel="Confirmar" busy onConfirm={() => {}} onClose={onClose} />);
  await user.keyboard("{Escape}{Tab}");
  expect(onClose).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole("dialog"));
});
