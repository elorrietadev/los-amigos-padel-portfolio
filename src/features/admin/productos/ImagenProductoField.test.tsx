/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImagenProductoField } from "./ImagenProductoField";
import { borrarImagenProducto, subirImagenProducto } from "./productos.api";

vi.mock("./productos.api", () => ({
  subirImagenProducto: vi.fn(),
  borrarImagenProducto: vi.fn(),
  obtenerUrlImagenProducto: vi.fn((path: string) => `https://cdn.test/${path}`),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function archivo(nombre: string, tipo: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

describe("ImagenProductoField", () => {
  it("sin imagen: muestra placeholder, no <img>, botón dice 'Subir imagen'", () => {
    render(<ImagenProductoField imagenPath={null} onCambiar={vi.fn()} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("button", { name: /Subir imagen/ })).toBeTruthy();
  });

  it("con imagen: muestra el preview con la URL derivada, botón dice 'Reemplazar' y aparece 'Quitar'", () => {
    render(<ImagenProductoField imagenPath="foo.webp" onCambiar={vi.fn()} />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe("https://cdn.test/foo.webp");
    expect(screen.getByRole("button", { name: /Reemplazar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Quitar/ })).toBeTruthy();
  });

  it("subir: valida, sube, y avisa el nuevo path por onCambiar", async () => {
    vi.mocked(subirImagenProducto).mockResolvedValue({ path: "nuevo.webp", error: null });
    const onCambiar = vi.fn();
    render(<ImagenProductoField imagenPath={null} onCambiar={onCambiar} />);

    const input = screen.getByLabelText("Elegir imagen del producto") as HTMLInputElement;
    await userEvent.upload(input, archivo("foto.webp", "image/webp", 1000));

    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith("nuevo.webp"));
    expect(subirImagenProducto).toHaveBeenCalledTimes(1);
    expect(borrarImagenProducto).not.toHaveBeenCalled(); // no había imagen previa que reemplazar
  });

  it("reemplazar: sube la nueva y borra la anterior (best-effort)", async () => {
    vi.mocked(subirImagenProducto).mockResolvedValue({ path: "nueva.webp", error: null });
    const onCambiar = vi.fn();
    render(<ImagenProductoField imagenPath="vieja.webp" onCambiar={onCambiar} />);

    const input = screen.getByLabelText("Elegir imagen del producto") as HTMLInputElement;
    await userEvent.upload(input, archivo("foto.webp", "image/webp", 1000));

    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith("nueva.webp"));
    expect(borrarImagenProducto).not.toHaveBeenCalled();
  });

  it("quitar: borra el objeto (best-effort) y avisa null por onCambiar", async () => {
    const onCambiar = vi.fn();
    render(<ImagenProductoField imagenPath="foo.webp" onCambiar={onCambiar} />);

    await userEvent.click(screen.getByRole("button", { name: /Quitar/ }));

    expect(onCambiar).toHaveBeenCalledWith(null);
    expect(borrarImagenProducto).not.toHaveBeenCalled();
  });

  it("tipo no soportado: error inline, nunca llega a llamar a subirImagenProducto", () => {
    render(<ImagenProductoField imagenPath={null} onCambiar={vi.fn()} />);
    const input = screen.getByLabelText("Elegir imagen del producto") as HTMLInputElement;

    // fireEvent (no userEvent.upload): userEvent respeta `accept` como lo
    // haría el selector nativo del navegador y filtraría este archivo antes
    // de disparar el change — acá se está testeando justamente que
    // validarImagenProducto lo rechace del lado de la app, no del picker.
    fireEvent.change(input, { target: { files: [archivo("foto.gif", "image/gif", 1000)] } });

    expect(screen.getByText(/Formato no soportado/)).toBeTruthy();
    expect(subirImagenProducto).not.toHaveBeenCalled();
  });

  it("archivo demasiado pesado (>3MB): error inline, nunca llega a llamar a subirImagenProducto", () => {
    render(<ImagenProductoField imagenPath={null} onCambiar={vi.fn()} />);
    const input = screen.getByLabelText("Elegir imagen del producto") as HTMLInputElement;

    fireEvent.change(input, { target: { files: [archivo("foto.webp", "image/webp", 4 * 1024 * 1024)] } });

    expect(screen.getByText(/no puede pesar más de 3 MB/)).toBeTruthy();
    expect(subirImagenProducto).not.toHaveBeenCalled();
  });

  it("error de subida: aviso claro, no llama a onCambiar", async () => {
    vi.mocked(subirImagenProducto).mockResolvedValue({ path: null, error: "network" });
    const onCambiar = vi.fn();
    render(<ImagenProductoField imagenPath={null} onCambiar={onCambiar} />);

    const input = screen.getByLabelText("Elegir imagen del producto") as HTMLInputElement;
    await userEvent.upload(input, archivo("foto.webp", "image/webp", 1000));

    await waitFor(() => expect(screen.getByText(/No se pudo subir la imagen/)).toBeTruthy());
    expect(onCambiar).not.toHaveBeenCalled();
  });
});
