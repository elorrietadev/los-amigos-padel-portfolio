/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Toast } from "./Toast";

afterEach(cleanup);

it("mantiene la región de anuncios y muestra el mensaje fuera del contenedor de la vista", async () => {
  const { container, rerender } = render(<Toast toast={null} />);
  const region = screen.getByRole("status");
  expect(region.textContent).toBe("");
  expect(container.contains(region)).toBe(false);
  rerender(<Toast toast={{ texto: "Pago registrado", tipo: "ok" }} />);
  expect(screen.getByRole("status")).toBe(region);
  expect(screen.getByText("Pago registrado")).toBeTruthy();
  rerender(<Toast toast={null} />);
  await waitFor(() => expect(screen.queryByText("Pago registrado")).toBeNull());
  expect(screen.getByRole("status")).toBe(region);
});

it("reemplaza éxito por error sin conservar mensajes anteriores", async () => {
  const { rerender } = render(<Toast toast={{ texto: "Pago registrado", tipo: "ok" }} />);
  rerender(<Toast toast={{ texto: "No se pudo guardar", tipo: "error" }} />);
  expect(screen.getByText("No se pudo guardar")).toBeTruthy();
  await waitFor(() => expect(screen.queryByText("Pago registrado")).toBeNull());
});
