/** @vitest-environment jsdom */
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { invalidarEconomia } from "./economiaEvents";
import { useHistorialVentas } from "./historial/useHistorialVentas";
import { useProductos } from "./productos/useProductos";
import { useVentasDeReserva } from "./ventas/useVentasDeReserva";
import { obtenerVentasConDetalle } from "./historial/historial.api";
import { obtenerProductos } from "./productos/productos.api";
import { obtenerVentasPorReserva } from "./ventas/ventas.api";

vi.mock("./historial/historial.api", () => ({ obtenerVentasConDetalle: vi.fn() }));
vi.mock("./productos/productos.api", () => ({ obtenerProductos: vi.fn() }));
vi.mock("./ventas/ventas.api", () => ({ obtenerVentasPorReserva: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const venta = {
  id: "v1", fecha: "2026-09-26", creado: "", total: 100, pago_efectivo: 100, pago_transferencia: 0, reserva_id: "r1", reservas: null,
  venta_items: [{ id: "i1", producto_id: "p1", cantidad: 2, precio_unitario_snapshot: 50, costo_unitario_snapshot: 20, subtotal: 100, creado: "", productos: { nombre: "Pelotas" }, devoluciones: [] }],
};
function VistasMontadas() {
  const [vista, setVista] = useState("stock");
  const productos = useProductos();
  const historial = useHistorialVentas("2026-09-01", "2026-09-30");
  const reserva = useVentasDeReserva("r1");
  const otra = useVentasDeReserva("r2");
  return <>
    {["stock", "historial", "reserva"].map((v) => <button key={v} onClick={() => setVista(v)}>{v}</button>)}
    <div hidden={vista !== "stock"}>Stock: {productos.productos[0]?.stock_actual}</div>
    <div hidden={vista !== "historial"}>Historial: {historial.data[0]?.items[0]?.cantidadVigente}</div>
    <div hidden={vista !== "reserva"}>Reserva: {reserva.ventas[0]?.items[0]?.cantidadVigente}</div>
    <span>Otra: {otra.ventas.length}</span>
  </>;
}
it("devolver desde cualquier vista actualiza las vistas ya montadas al navegar", async () => {
  vi.mocked(obtenerProductos).mockResolvedValue({ data: [{ id: "p1", stock_actual: 5 }], error: null } as never);
  vi.mocked(obtenerVentasConDetalle).mockResolvedValue({ data: [venta], error: null } as never);
  vi.mocked(obtenerVentasPorReserva).mockImplementation((id) => Promise.resolve({ data: id === "r1" ? [venta] : [], error: null }) as never);
  render(<VistasMontadas />);
  await waitFor(() => expect(screen.getByText("Stock: 5")).toBeTruthy());
  await waitFor(() => expect(screen.getByText("Historial: 2")).toBeTruthy());
  act(() => invalidarEconomia({ reservaId: "r1", devolucion: { ventaId: "v1", itemId: "i1", productoId: "p1", cantidad: 1, medioReembolso: "efectivo" } }));
  fireEvent.click(screen.getByRole("button", { name: "historial" }));
  expect(screen.getByText("Historial: 1").hidden).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "reserva" }));
  expect(screen.getByText("Reserva: 1").hidden).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "stock" }));
  expect(screen.getByText("Stock: 6").hidden).toBe(false);
  expect(obtenerVentasConDetalle).toHaveBeenCalledTimes(1);
  expect(obtenerVentasPorReserva).toHaveBeenCalledTimes(2);
  expect(obtenerProductos).toHaveBeenCalledTimes(1);
});
it("una venta invalida historial y su reserva sin consultar otra reserva", async () => {
  vi.mocked(obtenerProductos).mockResolvedValue({ data: [], error: null } as never);
  vi.mocked(obtenerVentasConDetalle).mockResolvedValue({ data: [], error: null } as never);
  vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [], error: null } as never);
  render(<VistasMontadas />);
  await act(async () => {});
  vi.mocked(obtenerVentasConDetalle).mockResolvedValue({ data: [venta], error: null } as never);
  vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [venta], error: null } as never);
  act(() => invalidarEconomia({ reservaId: "r1", stockActualizado: true }));
  await waitFor(() => expect(screen.getByText("Reserva: 2")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "historial" }));
  expect(screen.getByText("Historial: 2").hidden).toBe(false);
  expect(obtenerVentasPorReserva).toHaveBeenCalledTimes(3);
  expect(obtenerVentasPorReserva).toHaveBeenLastCalledWith("r1");
});
