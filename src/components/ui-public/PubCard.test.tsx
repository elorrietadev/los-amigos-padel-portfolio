/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PubCard } from "./PubCard";

afterEach(() => {
  cleanup();
});

describe("PubCard", () => {
  it("renderiza su contenido", () => {
    render(<PubCard>Turno de hoy</PubCard>);
    expect(screen.getByText("Turno de hoy")).toBeTruthy();
  });

  it("solo agrega feedback de tap/hover cuando interactive", () => {
    render(<PubCard data-testid="card">Contenido</PubCard>);
    expect(screen.getByTestId("card").className).not.toContain("active:scale-[0.985]");

    render(
      <PubCard data-testid="card-interactiva" interactive>
        Contenido
      </PubCard>,
    );
    expect(screen.getByTestId("card-interactiva").className).toContain("active:scale-[0.985]");
  });
});
