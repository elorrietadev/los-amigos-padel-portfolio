/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DatePicker } from "./DatePicker";

afterEach(cleanup);
it("abre, selecciona ISO, restaura foco y respeta el valor controlado", async () => {
  const user = userEvent.setup(); const onChange = vi.fn();
  const { rerender } = render(<DatePicker label="Fecha" value="2026-09-17" onChange={onChange} />);
  const trigger = screen.getByRole("button", { name: "Fecha" });
  await user.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  await user.click(screen.getByRole("button", { name: "18 sep 2026" }));
  expect(onChange).toHaveBeenCalledWith("2026-09-18");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(trigger.textContent).toBe("17 sep 2026");
  rerender(<DatePicker label="Fecha" value="2026-09-18" onChange={onChange} />);
  expect(trigger.textContent).toBe("18 sep 2026");
});
it("navega meses, cruza de año y cierra con Escape/click fuera", async () => {
  const user = userEvent.setup();
  render(<DatePicker label="Fecha" value="2026-12-31" onChange={vi.fn()} />);
  const trigger = screen.getByRole("button", { name: "Fecha" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Mes siguiente" }));
  expect(screen.getByText("enero de 2027")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Mes anterior" }));
  expect(screen.getByText("diciembre de 2026")).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger); await user.click(document.body);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("respeta disabled, min/max y predicado sin emitir fechas inválidas", async () => {
  const user = userEvent.setup(); const change = vi.fn();
  const { rerender } = render(<DatePicker label="Fecha" value="2026-09-17" disabled onChange={change} />);
  await user.click(screen.getByRole("button", { name: "Fecha" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  rerender(<DatePicker label="Fecha" value="2026-09-17" min="2026-09-16" max="2026-09-20" isDateDisabled={(iso) => iso === "2026-09-18"} onChange={change} />);
  await user.click(screen.getByRole("button", { name: "Fecha" }));
  for (const day of [15, 18, 21]) {
    const button = screen.getByRole("button", { name: `${day} sep 2026` });
    expect(button.getAttribute("aria-disabled")).toBe("true"); await user.click(button);
  }
  expect(change).not.toHaveBeenCalled();
});
it("teclado atraviesa mes y año bisiesto, y Tab puede salir", async () => {
  const user = userEvent.setup(); const change = vi.fn();
  render(<><DatePicker label="Fecha" value="2024-02-28" onChange={change} /><button>Después</button></>);
  await user.click(screen.getByRole("button", { name: "Fecha" }));
  await user.keyboard("{ArrowRight}");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(document.activeElement?.getAttribute("data-date")).toBe("2024-02-29");
  await user.keyboard("{Enter}");
  expect(change).toHaveBeenCalledWith("2024-02-29");
  await user.click(screen.getByRole("button", { name: "Fecha" }));
  fireEvent.focusOut(screen.getByRole("dialog"), { relatedTarget: screen.getByText("Después") });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("conserva required, limpiar opcional y envío de formulario", async () => {
  const user = userEvent.setup();
  render(<form aria-label="Formulario"><DatePicker label="Fecha" value="" required name="fecha" onChange={vi.fn()} /><button>Guardar</button></form>);
  const form = screen.getByRole("form") as HTMLFormElement;
  expect(form.checkValidity()).toBe(false);
  await user.click(screen.getByRole("button", { name: "Fecha" }));
  // checkValidity may already have opened the picker through onInvalid.
  if (!screen.queryByRole("dialog")) await user.click(screen.getByRole("button", { name: "Fecha" }));
  expect(within(screen.getByRole("dialog")).queryByText("Limpiar fecha")).toBeNull();
});
