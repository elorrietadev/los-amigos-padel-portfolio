/** @vitest-environment jsdom */
// Tests de D1 — ProductosView: catálogo (alta/edición) + reponer stock +
// confirmación de cambio de precio + stock bajo. D2 agrega: activar/
// desactivar + filtro por estado + stock bajo que ignora inactivos.
//
// R2 — "Vender"/"Historial" dejaron de ser sub-tabs de esta vista (ahora son
// destinos de navegación propios, ver AdminShell.tsx) y `productos` pasó a
// ser un prop obligatorio en vez de un hook interno. `ProductosViewConProductos`
// reproduce la instancia real de useProductos que antes creaba esta vista —
// mismos mocks de productos.api de siempre, un nivel más arriba. El helper
// `catalogo()` (data-testid="catalogo-panel") se mantiene tal cual aunque ya
// no haga falta desambiguar de ningún picker de Vender: no vale la pena
// tocar los ~30 call-sites que ya lo usan por algo que dejó de importar.
//
// Se mockea productos.api.ts a ese nivel (transporte), no un dominio propio —
// mismo criterio que el resto de las vistas migradas (ver BloqueosView.test.tsx).

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "../../../types/database.types";
import { exportarStock } from "../reportes/exportarStock";
import { ProductosView, type ProductosViewProps } from "./ProductosView";
import {
  actualizarCatalogoPublico,
  actualizarProducto,
  cambiarActivoProducto,
  crearProducto,
  obtenerProductos,
  reponerStock,
} from "./productos.api";
import { useProductos } from "./useProductos";

function ProductosViewConProductos(props: Omit<ProductosViewProps, "productos">) {
  const productos = useProductos();
  return <ProductosView {...props} productos={productos} />;
}

vi.mock("./productos.api", () => ({
  obtenerProductos: vi.fn(),
  crearProducto: vi.fn(),
  actualizarProducto: vi.fn(),
  actualizarCatalogoPublico: vi.fn(),
  reponerStock: vi.fn(),
  cambiarActivoProducto: vi.fn(),
  subirImagenProducto: vi.fn(),
  borrarImagenProducto: vi.fn(),
  obtenerUrlImagenProducto: vi.fn(() => ""),
}));

// PUBLIC-R4 — datos de catálogo "vacíos" (los defaults del formulario
// cuando el admin no toca ninguno de esos campos), el segundo argumento que
// confirmarGuardarProducto le manda a actualizarCatalogoPublico en los tests
// de alta/edición que no ejercitan el catálogo explícitamente.
const CATALOGO_VACIO = {
  mostrarEnCatalogo: false,
  destacado: false,
  categoriaPublica: null,
  descripcionPublica: null,
  ordenPublico: null,
  imagenPath: null,
};

// E6 — mockeado a nivel de orquestación (no productos.api/reportes.api de
// más abajo): estos tests solo verifican que ProductosView llama, bloquea
// doble click y traduce ok/error a toast — el todo-o-nada en sí ya está
// testeado en exportarStock.test.ts.
vi.mock("../reportes/exportarStock", () => ({
  exportarStock: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function crearProductoRow(overrides: Partial<Tables<"productos">> = {}): Tables<"productos"> {
  return {
    id: "p1",
    nombre: "Pelotas Odea x2",
    precio_venta: 10000,
    stock_actual: 20,
    stock_minimo: 5,
    activo: true,
    creado: new Date().toISOString(),
    mostrar_en_catalogo: false,
    imagen_path: null,
    categoria_publica: null,
    orden_publico: null,
    descripcion_publica: null,
    destacado: false,
    ...overrides,
  };
}

function mockearCarga(productos: Tables<"productos">[] = []) {
  vi.mocked(obtenerProductos).mockResolvedValue({ data: productos, error: null } as never);
}

// D3 — ver comentario de cabecera. Escopa al panel de Catálogo (`data-testid`
// puesto en ProductosView.tsx) para desambiguar de VenderView, que queda
// siempre montado (oculto con `hidden`) al lado.
function catalogo() {
  return within(screen.getByTestId("catalogo-panel"));
}

// R7 — Editar/Reponer stock/Activar-Desactivar viven en el menú de 3 puntos
// de cada card (antes eran botones sueltos): este helper busca la card por
// su nombre visible, abre su menú ("Más acciones") y devuelve la card para
// que el test siga interactuando adentro (ej. clickear "Desactivar").
async function abrirMenuAcciones(user: ReturnType<typeof userEvent.setup>, nombre: string) {
  const texto = screen.getByText(nombre);
  const card = texto.closest('[data-testid="producto-card"]') as HTMLElement;
  await user.click(within(card).getByRole("button", { name: "Más acciones" }));
  return card;
}

describe("ProductosView — catálogo", () => {
  it("sin productos: muestra 'No hay productos cargados todavía.'", async () => {
    mockearCarga();
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("No hay productos cargados todavía.");
  });

  it("filtro sin coincidencias: muestra mensaje específico (no el de catálogo vacío)", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow()]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");

    await user.type(screen.getByPlaceholderText("Buscar por nombre..."), "raqueta");

    expect(screen.getByText("No se encontraron productos con ese nombre.")).toBeTruthy();
    expect(screen.queryByText("No hay productos cargados todavía.")).toBeNull();
  });

  it("filtra por nombre case-insensitive", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "a", nombre: "Pelotas Odea x2" }), crearProductoRow({ id: "b", nombre: "Grips ODEA" })]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");

    await user.type(screen.getByPlaceholderText("Buscar por nombre..."), "grips");

    // Vender (D3) tiene su propio buscador, sin relación con el de Catálogo —
    // sigue mostrando ambos productos activos sin filtrar, de ahí el escopeo.
    expect(catalogo().queryByText("Pelotas Odea x2")).toBeNull();
    expect(catalogo().getByText("Grips ODEA")).toBeTruthy();
  });

  it("banner de stock bajo: singular con 1 producto", async () => {
    mockearCarga([crearProductoRow({ nombre: "Grips ODEA", stock_actual: 2, stock_minimo: 5 })]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    expect(await screen.findByText(/1 producto tiene stock bajo: Grips ODEA\./)).toBeTruthy();
  });

  it("banner de stock bajo: plural con 2+ productos, sin banner si ninguno está bajo", async () => {
    mockearCarga([
      crearProductoRow({ id: "a", nombre: "Grips ODEA", stock_actual: 2, stock_minimo: 5 }),
      crearProductoRow({ id: "b", nombre: "Pelotas Odea x2", stock_actual: 1, stock_minimo: 5 }),
    ]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    expect(await screen.findByText(/2 productos tienen stock bajo: Grips ODEA, Pelotas Odea x2\./)).toBeTruthy();

    cleanup();
    mockearCarga([crearProductoRow({ stock_actual: 20, stock_minimo: 5 })]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");
    expect(screen.queryByText(/stock bajo/)).toBeNull();
  });
});

describe("ProductosView — alta de producto", () => {
  it("nombre vacío: error inline, no llama a crearProducto", async () => {
    const user = userEvent.setup();
    mockearCarga();
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("No hay productos cargados todavía.");

    await user.click(screen.getByRole("button", { name: "Nuevo producto" }));
    const modal = screen.getByRole("dialog", { name: "Nuevo producto" });
    await user.type(within(modal).getByLabelText("Precio de venta"), "1000");
    await user.click(within(modal).getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Poné un nombre para el producto.")).toBeTruthy();
    expect(crearProducto).not.toHaveBeenCalled();
  });

  it("precio negativo: error inline, no llama a crearProducto", async () => {
    const user = userEvent.setup();
    mockearCarga();
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("No hay productos cargados todavía.");

    await user.click(screen.getByRole("button", { name: "Nuevo producto" }));
    const modal = screen.getByRole("dialog", { name: "Nuevo producto" });
    await user.type(within(modal).getByLabelText("Nombre"), "Producto nuevo");
    await user.type(within(modal).getByLabelText("Precio de venta"), "-500");
    await user.click(within(modal).getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("El precio de venta no puede ser negativo.")).toBeTruthy();
    expect(crearProducto).not.toHaveBeenCalled();
  });

  it("alta exitosa: llama crearProducto, cierra el modal, aparece en el catálogo, toast ok", async () => {
    const user = userEvent.setup();
    mockearCarga();
    const filaCreada = crearProductoRow({ id: "nuevo", nombre: "Producto nuevo" });
    vi.mocked(crearProducto).mockResolvedValue({ data: filaCreada, error: null } as never);
    vi.mocked(actualizarCatalogoPublico).mockResolvedValue({ data: filaCreada, error: null } as never);
    const mostrarToast = vi.fn();

    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("No hay productos cargados todavía.");

    await user.click(screen.getByRole("button", { name: "Nuevo producto" }));
    const modal = screen.getByRole("dialog", { name: "Nuevo producto" });
    await user.type(within(modal).getByLabelText("Nombre"), "Producto nuevo");
    await user.type(within(modal).getByLabelText("Precio de venta"), "5000");
    await user.click(within(modal).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(crearProducto).toHaveBeenCalledWith("Producto nuevo", 5000, 0));
    // PUBLIC-R4 — sin tocar ningún control de catálogo, se manda el mismo
    // producto recién creado (id "nuevo") con los defaults "vacíos".
    await waitFor(() => expect(actualizarCatalogoPublico).toHaveBeenCalledWith("nuevo", CATALOGO_VACIO));
    expect(mostrarToast).toHaveBeenCalledWith("Producto creado.", "ok");
    expect(screen.queryByRole("dialog", { name: "Nuevo producto" })).toBeNull();
    expect(await catalogo().findByText("Producto nuevo")).toBeTruthy();
  });

  it("alta con catálogo: manda mostrar/destacado/categoría/descripción/orden tal cual se tipearon", async () => {
    const user = userEvent.setup();
    mockearCarga();
    const filaCreada = crearProductoRow({ id: "nuevo", nombre: "Bebida isotónica" });
    vi.mocked(crearProducto).mockResolvedValue({ data: filaCreada, error: null } as never);
    vi.mocked(actualizarCatalogoPublico).mockResolvedValue({
      data: { ...filaCreada, mostrar_en_catalogo: true, destacado: true, categoria_publica: "Bebidas", descripcion_publica: "Bien fría", orden_publico: 2 },
      error: null,
    } as never);
    const mostrarToast = vi.fn();

    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("No hay productos cargados todavía.");

    await user.click(screen.getByRole("button", { name: "Nuevo producto" }));
    const modal = screen.getByRole("dialog", { name: "Nuevo producto" });
    await user.type(within(modal).getByLabelText("Nombre"), "Bebida isotónica");
    await user.type(within(modal).getByLabelText("Precio de venta"), "3000");
    await user.click(within(modal).getByLabelText("Mostrar en el catálogo público"));
    await user.click(within(modal).getByLabelText("Destacado"));
    await user.type(within(modal).getByLabelText("Categoría pública"), "Bebidas");
    await user.type(within(modal).getByLabelText("Descripción corta"), "Bien fría");
    await user.type(within(modal).getByLabelText("Orden en el catálogo (menor = primero)"), "2");
    await user.click(within(modal).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(actualizarCatalogoPublico).toHaveBeenCalledWith("nuevo", {
        mostrarEnCatalogo: true,
        destacado: true,
        categoriaPublica: "Bebidas",
        descripcionPublica: "Bien fría",
        ordenPublico: 2,
        imagenPath: null,
      }),
    );
    expect(mostrarToast).toHaveBeenCalledWith("Producto creado.", "ok");
  });

  it("error de red en el alta: toast de error, el modal sigue abierto con lo tipeado, no llega a actualizar el catálogo", async () => {
    const user = userEvent.setup();
    mockearCarga();
    vi.mocked(crearProducto).mockResolvedValue({ data: null, error: { message: "network" } } as never);
    const mostrarToast = vi.fn();

    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("No hay productos cargados todavía.");

    await user.click(screen.getByRole("button", { name: "Nuevo producto" }));
    const modal = screen.getByRole("dialog", { name: "Nuevo producto" });
    await user.type(within(modal).getByLabelText("Nombre"), "Producto nuevo");
    await user.type(within(modal).getByLabelText("Precio de venta"), "5000");
    await user.click(within(modal).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("No se pudo guardar el producto. Probá de nuevo.", "error"));
    expect(screen.getByRole("dialog", { name: "Nuevo producto" })).toBeTruthy();
    expect((within(modal).getByLabelText("Nombre") as HTMLInputElement).value).toBe("Producto nuevo");
    expect(actualizarCatalogoPublico).not.toHaveBeenCalled();
  });

  it("el producto se guarda pero falla el catálogo público: toast distinto, el producto igual aparece con lo base", async () => {
    const user = userEvent.setup();
    mockearCarga();
    const filaCreada = crearProductoRow({ id: "nuevo", nombre: "Producto nuevo" });
    vi.mocked(crearProducto).mockResolvedValue({ data: filaCreada, error: null } as never);
    vi.mocked(actualizarCatalogoPublico).mockResolvedValue({ data: null, error: { message: "network" } } as never);
    const mostrarToast = vi.fn();

    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("No hay productos cargados todavía.");

    await user.click(screen.getByRole("button", { name: "Nuevo producto" }));
    const modal = screen.getByRole("dialog", { name: "Nuevo producto" });
    await user.type(within(modal).getByLabelText("Nombre"), "Producto nuevo");
    await user.type(within(modal).getByLabelText("Precio de venta"), "5000");
    await user.click(within(modal).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith(
        "Se guardó el producto, pero no se pudo actualizar el catálogo público. Probá de nuevo.",
        "error",
      ),
    );
    expect(screen.getByRole("dialog", { name: "Nuevo producto" })).toBeTruthy();
    expect(await catalogo().findByText("Producto nuevo")).toBeTruthy();
  });
});

describe("ProductosView — edición de producto", () => {
  it("precarga los valores actuales y guarda cambios con patch local", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "p1", nombre: "Grips ODEA", precio_venta: 3500, stock_minimo: 10 })]);
    const filaEditada = crearProductoRow({ id: "p1", nombre: "Grips ODEA Pro", precio_venta: 4000, stock_minimo: 10 });
    vi.mocked(actualizarProducto).mockResolvedValue({ data: filaEditada, error: null } as never);
    vi.mocked(actualizarCatalogoPublico).mockResolvedValue({ data: filaEditada, error: null } as never);
    const mostrarToast = vi.fn();

    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("Grips ODEA");

    await abrirMenuAcciones(user, "Grips ODEA");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const modal = screen.getByRole("dialog", { name: "Editar producto" });
    expect((within(modal).getByLabelText("Nombre") as HTMLInputElement).value).toBe("Grips ODEA");
    expect((within(modal).getByLabelText("Precio de venta") as HTMLInputElement).value).toBe("3500");

    await user.clear(within(modal).getByLabelText("Nombre"));
    await user.type(within(modal).getByLabelText("Nombre"), "Grips ODEA Pro");
    await user.clear(within(modal).getByLabelText("Precio de venta"));
    await user.type(within(modal).getByLabelText("Precio de venta"), "4000");
    await user.click(within(modal).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(actualizarProducto).toHaveBeenCalledWith("p1", "Grips ODEA Pro", 4000, 10));
    // PUBLIC-R4 — el producto editado no tenía campos de catálogo cargados
    // (crearProductoRow default), y este test no los toca: se reenvían tal
    // cual estaban precargados en el form.
    await waitFor(() => expect(actualizarCatalogoPublico).toHaveBeenCalledWith("p1", CATALOGO_VACIO));
    expect(mostrarToast).toHaveBeenCalledWith("Producto actualizado.", "ok");
    expect(await catalogo().findByText("Grips ODEA Pro")).toBeTruthy();
    expect(screen.queryByText("Grips ODEA")).toBeNull();
  });
});

describe("ProductosView — reponer stock", () => {
  it("cantidad <= 0: error inline, no llama a reponerStock", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow()]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");

    await abrirMenuAcciones(user, "Pelotas Odea x2");
    await user.click(screen.getByRole("button", { name: "Reponer stock" }));
    const modal = screen.getByRole("dialog", { name: /Reponer stock/ });
    await user.type(within(modal).getByLabelText("Costo total"), "1000");
    await user.click(within(modal).getByRole("button", { name: "Reponer stock" }));

    expect(screen.getByText("La cantidad tiene que ser mayor a 0.")).toBeTruthy();
    expect(reponerStock).not.toHaveBeenCalled();
  });

  it("costo total negativo: error inline, no llama a reponerStock", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow()]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");

    await abrirMenuAcciones(user, "Pelotas Odea x2");
    await user.click(screen.getByRole("button", { name: "Reponer stock" }));
    const modal = screen.getByRole("dialog", { name: /Reponer stock/ });
    await user.type(within(modal).getByLabelText("Cantidad"), "5");
    await user.type(within(modal).getByLabelText("Costo total"), "-100");
    await user.click(within(modal).getByRole("button", { name: "Reponer stock" }));

    expect(screen.getByText("El costo total no puede ser negativo.")).toBeTruthy();
    expect(reponerStock).not.toHaveBeenCalled();
  });

  it("costo total en 0 es válido (no exige > 0)", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow()]);
    vi.mocked(reponerStock).mockResolvedValue({ data: "lote-1", error: null } as never);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");

    await abrirMenuAcciones(user, "Pelotas Odea x2");
    await user.click(screen.getByRole("button", { name: "Reponer stock" }));
    const modal = screen.getByRole("dialog", { name: /Reponer stock/ });
    await user.type(within(modal).getByLabelText("Cantidad"), "5");
    await user.type(within(modal).getByLabelText("Costo total"), "0");
    await user.click(within(modal).getByRole("button", { name: "Reponer stock" }));

    await waitFor(() => expect(reponerStock).toHaveBeenCalledWith("p1", 5, 0, null, 10000, false));
  });

  it("calculadora en vivo muestra el costo unitario mientras se tipea", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow()]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");

    await abrirMenuAcciones(user, "Pelotas Odea x2");
    await user.click(screen.getByRole("button", { name: "Reponer stock" }));
    const modal = screen.getByRole("dialog", { name: /Reponer stock/ });
    await user.type(within(modal).getByLabelText("Cantidad"), "4");
    await user.type(within(modal).getByLabelText("Costo total"), "10");

    expect(within(modal).getByText(/Costo unitario: \$2,5/)).toBeTruthy();
  });

  it("precio simulado igual al vigente: guarda directo, sin paso de confirmación", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "p1", precio_venta: 10000, stock_actual: 20 })]);
    vi.mocked(reponerStock).mockResolvedValue({ data: "lote-1", error: null } as never);
    const mostrarToast = vi.fn();

    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("Pelotas Odea x2");

    await abrirMenuAcciones(user, "Pelotas Odea x2");
    await user.click(screen.getByRole("button", { name: "Reponer stock" }));
    const modal = screen.getByRole("dialog", { name: /Reponer stock/ });
    await user.type(within(modal).getByLabelText("Cantidad"), "10");
    await user.type(within(modal).getByLabelText("Costo total"), "50000");
    // precio de venta queda en el default precargado (10000, igual al vigente)
    await user.click(within(modal).getByRole("button", { name: "Reponer stock" }));

    expect(screen.queryByRole("dialog", { name: "Confirmar precio de venta" })).toBeNull();
    await waitFor(() => expect(reponerStock).toHaveBeenCalledWith("p1", 10, 50000, null, 10000, false));
    expect(mostrarToast).toHaveBeenCalledWith("Stock repuesto.", "ok");
    // ajustarStockLocal: stock 20 + 10 = 30, precio sin tocar (10000)
    expect(await screen.findByText("Stock: 30")).toBeTruthy();
  });

  it("precio simulado distinto: 'Dejar como está' guarda con actualizarPrecioVenta=false y no cambia el precio mostrado", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "p1", precio_venta: 10000, stock_actual: 20 })]);
    vi.mocked(reponerStock).mockResolvedValue({ data: "lote-1", error: null } as never);

    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");

    await abrirMenuAcciones(user, "Pelotas Odea x2");
    await user.click(screen.getByRole("button", { name: "Reponer stock" }));
    const modal = screen.getByRole("dialog", { name: /Reponer stock/ });
    await user.type(within(modal).getByLabelText("Cantidad"), "10");
    await user.type(within(modal).getByLabelText("Costo total"), "50000");
    await user.clear(within(modal).getByLabelText("Precio de venta"));
    await user.type(within(modal).getByLabelText("Precio de venta"), "12000");
    await user.click(within(modal).getByRole("button", { name: "Reponer stock" }));

    const confirmModal = screen.getByRole("dialog", { name: "Confirmar precio de venta" });
    await user.click(within(confirmModal).getByRole("button", { name: "Dejar como está" }));

    await waitFor(() => expect(reponerStock).toHaveBeenCalledWith("p1", 10, 50000, null, 12000, false));
    expect(await screen.findByText("$10.000")).toBeTruthy();
  });

  it("precio simulado distinto: 'Actualizar precio' guarda con actualizarPrecioVenta=true y patchea el precio mostrado con el valor enviado", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "p1", precio_venta: 10000, stock_actual: 20 })]);
    vi.mocked(reponerStock).mockResolvedValue({ data: "lote-1", error: null } as never);

    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");

    await abrirMenuAcciones(user, "Pelotas Odea x2");
    await user.click(screen.getByRole("button", { name: "Reponer stock" }));
    const modal = screen.getByRole("dialog", { name: /Reponer stock/ });
    await user.type(within(modal).getByLabelText("Cantidad"), "10");
    await user.type(within(modal).getByLabelText("Costo total"), "50000");
    await user.clear(within(modal).getByLabelText("Precio de venta"));
    await user.type(within(modal).getByLabelText("Precio de venta"), "12000");
    await user.click(within(modal).getByRole("button", { name: "Reponer stock" }));

    const confirmModal = screen.getByRole("dialog", { name: "Confirmar precio de venta" });
    await user.click(within(confirmModal).getByRole("button", { name: "Actualizar precio" }));

    await waitFor(() => expect(reponerStock).toHaveBeenCalledWith("p1", 10, 50000, null, 12000, true));
    expect(await screen.findByText("$12.000")).toBeTruthy();
    expect(await screen.findByText("Stock: 30")).toBeTruthy();
  });

  it("click en el overlay del paso de confirmación de precio: no guarda nada, vuelve al formulario con los valores intactos", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "p1", precio_venta: 10000 })]);

    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");

    await abrirMenuAcciones(user, "Pelotas Odea x2");
    await user.click(screen.getByRole("button", { name: "Reponer stock" }));
    const modal = screen.getByRole("dialog", { name: /Reponer stock/ });
    await user.type(within(modal).getByLabelText("Cantidad"), "10");
    await user.type(within(modal).getByLabelText("Costo total"), "50000");
    await user.clear(within(modal).getByLabelText("Precio de venta"));
    await user.type(within(modal).getByLabelText("Precio de venta"), "12000");
    await user.click(within(modal).getByRole("button", { name: "Reponer stock" }));

    const confirmModal = screen.getByRole("dialog", { name: "Confirmar precio de venta" });
    // El overlay es el propio elemento con role dialog no — es su contenedor padre; el click
    // en el backdrop se simula clickeando el padre inmediato del card del modal.
    await user.click(confirmModal.parentElement!);

    expect(screen.queryByRole("dialog", { name: "Confirmar precio de venta" })).toBeNull();
    expect(reponerStock).not.toHaveBeenCalled();
    const modalTrasVolver = screen.getByRole("dialog", { name: /Reponer stock/ });
    expect((within(modalTrasVolver).getByLabelText("Cantidad") as HTMLInputElement).value).toBe("10");
    expect((within(modalTrasVolver).getByLabelText("Precio de venta") as HTMLInputElement).value).toBe("12000");
  });

  it("error de red en la reposición: toast de error, el modal sigue abierto, sin patch local", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "p1", stock_actual: 20 })]);
    vi.mocked(reponerStock).mockResolvedValue({ data: null, error: { message: "network" } } as never);
    const mostrarToast = vi.fn();

    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("Pelotas Odea x2");

    await abrirMenuAcciones(user, "Pelotas Odea x2");
    await user.click(screen.getByRole("button", { name: "Reponer stock" }));
    const modal = screen.getByRole("dialog", { name: /Reponer stock/ });
    await user.type(within(modal).getByLabelText("Cantidad"), "10");
    await user.type(within(modal).getByLabelText("Costo total"), "50000");
    await user.click(within(modal).getByRole("button", { name: "Reponer stock" }));

    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith("No se pudo registrar la reposición. Probá de nuevo.", "error"),
    );
    expect(screen.getByRole("dialog", { name: /Reponer stock/ })).toBeTruthy();
    expect(screen.getByText("Stock: 20")).toBeTruthy();
  });
});

describe("ProductosView — activo/inactivo (D2)", () => {
  it("desactivar: llama a cambiarActivoProducto, toast 'Producto desactivado.', y desaparece del filtro Activos (default)", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "p1", nombre: "Pelotas Odea x2", activo: true })]);
    vi.mocked(cambiarActivoProducto).mockResolvedValue({
      data: crearProductoRow({ id: "p1", nombre: "Pelotas Odea x2", activo: false }),
      error: null,
    } as never);
    const mostrarToast = vi.fn();

    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("Pelotas Odea x2");
    const card = await abrirMenuAcciones(user, "Pelotas Odea x2");

    await user.click(within(card).getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(cambiarActivoProducto).toHaveBeenCalledWith("p1", false));
    expect(mostrarToast).toHaveBeenCalledWith("Producto desactivado.", "ok");
    // Tras desactivarse, ninguno de los dos paneles lo muestra (Catálogo por
    // el filtro "Activos", Vender porque ya no es activo) — sin colisión.
    await waitFor(() => expect(screen.queryByText("Pelotas Odea x2")).toBeNull());
    expect(screen.getByText("No hay productos activos.")).toBeTruthy();
  });

  it("activar: llama a cambiarActivoProducto, toast 'Producto activado.' — visible desde el filtro Inactivos", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "p1", nombre: "Grips ODEA", activo: false })]);
    vi.mocked(cambiarActivoProducto).mockResolvedValue({
      data: crearProductoRow({ id: "p1", nombre: "Grips ODEA", activo: true }),
      error: null,
    } as never);
    const mostrarToast = vi.fn();

    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await screen.findByText("No hay productos activos."); // default "Activos" está vacío, el único producto es inactivo

    await user.click(screen.getByRole("button", { name: "Inactivos" }));
    // Todavía inactivo en este punto (recién se activa más abajo) — Vender
    // no lo muestra (filtra por activo), así que no hay colisión acá.
    await screen.findByText("Grips ODEA");
    const card = await abrirMenuAcciones(user, "Grips ODEA");
    await user.click(within(card).getByRole("button", { name: "Activar" }));

    await waitFor(() => expect(cambiarActivoProducto).toHaveBeenCalledWith("p1", true));
    expect(mostrarToast).toHaveBeenCalledWith("Producto activado.", "ok");
  });

  it("error al activar/desactivar: toast de error, sin cambio local (sigue activo y visible en Activos)", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "p1", nombre: "Pelotas Odea x2", activo: true })]);
    vi.mocked(cambiarActivoProducto).mockResolvedValue({ data: null, error: { message: "network" } } as never);
    const mostrarToast = vi.fn();

    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("Pelotas Odea x2");
    const card = await abrirMenuAcciones(user, "Pelotas Odea x2");

    await user.click(within(card).getByRole("button", { name: "Desactivar" }));

    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith("No se pudo actualizar el producto. Probá de nuevo.", "error"),
    );
    expect(catalogo().getByText("Pelotas Odea x2")).toBeTruthy();
    // Falló: sigue activo, el menú se había cerrado al clickear (mismo
    // criterio que un click exitoso) — se reabre para verificar que la
    // acción sigue diciendo "Desactivar" (no cambió de estado).
    const cardTrasError = await abrirMenuAcciones(user, "Pelotas Odea x2");
    expect(within(cardTrasError).getByRole("button", { name: "Desactivar" })).toBeTruthy();
  });

  it("filtro 'Activos' (default): no muestra inactivos", async () => {
    mockearCarga([
      crearProductoRow({ id: "a", nombre: "Activo A", activo: true }),
      crearProductoRow({ id: "b", nombre: "Inactivo B", activo: false }),
    ]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);

    await catalogo().findByText("Activo A");
    // Inactivo B: ninguno de los dos paneles lo muestra, sin colisión.
    expect(screen.queryByText("Inactivo B")).toBeNull();
  });

  it("filtro 'Inactivos': muestra solo los inactivos", async () => {
    const user = userEvent.setup();
    mockearCarga([
      crearProductoRow({ id: "a", nombre: "Activo A", activo: true }),
      crearProductoRow({ id: "b", nombre: "Inactivo B", activo: false }),
    ]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Activo A");

    await user.click(screen.getByRole("button", { name: "Inactivos" }));

    // Vender sigue mostrando "Activo A" (activo:true, su propio filtro no
    // depende del de Catálogo) aunque Catálogo ya lo haya escondido — de ahí
    // el escopeo acá.
    expect(catalogo().queryByText("Activo A")).toBeNull();
    expect(screen.getByText("Inactivo B")).toBeTruthy();
  });

  it("filtro 'Todos': muestra activos e inactivos juntos", async () => {
    const user = userEvent.setup();
    mockearCarga([
      crearProductoRow({ id: "a", nombre: "Activo A", activo: true }),
      crearProductoRow({ id: "b", nombre: "Inactivo B", activo: false }),
    ]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Activo A");

    await user.click(screen.getByRole("button", { name: "Todos" }));

    expect(catalogo().getByText("Activo A")).toBeTruthy();
    expect(screen.getByText("Inactivo B")).toBeTruthy();
  });

  it("filtro + búsqueda por nombre combinados", async () => {
    const user = userEvent.setup();
    mockearCarga([
      crearProductoRow({ id: "a", nombre: "Pelotas Odea x2", activo: false }),
      crearProductoRow({ id: "b", nombre: "Grips ODEA", activo: false }),
    ]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await screen.findByText("No hay productos activos.");

    await user.click(screen.getByRole("button", { name: "Inactivos" }));
    await screen.findByText("Pelotas Odea x2");
    await user.type(screen.getByPlaceholderText("Buscar por nombre..."), "grips");

    expect(screen.queryByText("Pelotas Odea x2")).toBeNull();
    expect(screen.getByText("Grips ODEA")).toBeTruthy();
  });

  it("banner de stock bajo: ignora productos inactivos aunque tengan stock bajo", async () => {
    const user = userEvent.setup();
    mockearCarga([
      crearProductoRow({ id: "a", nombre: "Activo bajo", activo: true, stock_actual: 1, stock_minimo: 5 }),
      crearProductoRow({ id: "b", nombre: "Inactivo bajo", activo: false, stock_actual: 1, stock_minimo: 5 }),
    ]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Activo bajo");

    expect(screen.getByText(/1 producto tiene stock bajo: Activo bajo\./)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Todos" }));
    // El badge informativo de la card inactiva puede seguir mostrándose (se
    // verifica en el test de jerarquía visual de abajo); el banner agregado
    // sigue contando solo al activo, sin importar qué filtro se esté viendo.
    expect(screen.getByText(/1 producto tiene stock bajo: Activo bajo\./)).toBeTruthy();
  });

  it("card inactiva con stock bajo: 'Inactivo' es el badge principal, 'Stock bajo' aparece con menor jerarquía (sin badge)", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "a", nombre: "Producto X", activo: false, stock_actual: 1, stock_minimo: 5 })]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Inactivos" }));
    const nombre = await screen.findByText("Producto X");
    const card = nombre.closest('[data-testid="producto-card"]') as HTMLElement;

    const badgeInactivo = within(card).getByText("Inactivo");
    expect(badgeInactivo.className).toContain("rounded-pill");

    const textoStockBajo = within(card).getByText("⚠ Stock bajo");
    expect(textoStockBajo.className).not.toContain("rounded-pill");
  });

  it("Editar y Reponer stock siguen disponibles en un producto inactivo", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow({ id: "p1", nombre: "Producto inactivo", activo: false })]);
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Inactivos" }));
    await screen.findByText("Producto inactivo");

    const card1 = await abrirMenuAcciones(user, "Producto inactivo");
    await user.click(within(card1).getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("dialog", { name: "Editar producto" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    // El menú se cerró al abrir "Editar" — se reabre para "Reponer stock".
    const card2 = await abrirMenuAcciones(user, "Producto inactivo");
    await user.click(within(card2).getByRole("button", { name: "Reponer stock" }));
    expect(screen.getByRole("dialog", { name: /Reponer stock/ })).toBeTruthy();
  });
});

describe("ProductosView — exportar stock (E6)", () => {
  it("éxito: llama a exportarStock y muestra toast de éxito", async () => {
    const user = userEvent.setup();
    const mostrarToast = vi.fn();
    mockearCarga([crearProductoRow()]);
    vi.mocked(exportarStock).mockResolvedValue({ ok: true });
    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("Pelotas Odea x2");

    await user.click(catalogo().getByRole("button", { name: "Exportar stock" }));
    expect(exportarStock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("Excel de stock generado.", "ok"));
  });

  it("error: NO genera archivo (según exportarStock), muestra toast de error", async () => {
    const user = userEvent.setup();
    const mostrarToast = vi.fn();
    mockearCarga([crearProductoRow()]);
    vi.mocked(exportarStock).mockResolvedValue({ ok: false, error: "No se pudo generar el reporte de stock. Probá de nuevo." });
    render(<ProductosViewConProductos mostrarToast={mostrarToast} />);
    await catalogo().findByText("Pelotas Odea x2");

    await user.click(catalogo().getByRole("button", { name: "Exportar stock" }));
    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith("No se pudo generar el reporte de stock. Probá de nuevo.", "error"),
    );
  });

  it("evita doble click: mientras genera, el botón queda deshabilitado y exportarStock se llama una sola vez", async () => {
    const user = userEvent.setup();
    mockearCarga([crearProductoRow()]);
    let resolver!: (v: { ok: true }) => void;
    vi.mocked(exportarStock).mockReturnValue(new Promise((res) => (resolver = res)));
    render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
    await catalogo().findByText("Pelotas Odea x2");

    const boton = catalogo().getByRole("button", { name: "Exportar stock" });
    await user.click(boton);
    expect((catalogo().getByRole("button", { name: "Generando..." }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(catalogo().getByRole("button", { name: "Generando..." }));
    expect(exportarStock).toHaveBeenCalledTimes(1);

    resolver({ ok: true });
    await waitFor(() =>
      expect((catalogo().getByRole("button", { name: "Exportar stock" }) as HTMLButtonElement).disabled).toBe(false),
    );
  });
});

it("no confunde un error de catálogo con vacío y permite reintentar", async () => {
  const user = userEvent.setup();
  mockearCarga([]);
  vi.mocked(obtenerProductos).mockResolvedValueOnce({ data: null, error: { message: "offline" } } as never);
  render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
  expect(screen.getByRole("status").textContent).toContain("Cargando productos");
  expect(screen.queryByText("No hay productos cargados todavía.")).toBeNull();
  await screen.findByRole("alert");
  expect(screen.queryByText("No hay productos cargados todavía.")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByText("No hay productos cargados todavía.");
  expect(screen.queryByRole("alert")).toBeNull();
});


it("stock inicial abre el lote y nunca convierte costo desconocido en cero", async () => {
  mockearCarga();
  const fila = crearProductoRow({ id: "nuevo", nombre: "Nuevo", stock_actual: 0 });
  vi.mocked(crearProducto).mockResolvedValue({ data: fila, error: null } as never);
  vi.mocked(actualizarCatalogoPublico).mockResolvedValue({ data: fila, error: null } as never);
  render(<ProductosViewConProductos mostrarToast={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
  await userEvent.type(screen.getByLabelText("Nombre"), "Nuevo");
  await userEvent.type(screen.getByLabelText("Precio de venta"), "100");
  await userEvent.clear(screen.getByLabelText(/Stock inicial/));
  await userEvent.type(screen.getByLabelText(/Stock inicial/), "12");
  await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
  const modal = await screen.findByRole("dialog", { name: /Reponer stock/ });
  expect((within(modal).getByLabelText("Cantidad") as HTMLInputElement).value).toBe("12");
  await userEvent.click(within(modal).getByRole("button", { name: "Reponer stock" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(reponerStock).not.toHaveBeenCalled();
});
