/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PubChip } from "./PubChip";

afterEach(() => {
  cleanup();
});

describe("PubChip", () => {
  it("dispara onClick cuando está habilitado", async () => {
    const onClick = vi.fn();
    render(<PubChip onClick={onClick}>14:00</PubChip>);
    await userEvent.click(screen.getByRole("button", { name: "14:00" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("expone aria-pressed según el prop active", () => {
    const { rerender } = render(<PubChip active={false}>Lun</PubChip>);
    expect(screen.getByRole("button", { name: "Lun" }).getAttribute("aria-pressed")).toBe("false");
    rerender(<PubChip active>Lun</PubChip>);
    expect(screen.getByRole("button", { name: "Lun" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("no dispara onClick cuando está disabled", async () => {
    const onClick = vi.fn();
    render(
      <PubChip onClick={onClick} disabled>
        18:00
      </PubChip>,
    );
    await userEvent.click(screen.getByRole("button", { name: "18:00" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
