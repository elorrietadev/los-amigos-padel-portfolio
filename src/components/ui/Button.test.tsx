/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, type ButtonVariant } from "./Button";

afterEach(() => {
  cleanup();
});

describe("Button", () => {
  it("dispara onClick cuando está habilitado", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("no dispara onClick cuando está disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Guardar
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading deshabilita el botón y marca aria-busy", () => {
    render(<Button loading>Guardando</Button>);
    const boton = screen.getByRole("button", { name: "Guardando" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute("aria-busy")).toBe("true");
  });

  const variantes: ButtonVariant[] = ["primary", "secondary", "ghost", "destructive", "success"];
  it.each(variantes)("renderiza la variante %s sin romper", (variant) => {
    render(<Button variant={variant}>Acción</Button>);
    expect(screen.getByRole("button", { name: "Acción" })).toBeTruthy();
  });
});
