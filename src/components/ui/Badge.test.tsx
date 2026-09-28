/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Badge, type BadgeVariant } from "./Badge";

afterEach(() => {
  cleanup();
});

describe("Badge", () => {
  const variantes: BadgeVariant[] = ["neutral", "accent", "success", "warning", "danger", "info"];
  it.each(variantes)("renderiza la variante %s con su texto", (variant) => {
    render(<Badge variant={variant}>Pendiente</Badge>);
    expect(screen.getByText("Pendiente")).toBeTruthy();
  });
});
