/** @vitest-environment jsdom */
import { StrictMode, useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { DrawerSurface } from "./DrawerSurface";
import { ConfirmModal } from "./ConfirmModal";

afterEach(cleanup);
function Fixture() {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return <><button onClick={() => setOpen(true)}>Abrir</button><button>Fondo</button>
    {open && <><div data-drawer-backdrop onClick={() => setOpen(false)} data-testid="backdrop" />
      <DrawerSurface role="dialog" aria-label="Detalle" onClose={() => setOpen(false)}>
        <button onClick={() => setNested(true)}>Confirmar</button>
        <button tabIndex={-1}>Fuera de tab</button>
        <button disabled>Deshabilitado</button>
        <button onClick={() => setOpen(false)}>Cerrar</button>
      </DrawerSurface></>}
    {nested && <ConfirmModal confirmLabel="Aceptar" mensaje="Confirmación" onClose={() => setNested(false)} onConfirm={() => {}} />}
  </>;
}
it("trapa Tab/Shift+Tab, bloquea fondo y scroll, restaura foco y estilos", async () => {
  const user = userEvent.setup();
  document.body.style.overflow = "auto";
  render(<StrictMode><Fixture /></StrictMode>);
  const opener = screen.getByText("Abrir");
  await user.click(opener);
  expect(document.activeElement).toBe(screen.getByRole("dialog"));
  expect(document.body.style.overflow).toBe("hidden");
  expect(opener.hasAttribute("inert")).toBe(true);
  expect(screen.getByTestId("backdrop").hasAttribute("inert")).toBe(false);
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(screen.getByText("Cerrar"));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByText("Confirmar"));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(screen.getByText("Cerrar"));
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe("auto");
  expect(opener.hasAttribute("inert")).toBe(false);
  document.body.style.overflow = "";
});
it("Escape cierra solo el modal anidado y devuelve el foco al drawer", async () => {
  const user = userEvent.setup();
  render(<Fixture />);
  await user.click(screen.getByText("Abrir"));
  const trigger = screen.getByText("Confirmar");
  await user.click(trigger);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Detalle" })).toBeTruthy();
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe("hidden");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(screen.getByText("Abrir"));
  expect(document.body.style.overflow).toBe("");
});

it("devuelve al drawer el foco dirigido al fondo", async () => {
  const user = userEvent.setup();
  render(<Fixture />);
  await user.click(screen.getByText("Abrir"));
  screen.getByText("Fondo").focus();
  expect(document.activeElement).toBe(screen.getByRole("dialog"));
});
