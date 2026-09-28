import { fireEvent, screen, within } from "@testing-library/react";

// Exercise the visible calendar rather than writing into a hidden form field.
export function selectPastDate(trigger: HTMLElement, iso: string) {
  fireEvent.click(trigger);
  const panel = screen.getByRole("dialog", { name: trigger.getAttribute("aria-label")! });
  const label = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" }).formatToParts(new Date(`${iso}T12:00:00`)).filter((part) => part.type !== "literal").map((part) => part.type === "month" ? part.value.replace(/\./g, "").slice(0, 3) : part.value).join(" ");
  const initial = panel.querySelector('[data-picker-focus="true"]')!.getAttribute("data-date")!;
  for (let year = Number(initial.slice(0, 4)); year > Number(iso.slice(0, 4)); year--) {
    fireEvent.keyDown(panel.querySelector('[data-picker-focus="true"]')!, { key: "PageUp", shiftKey: true });
  }
  for (let month = 0; month < 120; month++) {
    const target = within(panel).queryByRole("button", { name: label });
    if (target) { fireEvent.click(target); return; }
    fireEvent.click(within(panel).getByRole("button", { name: "Mes anterior" }));
  }
  throw new Error(`Date outside test navigation range: ${iso}`);
}
