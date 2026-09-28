/** @vitest-environment jsdom */
// Tests de PublicCatalogoView (PUBLIC-R4). Mockea useCatalogoPublico (no
// catalogo.api/Supabase) — mismo criterio que PublicHomeView.test.tsx con
// usePublicHoy: esta vista no debe saber de dónde sale el dato.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductoPublico } from "../catalogo-public/catalogo.types";
import type { UseCatalogoPublico } from "../catalogo-public/useCatalogoPublico";
import { PublicCatalogoView } from "./PublicCatalogoView";

const useCatalogoPublicoMock = vi.hoisted(() => vi.fn());
vi.mock("../catalogo-public/useCatalogoPublico", () => ({ useCatalogoPublico: useCatalogoPublicoMock }));

const obtenerUrlImagenProductoMock = vi.hoisted(() => vi.fn((path: string) => `https://cdn.test/${path}`));
vi.mock("../catalogo-public/catalogo.api", () => ({
  obtenerUrlImagenProducto: obtenerUrlImagenProductoMock,
}));

function producto(overrides: Partial<ProductoPublico> = {}): ProductoPublico {
  return {
    id: "p1",
    nombre: "Agua mineral",
    precioVenta: 1500,
    categoriaPublica: "Bebidas",
    descripcionPublica: null,
    imagenPath: null,
    destacado: false,
    ordenPublico: null,
    enStock: true,
    ...overrides,
  };
}

function render_(catalogo: Partial<UseCatalogoPublico>) {
  useCatalogoPublicoMock.mockReturnValue({ productos: [], loading: false, error: false, ...catalogo });
  render(<PublicCatalogoView />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PublicCatalogoView — estados de carga", () => {
  it("loading: muestra skeleton, no productos ni mensaje de vacío", () => {
    render_({ loading: true });
    expect(screen.queryByText(/Todavía no cargamos productos/)).toBeNull();
  });

  it("error: aviso claro, no revienta ni muestra catálogo vacío como si no hubiera nada cargado", () => {
    render_({ error: true, productos: [] });
    expect(screen.getByRole("alert").textContent).toMatch(/No se pudo cargar el catálogo/);
  });

  it("sin productos visibles (catálogo vacío real): mensaje específico, sin alert de error", () => {
    render_({ productos: [] });
    expect(screen.getByText(/Todavía no cargamos productos/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PublicCatalogoView — productos reales", () => {
  it("muestra nombre, precio y categoría de cada producto visible", () => {
    render_({ productos: [producto({ nombre: "Agua mineral", precioVenta: 1500, categoriaPublica: "Bebidas" })] });
    expect(screen.getByText("Agua mineral")).toBeTruthy();
    expect(screen.getByText("$1.500")).toBeTruthy();
    expect(screen.getByText("Bebidas")).toBeTruthy();
  });

  it("muestra la descripción pública cuando existe", () => {
    render_({ productos: [producto({ descripcionPublica: "Bien fría, 500ml" })] });
    expect(screen.getByText("Bien fría, 500ml")).toBeTruthy();
  });

  it("sin descripción: no renderiza ningún párrafo de descripción vacío", () => {
    render_({ productos: [producto({ descripcionPublica: null })] });
    expect(screen.queryByText("null")).toBeNull();
  });

  it("con imagen: usa la URL pública derivada del path guardado", () => {
    render_({ productos: [producto({ imagenPath: "abc-123.webp" })] });
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe("https://cdn.test/abc-123.webp");
    expect(obtenerUrlImagenProductoMock).toHaveBeenCalledWith("abc-123.webp");
  });

  it("sin imagen: no hay <img>, se ve el placeholder", () => {
    render_({ productos: [producto({ imagenPath: null })] });
    expect(screen.queryByRole("img")).toBeNull();
  });

  // PUBLIC-R7 — imagen_path puede apuntar a un archivo que ya no existe en el
  // bucket: antes no había fallback y el navegador mostraba su ícono roto
  // nativo en vez del mismo placeholder que ya se usa para "sin imagen".
  it("imagen rota (error de carga): cae al mismo placeholder que 'sin imagen', no deja el ícono roto del navegador", () => {
    render_({ productos: [producto({ imagenPath: "borrada.webp" })] });
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("destacado: muestra el badge 'Destacado'", () => {
    render_({ productos: [producto({ destacado: true })] });
    expect(screen.getByText("Destacado")).toBeTruthy();
  });

  it("no destacado: no muestra el badge 'Destacado'", () => {
    render_({ productos: [producto({ destacado: false })] });
    expect(screen.queryByText("Destacado")).toBeNull();
  });

  it("stock 0 (en_stock=false): el producto se MUESTRA igual, con badge 'Sin stock'", () => {
    render_({ productos: [producto({ nombre: "Pelotas Penn x3", enStock: false })] });
    expect(screen.getByText("Pelotas Penn x3")).toBeTruthy();
    expect(screen.getByText("Sin stock")).toBeTruthy();
  });

  it("con stock (en_stock=true): no muestra el badge 'Sin stock'", () => {
    render_({ productos: [producto({ enStock: true })] });
    expect(screen.queryByText("Sin stock")).toBeNull();
  });

  it("agrupa por categoría: cada categoría es un encabezado propio", () => {
    render_({
      productos: [
        producto({ id: "a", nombre: "Agua", categoriaPublica: "Bebidas" }),
        producto({ id: "b", nombre: "Grip", categoriaPublica: "Accesorios" }),
      ],
    });
    expect(screen.getByText("Bebidas")).toBeTruthy();
    expect(screen.getByText("Accesorios")).toBeTruthy();
  });

  it("nunca muestra stock numérico ni controles de compra/carrito/reserva", () => {
    render_({ productos: [producto()] });
    expect(screen.queryByText(/^Stock:/)).toBeNull();
    expect(screen.queryByRole("button", { name: /agregar|comprar|carrito|reservar/i })).toBeNull();
  });
});
