/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PubButton, type PubButtonVariant } from "./PubButton";

afterEach(() => {
  cleanup();
});

describe("PubButton", () => {
  it("dispara onClick cuando está habilitado", async () => {
    const onClick = vi.fn();
    render(<PubButton onClick={onClick}>Reservar</PubButton>);
    await userEvent.click(screen.getByRole("button", { name: "Reservar" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("no dispara onClick cuando está disabled", async () => {
    const onClick = vi.fn();
    render(
      <PubButton onClick={onClick} disabled>
        Reservar
      </PubButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Reservar" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading deshabilita el botón y marca aria-busy", () => {
    render(<PubButton loading>Confirmando</PubButton>);
    const boton = screen.getByRole("button", { name: "Confirmando" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute("aria-busy")).toBe("true");
  });

  const variantes: PubButtonVariant[] = ["primary", "secondary", "outline", "ghost", "destructive"];
  it.each(variantes)("renderiza la variante %s sin romper", (variant) => {
    render(<PubButton variant={variant}>Acción</PubButton>);
    expect(screen.getByRole("button", { name: "Acción" })).toBeTruthy();
  });
});
