/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TimePicker } from "./TimePicker";
afterEach(cleanup);
const options = ["23:30", "00:00", "00:30", "01:00"];
it("preserva orden y valores después de medianoche, teclado y control externo", async () => {
  const user = userEvent.setup(); const change = vi.fn();
  const { rerender } = render(<TimePicker label="Hora" value="23:30" options={options} onChange={change} />);
  const trigger = screen.getByRole("button", { name: "Hora" });
  await user.click(trigger);
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(options);
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(change).toHaveBeenCalledWith("00:30");
  expect(document.activeElement).toBe(trigger);
  expect(trigger.textContent).toBe("23:30");
  rerender(<TimePicker label="Hora" value="00:30" options={options} onChange={change} />);
  expect(trigger.textContent).toBe("00:30");
  await user.click(trigger); await user.keyboard("{ArrowUp}{Enter}");
  expect(change).toHaveBeenLastCalledWith("00:00");
});
it("click selecciona, Escape y click fuera cierran sin seleccionar", async () => {
  const user = userEvent.setup(); const change = vi.fn();
  render(<TimePicker label="Hora" value="" options={options} onChange={change} />);
  const trigger = screen.getByRole("button", { name: "Hora" });
  await user.click(trigger); await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull(); expect(document.activeElement).toBe(trigger);
  await user.click(trigger); await user.click(document.body);
  expect(change).not.toHaveBeenCalled();
  await user.click(trigger); await user.click(screen.getByRole("option", { name: "01:00" }));
  expect(change).toHaveBeenCalledWith("01:00");
});
it("disabled real y opciones deshabilitadas se omiten con teclado", async () => {
  const user = userEvent.setup(); const change = vi.fn();
  const { rerender } = render(<TimePicker label="Hora" value="" options={options} disabled onChange={change} />);
  await user.click(screen.getByRole("button", { name: "Hora" }));
  expect(screen.queryByRole("listbox")).toBeNull();
  rerender(<TimePicker label="Hora" value="23:30" options={options} isTimeDisabled={(time) => time === "00:00"} onChange={change} />);
  await user.click(screen.getByRole("button", { name: "Hora" }));
  expect((screen.getByRole("option", { name: "00:00" }) as HTMLButtonElement).disabled).toBe(true);
  await user.keyboard("{ArrowDown}{Enter}");
  expect(change).toHaveBeenCalledWith("00:30");
});
