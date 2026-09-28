/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { IconButton } from "./IconButton";

afterEach(() => {
  cleanup();
});

describe("IconButton", () => {
  it("expone su aria-label como nombre accesible", () => {
    render(
      <IconButton aria-label="Eliminar">
        <Trash2 size={16} />
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy();
  });
});
