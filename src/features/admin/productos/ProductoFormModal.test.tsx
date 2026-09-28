/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductoFormModal } from "./ProductoFormModal";
import { borrarImagenProducto, subirImagenProducto } from "./productos.api";
import type { Producto } from "./productos.logic";

vi.mock("./productos.api", () => ({
  borrarImagenProducto: vi.fn(), subirImagenProducto: vi.fn(),
  obtenerUrlImagenProducto: (path: string) => path,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => {
  vi.mocked(subirImagenProducto).mockResolvedValue({ path: "nueva.webp", error: null });
  vi.mocked(borrarImagenProducto).mockResolvedValue();
});
const producto = { nombre: "Pelotas", precio_venta: 100, stock_minimo: 0, imagen_path: "original.webp" } as Producto;
function setup(onGuardar = vi.fn().mockResolvedValue(true)) {
  const onClose = vi.fn();
  const view = render(<ProductoFormModal producto={producto} guardando={false} onGuardar={onGuardar} onClose={onClose} />);
  return { ...view, onGuardar, onClose };
}
function upload() {
  fireEvent.change(screen.getByLabelText("Elegir imagen del producto"), {
    target: { files: [new File(["image"], "foto.webp", { type: "image/webp" })] },
  });
}
describe("sesión de imagen del producto", () => {
  it("reemplazar y cancelar limpia solo la nueva", async () => {
    const view = setup(); upload();
    await waitFor(() => expect((screen.getByRole("img") as HTMLImageElement).getAttribute("src")).toBe("nueva.webp"));
    expect(borrarImagenProducto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" })); view.unmount();
    expect(borrarImagenProducto).toHaveBeenCalledWith("nueva.webp");
    expect(borrarImagenProducto).not.toHaveBeenCalledWith("original.webp");
  });
  it("quitar y cancelar conserva Storage", () => {
    const view = setup(); fireEvent.click(screen.getByRole("button", { name: /Quitar/ })); view.unmount();
    expect(borrarImagenProducto).not.toHaveBeenCalled();
  });
  it("reemplazar y guardar elimina la original solo después de confirmar", async () => {
    let resolve!: (ok: boolean) => void;
    const save = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
    const view = setup(save); upload();
    await waitFor(() => expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(borrarImagenProducto).not.toHaveBeenCalled();
    await act(async () => resolve(true)); view.unmount();
    expect(borrarImagenProducto).toHaveBeenCalledWith("original.webp");
    expect(borrarImagenProducto).not.toHaveBeenCalledWith("nueva.webp");
  });
  it("impide guardar durante upload y limpia una respuesta posterior a cancelar", async () => {
    let resolve!: (v: { path: string; error: null }) => void;
    vi.mocked(subirImagenProducto).mockReturnValue(new Promise((r) => { resolve = r; }));
    const view = setup(); upload();
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByRole("button", { name: "Guardar" }).closest("form")!);
    expect(view.onGuardar).not.toHaveBeenCalled(); view.unmount();
    await act(async () => resolve({ path: "tardia.webp", error: null }));
    expect(borrarImagenProducto).toHaveBeenCalledWith("tardia.webp");
  });
  it("fallo de actualización limpia el temporal y recupera la imagen original", async () => {
    setup(vi.fn().mockResolvedValue(false)); upload();
    await waitFor(() => expect((screen.getByRole("img") as HTMLImageElement).getAttribute("src")).toBe("nueva.webp"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(borrarImagenProducto).toHaveBeenCalledWith("nueva.webp"));
    expect(borrarImagenProducto).not.toHaveBeenCalledWith("original.webp");
    expect((screen.getByRole("img") as HTMLImageElement).getAttribute("src")).toBe("original.webp");
  });
  it("aísla el fondo, atrapa el foco, cierra con Escape y lo restaura", async () => {
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    const view = setup();
    expect(screen.getByRole("dialog")).toBe(document.activeElement);
    expect(trigger.hasAttribute("inert")).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Guardar" })).toBe(document.activeElement);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(view.onClose).toHaveBeenCalled(); view.unmount();
    await waitFor(() => expect(document.activeElement).toBe(trigger)); trigger.remove();
  });
});
