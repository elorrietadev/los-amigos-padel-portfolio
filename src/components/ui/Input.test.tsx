/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Input } from "./Input";

afterEach(() => {
  cleanup();
});

describe("Input", () => {
  it("marca aria-invalid cuando error es true", () => {
    render(<Input aria-label="Teléfono" error />);
    expect(screen.getByLabelText("Teléfono").getAttribute("aria-invalid")).toBe("true");
  });

  it("no marca aria-invalid por defecto", () => {
    render(<Input aria-label="Teléfono" />);
    expect(screen.getByLabelText("Teléfono").getAttribute("aria-invalid")).toBeNull();
  });
});
