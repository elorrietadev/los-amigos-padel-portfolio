/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicBottomNav } from "./PublicBottomNav";

afterEach(() => {
  cleanup();
});

describe("PublicBottomNav", () => {
  it("renderiza los 4 destinos y marca aria-current en el activo", () => {
    render(<PublicBottomNav vista="catalogo" onSeleccionar={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Inicio" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: "Catálogo" }).getAttribute("aria-current")).toBe("page");
  });

  it("dispara onSeleccionar con la vista elegida", async () => {
    const onSeleccionar = vi.fn();
    render(<PublicBottomNav vista="home" onSeleccionar={onSeleccionar} />);
    await userEvent.click(screen.getByRole("button", { name: "Reservar" }));
    expect(onSeleccionar).toHaveBeenCalledWith("reservar");
  });

  it("expone un landmark de navegación accesible", () => {
    render(<PublicBottomNav vista="home" onSeleccionar={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeTruthy();
  });
});
