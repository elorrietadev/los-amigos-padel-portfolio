/** @vitest-environment jsdom */
import { selectPastDate } from "../../../components/ui/picker-test-helpers";
// Tests de D5 — HistorialView. Se mockea historial.api.ts a nivel de
// transporte (mismo criterio que VenderView.test.tsx con ventas.api.ts/
// reservas.api.ts): cada test controla exactamente qué "página" cruda
// devuelve `obtenerVentasConDetalle`, con el shape crudo real (snake_case,
// embeds anidados) que la query de historial.api.ts produce.
//
// R7 — rediseño lista+detalle (mismo patrón que ReservasView): la fila de
// cada venta (data-testid="fila-venta") muestra fecha/tipo/total/productos
// SIN seleccionarla; el desglose de pago, reserva, devuelto/neto y las
// acciones de devolución viven en el panel de detalle
// (data-testid="detalle-venta", el mismo testid en desktop y mobile — solo
// una de las dos ramas monta a la vez, igual que ReservasView.test.tsx) y
// requieren seleccionar la fila primero. Los tests que antes verificaban
// esos textos sin interacción ahora seleccionan la venta explícitamente
// (`seleccionarVenta`); los que solo verificaban metadata de lista (fecha,
// tipo, total, productos) siguen exactamente igual, sin tocar.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { UseProductosResult } from "../productos/useProductos";
import { registrarDevolucion } from "../devoluciones/devoluciones.api";
import { HistorialView, type HistorialViewProps } from "./HistorialView";
import { obtenerVentasConDetalle } from "./historial.api";
import type { ItemVentaCruda, VentaCruda } from "./historial.types";

vi.mock("./historial.api", () => ({
  obtenerVentasConDetalle: vi.fn(),
}));

vi.mock("../devoluciones/devoluciones.api", () => ({
  registrarDevolucion: vi.fn(),
}));

beforeEach(() => { Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1366 }); });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function crearItemCrudo(overrides: Partial<ItemVentaCruda> = {}): ItemVentaCruda {
  return {
    id: "item1",
    producto_id: "p1",
    cantidad: 3,
    precio_unitario_snapshot: 10000,
    costo_unitario_snapshot: 4000,
    subtotal: 30000,
    creado: new Date().toISOString(),
    productos: { nombre: "Pelotas" },
    devoluciones: [],
    ...overrides,
  };
}

function crearVentaCruda(overrides: Partial<VentaCruda> = {}): VentaCruda {
  return {
    id: "v1",
    reserva_id: null,
    fecha: "2026-01-07",
    pago_efectivo: 30000,
    pago_transferencia: 0,
    total: 30000,
    creado: new Date().toISOString(),
    reservas: null,
    venta_items: [crearItemCrudo()],
    ...overrides,
  };
}

// Respuesta neutra por default: sin ventas, sin error — evita que un test que
// no le presta atención al historial cuelgue esperando una promesa sin resolver.
function mockearPagina(ventas: VentaCruda[] = []) {
  vi.mocked(obtenerVentasConDetalle).mockResolvedValue({ data: ventas, error: null } as never);
}

function seccionFiltros() {
  return within(screen.getByText("Filtros").closest("section")!);
}

// R7 — panel de detalle (desktop card o bottom sheet mobile, mismo testid,
// mutuamente excluyentes). `getAllByTestId` + [0] en vez de getByTestId por
// las dudas de que algún test corra en un momento raro de transición — en la
// práctica siempre hay uno solo montado.
function panel() {
  return within(screen.getAllByTestId("detalle-venta")[0]);
}

// R7 — selecciona una venta a partir de un texto visible en su fila
// (fecha/total/nombre de producto/badge de reserva, lo que sea único en el
// test) y hace click en la fila completa (data-testid="fila-venta").
async function seleccionarVenta(user: ReturnType<typeof userEvent.setup>, texto: string | RegExp) {
  const el = screen.getByText(texto);
  const fila = el.closest('[data-testid="fila-venta"]') as HTMLElement;
  await user.click(fila);
  return fila;
}

// D6 — mismo criterio que useProductos real: instancia compartida por
// ProductosView entre VenderView e HistorialView. `ajustarStockLocal` es un
// spy en todos los tests para poder verificar cuántas veces (y con qué
// argumentos) se patchea el stock tras una devolución.
function crearProductosStub(overrides: Partial<UseProductosResult> = {}): UseProductosResult {
  return {
    productos: [],
    loading: false,
    error: false,
    recargar: vi.fn(),
    agregarProductoLocal: vi.fn(),
    actualizarProductoLocal: vi.fn(),
    ajustarStockLocal: vi.fn(),
    ...overrides,
  };
}

function renderHistorial(props: Partial<HistorialViewProps> = {}) {
  const mostrarToast = props.mostrarToast ?? vi.fn();
  const productos = props.productos ?? crearProductosStub();
  render(<HistorialView mostrarToast={mostrarToast} productos={productos} />);
  return { mostrarToast, productos };
}

describe("HistorialView — loading/error/vacío", () => {
  it("loading mientras carga la primera página", () => {
    vi.mocked(obtenerVentasConDetalle).mockReturnValue(new Promise(() => {}) as never);
    renderHistorial();

    expect(screen.getByText("Cargando historial...")).toBeTruthy();
  });

  it("error de carga: mensaje + Reintentar recarga con éxito", async () => {
    const user = userEvent.setup();
    vi.mocked(obtenerVentasConDetalle)
      .mockResolvedValueOnce({ data: null, error: { message: "fallo" } } as never)
      .mockResolvedValueOnce({ data: [crearVentaCruda({ id: "v1" })], error: null } as never);
    renderHistorial();

    expect(await screen.findByText("No se pudo cargar el historial.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Venta suelta")).toBeTruthy();
    expect(screen.queryByText("No se pudo cargar el historial.")).toBeNull();
  });

  it("sin ventas en el rango: mensaje vacío", async () => {
    mockearPagina([]);
    renderHistorial();

    expect(await screen.findByText("No hay ventas que coincidan en el rango elegido.")).toBeTruthy();
  });
});

describe("HistorialView — metadata de la venta (fila)", () => {
  it("la fila muestra fecha, tipo y total sin necesidad de seleccionarla", async () => {
    mockearPagina([crearVentaCruda({ total: 13500, pago_efectivo: 10000, pago_transferencia: 3500 })]);
    renderHistorial();

    expect(await screen.findByText("$13.500")).toBeTruthy();
    expect(screen.getByText("Venta suelta")).toBeTruthy();
  });

  it("seleccionar la venta muestra el desglose de efectivo/transferencia en el panel", async () => {
    const user = userEvent.setup();
    mockearPagina([crearVentaCruda({ total: 13500, pago_efectivo: 10000, pago_transferencia: 3500 })]);
    renderHistorial();
    await screen.findByText("$13.500");

    await seleccionarVenta(user, "$13.500");

    expect(panel().getByText(/Efectivo \$10\.000/)).toBeTruthy();
    expect(panel().getByText(/Transferencia \$3\.500/)).toBeTruthy();
  });

  it("venta suelta: badge 'Venta suelta' en la fila", async () => {
    mockearPagina([crearVentaCruda({ reserva_id: null, reservas: null })]);
    renderHistorial();

    expect(await screen.findByText("Venta suelta")).toBeTruthy();
  });

  it("venta atada: badge con nombre de la reserva en la fila", async () => {
    mockearPagina([
      crearVentaCruda({
        reserva_id: "r1",
        reservas: { id: "r1", nombre: "Juan", fecha: "2026-01-07", hora_inicio: "10:00:00", hora_fin: "11:00:00", confirmada: true },
      }),
    ]);
    renderHistorial();

    expect(await screen.findByText(/Atada a: Juan/)).toBeTruthy();
  });
});

describe("HistorialView — líneas de la venta (panel de detalle)", () => {
  it("la fila ya muestra el nombre del producto sin seleccionar", async () => {
    mockearPagina([
      crearVentaCruda({
        venta_items: [crearItemCrudo({ producto_id: "p1", cantidad: 3, productos: { nombre: "Pelotas" } })],
      }),
    ]);
    renderHistorial();

    expect(await screen.findByText("Pelotas")).toBeTruthy();
  });

  it("al seleccionar: cantidad original, precio/costo snapshot y subtotal original", async () => {
    const user = userEvent.setup();
    mockearPagina([
      crearVentaCruda({
        venta_items: [
          crearItemCrudo({
            producto_id: "p1",
            cantidad: 3,
            precio_unitario_snapshot: 10000,
            costo_unitario_snapshot: 4000,
            subtotal: 30000,
            productos: { nombre: "Pelotas" },
          }),
        ],
      }),
    ]);
    renderHistorial();
    await screen.findByText("Pelotas");

    await seleccionarVenta(user, "Pelotas");

    const p = panel();
    expect(p.getByText("Cantidad: 3")).toBeTruthy();
    expect(p.getByText(/Precio \$10\.000 · Costo \$4\.000/)).toBeTruthy();
    // "$30.000" aparece dos veces DENTRO del panel: el total de la venta
    // (header) y el subtotal de la línea (misma cifra en este caso).
    expect(p.getAllByText("$30.000")).toHaveLength(2);
  });

  it("sin devolución: no muestra cantidad devuelta/vigente ni subtotal vigente", async () => {
    const user = userEvent.setup();
    mockearPagina([crearVentaCruda({ venta_items: [crearItemCrudo({ devoluciones: [] })] })]);
    renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    expect(panel().queryByText(/devuelto/)).toBeNull();
    expect(panel().queryByText(/Subtotal vigente/)).toBeNull();
  });

  it("con devolución parcial: muestra cantidad devuelta/vigente y el subtotal vigente distinto del original", async () => {
    const user = userEvent.setup();
    mockearPagina([
      crearVentaCruda({
        venta_items: [
          crearItemCrudo({ cantidad: 3, precio_unitario_snapshot: 10000, subtotal: 30000, devoluciones: [{ cantidad: 1, medio_reembolso: "efectivo" }] }),
        ],
      }),
    ]);
    renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    expect(panel().getByText("Cantidad: 3 (devuelto 1, vigente 2)")).toBeTruthy();
    expect(panel().getByText("Subtotal vigente: $20.000")).toBeTruthy();
  });
});

describe("HistorialView — filtros y búsqueda", () => {
  it("buscador filtra por nombre de la reserva asociada", async () => {
    const user = userEvent.setup();
    mockearPagina([
      crearVentaCruda({
        id: "atada",
        reserva_id: "r1",
        reservas: { id: "r1", nombre: "Juan Pérez", fecha: "2026-01-07", hora_inicio: "10:00:00", hora_fin: "11:00:00", confirmada: true },
      }),
      crearVentaCruda({ id: "suelta", reserva_id: null, reservas: null }),
    ]);
    renderHistorial();
    await screen.findByText(/Atada a: Juan Pérez/);

    await user.type(seccionFiltros().getByPlaceholderText("Buscar por reserva o producto..."), "juan");

    expect(screen.getByText(/Atada a: Juan Pérez/)).toBeTruthy();
    expect(screen.queryByText("Venta suelta")).toBeNull();
  });

  it("buscador filtra por nombre de producto en las líneas", async () => {
    const user = userEvent.setup();
    mockearPagina([
      crearVentaCruda({ id: "v1", venta_items: [crearItemCrudo({ productos: { nombre: "Pelotas" } })] }),
      crearVentaCruda({ id: "v2", venta_items: [crearItemCrudo({ productos: { nombre: "Grips" } })] }),
    ]);
    renderHistorial();
    await screen.findByText("Pelotas");

    await user.type(seccionFiltros().getByPlaceholderText("Buscar por reserva o producto..."), "grips");

    expect(screen.queryByText("Pelotas")).toBeNull();
    expect(screen.getByText("Grips")).toBeTruthy();
  });

  it("filtro rápido Atadas/Sueltas", async () => {
    const user = userEvent.setup();
    mockearPagina([
      crearVentaCruda({
        id: "atada",
        reserva_id: "r1",
        reservas: { id: "r1", nombre: "Juan", fecha: "2026-01-07", hora_inicio: "10:00:00", hora_fin: "11:00:00", confirmada: true },
      }),
      crearVentaCruda({ id: "suelta", reserva_id: null, reservas: null }),
    ]);
    renderHistorial();
    await screen.findByText("Venta suelta");

    await user.click(screen.getByRole("button", { name: "Atadas" }));
    expect(screen.queryByText("Venta suelta")).toBeNull();
    expect(screen.getByText(/Atada a: Juan/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Sueltas" }));
    expect(screen.queryByText(/Atada a: Juan/)).toBeNull();
    expect(screen.getByText("Venta suelta")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Todas" }));
    expect(screen.getByText("Venta suelta")).toBeTruthy();
    expect(screen.getByText(/Atada a: Juan/)).toBeTruthy();
  });

  it("cambiar el rango (desde/hasta) recarga desde cero", async () => {
    mockearPagina([crearVentaCruda({ id: "v1" })]);
    renderHistorial();
    await screen.findByText("Venta suelta");
    expect(obtenerVentasConDetalle).toHaveBeenCalledTimes(1);

    selectPastDate(seccionFiltros().getByRole("button", { name: "Desde" }), "2020-01-01");

    await waitFor(() => expect(obtenerVentasConDetalle).toHaveBeenCalledTimes(2));
    const [params] = vi.mocked(obtenerVentasConDetalle).mock.calls[1] as [{ desde: string; hasta: string; offset: number }];
    expect(params.desde).toBe("2020-01-01");
    expect(params.offset).toBe(0);
  });
});

describe("HistorialView — cargar más antiguas", () => {
  it("no aparece si la primera página vino incompleta (no hay más)", async () => {
    mockearPagina([crearVentaCruda({ id: "v1" })]); // 1 fila, muy por debajo del tamaño de página
    renderHistorial();
    await screen.findByText("Venta suelta");

    expect(screen.queryByRole("button", { name: "Cargar más antiguas" })).toBeNull();
  });

  it("aparece si la página vino llena, pide la siguiente con el offset correcto y concatena sin duplicar", async () => {
    const user = userEvent.setup();
    const primeraPagina = Array.from({ length: 20 }, (_, i) => crearVentaCruda({ id: `v${i}`, fecha: "2026-01-07" }));
    const segundaPagina = [crearVentaCruda({ id: "v19", fecha: "2026-01-01" }), crearVentaCruda({ id: "v20", fecha: "2026-01-01" })];
    vi.mocked(obtenerVentasConDetalle)
      .mockResolvedValueOnce({ data: primeraPagina, error: null } as never)
      .mockResolvedValueOnce({ data: segundaPagina, error: null } as never);
    renderHistorial();
    await screen.findAllByText("Venta suelta");

    await user.click(screen.getByRole("button", { name: "Cargar más antiguas" }));

    await waitFor(() => expect(obtenerVentasConDetalle).toHaveBeenCalledTimes(2));
    const segundoLlamado = vi.mocked(obtenerVentasConDetalle).mock.calls[1][0] as { offset: number };
    expect(segundoLlamado.offset).toBe(20);
    // 20 de la primera página + 1 nueva de la segunda (v20; v19 ya estaba
    // cargada como parte de la primera tanda y se descarta al concatenar).
    await waitFor(() => expect(screen.getAllByText("Venta suelta")).toHaveLength(21));
  });

  it("error al cargar más: mensaje + el mismo botón reintenta con éxito", async () => {
    const user = userEvent.setup();
    const primeraPagina = Array.from({ length: 20 }, (_, i) => crearVentaCruda({ id: `v${i}` }));
    vi.mocked(obtenerVentasConDetalle)
      .mockResolvedValueOnce({ data: primeraPagina, error: null } as never)
      .mockResolvedValueOnce({ data: null, error: { message: "fallo" } } as never)
      .mockResolvedValueOnce({ data: [crearVentaCruda({ id: "v20" })], error: null } as never);
    renderHistorial();
    await screen.findAllByText("Venta suelta");

    await user.click(screen.getByRole("button", { name: "Cargar más antiguas" }));
    expect(await screen.findByText("No se pudieron cargar más ventas.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cargar más antiguas" }));

    await waitFor(() => expect(screen.queryByText("No se pudieron cargar más ventas.")).toBeNull());
    expect(obtenerVentasConDetalle).toHaveBeenCalledTimes(3);
  });
});

describe("HistorialView — Devoluciones (D6)", () => {
  it("con cantidad vigente > 0: botón 'Devolver' visible en el panel, sin badge de completa", async () => {
    const user = userEvent.setup();
    mockearPagina([crearVentaCruda({ venta_items: [crearItemCrudo({ cantidad: 3, devoluciones: [] })] })]);
    renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    expect(panel().getByRole("button", { name: "Devolver" })).toBeTruthy();
    expect(panel().queryByText("Devuelta completa")).toBeNull();
  });

  it("sin cantidad vigente (devuelta por completo): badge 'Devuelta completa' en el panel, sin botón", async () => {
    const user = userEvent.setup();
    mockearPagina([
      crearVentaCruda({
        venta_items: [crearItemCrudo({ cantidad: 2, devoluciones: [{ cantidad: 2, medio_reembolso: "efectivo" }] })],
      }),
    ]);
    renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    expect(panel().getByText("Devuelta completa")).toBeTruthy();
    expect(panel().queryByRole("button", { name: "Devolver" })).toBeNull();
  });

  it("click en 'Devolver' abre el modal con el producto y la cantidad vigente correctos", async () => {
    const user = userEvent.setup();
    mockearPagina([
      crearVentaCruda({
        venta_items: [crearItemCrudo({ cantidad: 3, devoluciones: [{ cantidad: 1, medio_reembolso: "efectivo" }] })],
      }),
    ]);
    renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    await user.click(panel().getByRole("button", { name: "Devolver" }));

    expect(screen.getByRole("dialog", { name: "Devolver · Pelotas" })).toBeTruthy();
    expect(screen.getByText("Cantidad disponible para devolver: 2")).toBeTruthy();
  });

  it("FINAL-F6 idempotencia: el reintento de la misma devolución usa la MISMA clave", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarDevolucion)
      .mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } } as never)
      .mockResolvedValueOnce({ data: "dev-1", error: null } as never);
    mockearPagina([
      crearVentaCruda({ id: "v1", total: 30000, venta_items: [crearItemCrudo({ id: "i1", producto_id: "p1", cantidad: 3, precio_unitario_snapshot: 10000, subtotal: 30000, devoluciones: [] })] }),
    ]);
    renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");
    await user.click(panel().getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));
    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledTimes(1));
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));
    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(registrarDevolucion).mock.calls;
    expect(calls[1][4]).toBe(calls[0][4]);
  });

  it("éxito con medio efectivo: cierra el modal, toast ok, patchea el panel sin refetch, stock +cantidad exactamente una vez", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-1", error: null } as never);
    mockearPagina([
      crearVentaCruda({
        id: "v1",
        total: 30000,
        venta_items: [
          crearItemCrudo({ id: "i1", producto_id: "p1", cantidad: 3, precio_unitario_snapshot: 10000, subtotal: 30000, devoluciones: [] }),
        ],
      }),
    ]);
    const { mostrarToast, productos } = renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    await user.click(panel().getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledWith("i1", 1, null, "efectivo", expect.any(String)));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mostrarToast).toHaveBeenCalledWith("Devolución registrada.", "ok");
    // Sin refetch: obtenerVentasConDetalle sigue habiendo sido llamado una
    // sola vez (la carga inicial) — el cambio se ve por patch local puro.
    expect(obtenerVentasConDetalle).toHaveBeenCalledTimes(1);
    expect(panel().getByText("Cantidad: 3 (devuelto 1, vigente 2)")).toBeTruthy();
    expect(panel().getByText("Subtotal vigente: $20.000")).toBeTruthy();
    expect(panel().getByText("Devuelto $10.000 · Neto $20.000")).toBeTruthy();
    expect(productos.ajustarStockLocal).toHaveBeenCalledTimes(1);
    expect(productos.ajustarStockLocal).toHaveBeenCalledWith("p1", 1, null);
  });

  it("éxito con medio transferencia: motivo vacío viaja como null, medio 'transferencia' llega al RPC", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-1", error: null } as never);
    mockearPagina([
      crearVentaCruda({
        venta_items: [crearItemCrudo({ id: "i1", producto_id: "p1", cantidad: 3, precio_unitario_snapshot: 10000, devoluciones: [] })],
      }),
    ]);
    renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    await user.click(panel().getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Transferencia" }));
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledWith("i1", 1, null, "transferencia", expect.any(String)));
  });

  it("dos devoluciones parciales con medios distintos acumulan cantidad/monto devuelto correctamente", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-1", error: null } as never);
    mockearPagina([
      crearVentaCruda({
        total: 30000,
        venta_items: [crearItemCrudo({ id: "i1", cantidad: 3, precio_unitario_snapshot: 10000, devoluciones: [] })],
      }),
    ]);
    renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    // Primera devolución: 1 unidad en efectivo.
    await user.click(panel().getByRole("button", { name: "Devolver" }));
    let modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Segunda devolución: 1 unidad más, por transferencia — el máximo del
    // modal ya refleja el remanente (2, no 3). El panel sigue mostrando la
    // misma venta seleccionada (patch local, sin perder la selección).
    await user.click(panel().getByRole("button", { name: "Devolver" }));
    modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    expect(screen.getByText("Cantidad disponible para devolver: 2")).toBeTruthy();
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Transferencia" }));
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(panel().getByText("Cantidad: 3 (devuelto 2, vigente 1)")).toBeTruthy());
    // 2 unidades devueltas en total (1 efectivo + 1 transferencia) a $10.000 c/u.
    expect(panel().getByText("Devuelto $20.000 · Neto $10.000")).toBeTruthy();
    expect(registrarDevolucion).toHaveBeenCalledTimes(2);
  });

  it("el patch de una devolución no toca otras líneas ni otras ventas", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-1", error: null } as never);
    mockearPagina([
      crearVentaCruda({
        id: "v1",
        venta_items: [
          crearItemCrudo({ id: "i1", producto_id: "p1", cantidad: 3, devoluciones: [], productos: { nombre: "Pelotas" } }),
          crearItemCrudo({ id: "i2", producto_id: "p2", cantidad: 5, devoluciones: [], productos: { nombre: "Grips" } }),
        ],
      }),
      crearVentaCruda({ id: "v2", venta_items: [crearItemCrudo({ id: "i3", producto_id: "p3", cantidad: 9, devoluciones: [], productos: { nombre: "Paletas" } })] }),
    ]);
    renderHistorial();
    await screen.findByText("Pelotas");

    // Selecciona v1 (Pelotas + Grips) y devuelve 1 unidad de Pelotas —
    // scopeado a la fila de ítem de Pelotas dentro del panel, para no
    // confundirla con el botón "Devolver" de Grips (misma venta, mismo panel).
    await seleccionarVenta(user, "Pelotas");
    const filaPelotas = panel().getByText("Pelotas").closest('[data-testid="item-venta"]') as HTMLElement;
    await user.click(within(filaPelotas).getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(panel().getByText("Cantidad: 3 (devuelto 1, vigente 2)")).toBeTruthy());
    // Grips (misma venta, panel todavía abierto): intacto, sin devolución.
    expect(panel().getByText("Cantidad: 5")).toBeTruthy();

    // Paletas vive en OTRA venta (v2): se selecciona aparte y se verifica que
    // el patch de arriba no la tocó.
    await seleccionarVenta(user, "Paletas");
    expect(panel().getByText("Cantidad: 9")).toBeTruthy();
  });

  it("error genérico del RPC: toast de error, modal sigue abierto, sin patch de historial ni de stock", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: null, error: { message: "network" } } as never);
    mockearPagina([
      crearVentaCruda({ venta_items: [crearItemCrudo({ id: "i1", producto_id: "p1", cantidad: 3, devoluciones: [] })] }),
    ]);
    const { mostrarToast, productos } = renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    await user.click(panel().getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("No se pudo registrar la devolución. Probá de nuevo.", "error"));
    expect(screen.getByRole("dialog", { name: "Devolver · Pelotas" })).toBeTruthy();
    expect(panel().getByText("Cantidad: 3")).toBeTruthy();
    expect(obtenerVentasConDetalle).toHaveBeenCalledTimes(1);
    expect(productos.ajustarStockLocal).not.toHaveBeenCalled();
  });

  it("devolucion_excede_disponible: toast específico, cierra el modal, recarga Historial desde el servidor, sin patch de stock", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: null, error: { message: "devolucion_excede_disponible" } } as never);
    vi.mocked(obtenerVentasConDetalle)
      .mockResolvedValueOnce({
        data: [crearVentaCruda({ id: "v1", venta_items: [crearItemCrudo({ id: "i1", producto_id: "p1", cantidad: 3, devoluciones: [] })] })],
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: [
          crearVentaCruda({
            id: "v1",
            venta_items: [crearItemCrudo({ id: "i1", producto_id: "p1", cantidad: 3, devoluciones: [{ cantidad: 3, medio_reembolso: "efectivo" }] })],
          }),
        ],
        error: null,
      } as never);
    const { mostrarToast, productos } = renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    await user.click(panel().getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "2");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith(
        "La cantidad disponible para devolver cambió, revisá el detalle e intentá de nuevo.",
        "error",
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(obtenerVentasConDetalle).toHaveBeenCalledTimes(2));
    // El estado que queda es el de la recarga real del servidor (devuelta
    // por completo), no un patch local optimista sobre el pedido fallido. La
    // venta sigue seleccionada (mismo id "v1" tras el refetch).
    await waitFor(() => expect(panel().getByText("Devuelta completa")).toBeTruthy());
    expect(productos.ajustarStockLocal).not.toHaveBeenCalled();
  });

  it("venta sin ninguna devolución: no muestra la línea de Devuelto/Neto en el panel", async () => {
    const user = userEvent.setup();
    mockearPagina([crearVentaCruda({ total: 30000, venta_items: [crearItemCrudo({ devoluciones: [] })] })]);
    renderHistorial();
    await screen.findByText("Pelotas");
    await seleccionarVenta(user, "Pelotas");

    expect(panel().queryByText(/Devuelto \$/)).toBeNull();
  });
});

// R7 — useEsDesktop (jsdom sin matchMedia) cae al fallback por
// window.innerWidth; seteándolo ANTES de renderizar, HistorialView monta
// directamente en la rama mobile (sin panel de detalle persistente, sino un
// bottom sheet al seleccionar una fila) — mismo criterio que
// ReservasView.test.tsx.
describe("HistorialView — mobile (R7)", () => {
  function usarAnchoMobile() {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
  }

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1366 });
  });

  it("no hay panel de detalle persistente; seleccionar una fila abre un bottom sheet que se puede cerrar", async () => {
    usarAnchoMobile();
    const user = userEvent.setup();
    mockearPagina([crearVentaCruda({ venta_items: [crearItemCrudo({ productos: { nombre: "Pelotas" } })] })]);
    renderHistorial();
    await screen.findByText("Pelotas");
    expect(screen.queryByTestId("detalle-venta")).toBeNull();

    await seleccionarVenta(user, "Pelotas");

    const sheet = await screen.findByRole("dialog", { name: "Detalle de la venta" });
    expect(within(sheet).getByRole("button", { name: "Devolver" })).toBeTruthy();

    await user.click(within(sheet).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Detalle de la venta" })).toBeNull());
  });
});
it.each([390, 1280])("P7.1 Historial: teclado y Escape a %s px", async (width) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  try {
    const user = userEvent.setup();
    mockearPagina([crearVentaCruda()]);
    renderHistorial();
    const opener = await screen.findByTestId("fila-venta");
    opener.focus();
    await user.keyboard("{Enter}");
    const detail = screen.getByRole(width < 1200 ? "dialog" : "region", { name: "Detalle de la venta" });
    expect(document.activeElement).toBe(detail);
    expect(document.body.style.overflow).toBe(width < 1200 ? "hidden" : "");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(document.body.style.overflow).toBe("");
  } finally {
    cleanup();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1366 });
  }
});
