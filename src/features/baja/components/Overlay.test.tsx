/** @vitest-environment jsdom */
// PUBLIC-R7 — antes el foco se quedaba sobre el botón que abría el modal
// (nunca se movía adentro), Escape no hacía nada y Tab se escapaba libremente
// hacia botones de fondo (confirmado a mano en el navegador real con el modal
// de confirmación de baja). Este test cubre la protección agregada: foco
// inicial adentro, Tab/Shift+Tab atrapados, Escape cierra y el foco vuelve al
// disparador al desmontar.
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { Overlay } from "./Overlay";

afterEach(cleanup);

function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <button>Fondo</button>
      {open && (
        <Overlay closing={false} onClose={() => setOpen(false)}>
          <button>Volver</button>
          <button>Confirmar</button>
        </Overlay>
      )}
    </>
  );
}

it("mueve el foco adentro del diálogo al abrir", async () => {
  const user = userEvent.setup();
  render(<Fixture />);
  await user.click(screen.getByText("Abrir"));
  expect(document.activeElement).toBe(screen.getByText("Volver"));
});

it("atrapa Tab/Shift+Tab dentro de los controles del diálogo", async () => {
  const user = userEvent.setup();
  render(<Fixture />);
  await user.click(screen.getByText("Abrir"));

  await user.tab();
  expect(document.activeElement).toBe(screen.getByText("Confirmar"));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByText("Volver"));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(screen.getByText("Confirmar"));
});

it("Escape cierra el diálogo (misma función que el click en el backdrop)", async () => {
  const user = userEvent.setup();
  render(<Fixture />);
  await user.click(screen.getByText("Abrir"));
  expect(screen.getByRole("dialog")).toBeTruthy();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("al cerrarse devuelve el foco a quien abrió el diálogo", async () => {
  const user = userEvent.setup();
  render(<Fixture />);
  const abrir = screen.getByText("Abrir");
  await user.click(abrir);
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(abrir);
});
