/** @vitest-environment jsdom */
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { FechaEspecialForm } from "./ConfigForms";
import type { ConfigValues } from "./configuracion.types";
afterEach(cleanup);
it("fecha especial conserva minutos arbitrarios y cierre del día siguiente", async () => {
  const user = userEvent.setup(); const submit = vi.fn(); const change = vi.fn();
  function Form() {
    const [value, setValue] = useState<ConfigValues>({ fecha: "2026-09-17", apertura: "22:17", cierre: "01:13", cerrado: false, activo: true, tarifa: "ninguna" });
    return <form onSubmit={(event) => { event.preventDefault(); submit(value); }}>
      <FechaEspecialForm value={value} onChange={(next) => { setValue(next); change(next); }} /><button>Guardar</button>
    </form>;
  }
  render(<Form />);
  await user.click(screen.getByRole("button", { name: "Fecha" }));
  await user.click(screen.getByRole("button", { name: "18 sep 2026" }));
  await user.click(screen.getByRole("button", { name: "Hora cierre" }));
  await user.type(screen.getByRole("textbox", { name: "Buscar horario" }), "02:43{Enter}");
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByText("El cierre corresponde al día siguiente.")).toBeTruthy();
  expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ fecha: "2026-09-18", apertura: "22:17", cierre: "02:43" }));
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ fecha: "2026-09-18", apertura: "22:17", cierre: "02:43" }));
});
