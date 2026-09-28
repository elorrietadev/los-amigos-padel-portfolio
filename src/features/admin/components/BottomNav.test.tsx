/** @vitest-environment jsdom */
// Tests de BottomNav (R2, sección 12/22): los 4 destinos principales + "Más",
// item activo, y que "Más" dispare el callback (el panel en sí es MoreMenu,
// con sus propios tests).

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";

afterEach(() => {
  cleanup();
});

describe("BottomNav", () => {
  it("muestra Agenda, Reservas, Vender, Caja y Más, con labels legibles (no solo ícono)", () => {
    render(<BottomNav vista="reservas" onSeleccionar={vi.fn()} masAbierto={false} onAbrirMas={vi.fn()} />);
    ["Agenda", "Reservas", "Vender", "Caja", "Más"].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  it("marca aria-current en el destino activo", () => {
    render(<BottomNav vista="caja" onSeleccionar={vi.fn()} masAbierto={false} onAbrirMas={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Caja/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: /Reservas/ }).getAttribute("aria-current")).toBeNull();
  });

  it("ningún destino queda marcado activo mientras 'Más' está abierto", () => {
    render(<BottomNav vista="caja" onSeleccionar={vi.fn()} masAbierto onAbrirMas={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Caja/ }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: /Más/ }).getAttribute("aria-current")).toBe("page");
  });

  it("clickear un destino llama a onSeleccionar", async () => {
    const user = userEvent.setup();
    const onSeleccionar = vi.fn();
    render(<BottomNav vista="reservas" onSeleccionar={onSeleccionar} masAbierto={false} onAbrirMas={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Vender/ }));
    expect(onSeleccionar).toHaveBeenCalledWith("vender");
  });

  it("clickear 'Más' llama a onAbrirMas", async () => {
    const user = userEvent.setup();
    const onAbrirMas = vi.fn();
    render(<BottomNav vista="reservas" onSeleccionar={vi.fn()} masAbierto={false} onAbrirMas={onAbrirMas} />);

    await user.click(screen.getByRole("button", { name: /Más/ }));
    expect(onAbrirMas).toHaveBeenCalledTimes(1);
  });
});
