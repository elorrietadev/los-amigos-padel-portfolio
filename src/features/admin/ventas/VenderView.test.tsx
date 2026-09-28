/** @vitest-environment jsdom */
// Tests de D3 (venta suelta) + D4 (venta atada a reserva) — VenderView.
// `productos` se pasa como objeto plano (no el hook real) — esta vista solo
// lee `.productos` y llama a los métodos de patch que expone, mismo criterio
// que `turnosFijos` en TurnosFijosView.test.tsx. Se mockea ventas.api.ts y
// reservas.api.ts a nivel de transporte (esta última la usa internamente
// useReservasParaVenta, sin hook propio para reservas: ver cabecera de
// VenderView.tsx).

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../productos/productos.logic";
import type { UseProductosResult } from "../productos/useProductos";
import { obtenerReservasPorRango } from "../reservas/reservas.api";
import type { ReservaRow } from "../reservas/reservas.types";
import { VenderView } from "./VenderView";
import { registrarVenta } from "./ventas.api";

vi.mock("./ventas.api", () => ({
  registrarVenta: vi.fn(),
}));

vi.mock("../reservas/reservas.api", () => ({
  obtenerReservasPorRango: vi.fn(),
}));

// P2 — "en juego" para la reserva default de crearReserva (10:00-11:00,
// 2026-01-07): mismo mecanismo que ReservasView.test.tsx (vi.setSystemTime
// solo mockea Date, no los timers de userEvent) para que VenderView, que lee
// Date.now() directo (sin `ahora` inyectable por props), tenga un "ahora"
// determinístico. Cada test que necesite otro instante lo pisa llamando de
// nuevo a vi.setSystemTime.
const AHORA_FIJO = new Date("2026-01-07T10:30:00");

beforeEach(() => {
  vi.setSystemTime(AHORA_FIJO);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function crearProducto(overrides: Partial<Producto> = {}): Producto {
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

function crearReserva(overrides: Partial<ReservaRow> = {}): ReservaRow {
  return {
    id: "r1",
    fecha: "2026-01-07",
    hora_inicio: "10:00:00",
    hora_fin: "11:00:00",
    nombre: "Juan",
    telefono: "3771111111",
    precio: 20000,
    creado: new Date().toISOString(),
    bloqueado: false,
    confirmada: false,
    pago_efectivo: 0,
    pago_transferencia: 0,
    turno_fijo_id: null,
    telefono_normalizado: null,
    hora_apertura_vigente: null,
    ...overrides,
  };
}

// D4 — solo la necesitan los tests que entran a modo "atada" (el fetch se
// dispara recién ahí, ver useEffect de VenderView.tsx): los tests de venta
// suelta nunca llaman a `obtenerReservasPorRango`, así que no necesitan
// mockearlo.
function mockearReservas(data: ReservaRow[] = []) {
  vi.mocked(obtenerReservasPorRango).mockResolvedValue({ data, error: null } as never);
}

function crearProductosStub(productos: Producto[], overrides: Partial<UseProductosResult> = {}): UseProductosResult {
  return {
    productos,
    loading: false,
    error: false,
    recargar: vi.fn(),
    agregarProductoLocal: vi.fn(),
    actualizarProductoLocal: vi.fn(),
    ajustarStockLocal: vi.fn(),
    ...overrides,
  };
}

// Escopado a la sección "Catálogo": una vez que un producto ya está en el
// carrito, su nombre aparece también en la línea del carrito — buscarlo en
// toda la pantalla sería ambiguo.
function seccionAgregar() {
  return within(screen.getByText("Catálogo").closest("section")!);
}

// R6 — el nombre y el botón "Agregar" ya no comparten un mismo contenedor
// directo (la card de catálogo tiene nombre/precio-stock/botón en filas
// separadas): se sube hasta la card entera (data-testid="producto-card") en
// vez de `.parentElement`.
function filaAgregar(nombre: string) {
  return within(seccionAgregar().getByText(nombre).closest('[data-testid="producto-card"]')!).getByRole("button", {
    name: "Agregar",
  });
}

// D4 — mismo criterio que seccionAgregar/filaAgregar: escopar a la sección
// "Reserva" para no ambiguar con el resto de la pantalla.
function seccionReserva() {
  return within(screen.getByText("Reserva").closest("section")!);
}

// Cada fila del picker es un <button> completo (clickear cualquier parte de
// la fila selecciona la reserva, no hace falta un botón "+ Agregar" separado
// como en productos).
function filaReserva(nombre: string) {
  return seccionReserva().getByText(nombre).closest("button")!;
}

function crearDiferido<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("VenderView — productos disponibles para agregar", () => {
  it("excluye productos inactivos", () => {
    const productos = crearProductosStub([
      crearProducto({ id: "a", nombre: "Activo", activo: true }),
      crearProducto({ id: "b", nombre: "Inactivo", activo: false }),
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);

    expect(screen.getByText("Activo")).toBeTruthy();
    expect(screen.queryByText("Inactivo")).toBeNull();
  });

  it("el buscador filtra por nombre", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([
      crearProducto({ id: "a", nombre: "Pelotas Odea x2" }),
      crearProducto({ id: "b", nombre: "Grips ODEA" }),
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);

    await user.type(screen.getByPlaceholderText("Buscar producto para agregar..."), "grips");

    expect(screen.queryByText("Pelotas Odea x2")).toBeNull();
    expect(screen.getByText("Grips ODEA")).toBeTruthy();
  });

  it("catálogo vacío / sin coincidencias: mensajes correspondientes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);
    expect(screen.getByText("No hay productos cargados todavía.")).toBeTruthy();

    rerender(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([crearProducto({ nombre: "Pelotas" })])} />);
    await user.type(screen.getByPlaceholderText("Buscar producto para agregar..."), "raqueta");
    expect(screen.getByText("No hay productos disponibles para vender.")).toBeTruthy();
  });
});

describe("VenderView — carrito", () => {
  it("agregar un producto crea una línea con cantidad 1 y el total correcto", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);

    await user.click(filaAgregar("Pelotas"));

    expect(screen.getByLabelText("Cantidad")).toBeTruthy();
    expect(screen.getByText("Total").parentElement?.textContent).toContain("$10.000");
  });

  it("agregar el mismo producto dos veces funde en una sola línea con cantidad 2", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);

    await user.click(filaAgregar("Pelotas"));
    await user.click(filaAgregar("Pelotas"));

    expect(screen.getAllByRole("button", { name: "Quitar" })).toHaveLength(1);
    expect((screen.getByLabelText("Cantidad") as HTMLInputElement).value).toBe("2");
    expect(screen.getByText("Total").parentElement?.textContent).toContain("$20.000");
  });

  it("cambiar cantidad recalcula el total", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));

    // fireEvent.change (no user.clear+type): los inputs type="number" no
    // soportan selección de texto (setSelectionRange), así que
    // userEvent.type no puede reemplazar el valor existente — terminaría
    // insertando el nuevo dígito al final del valor clampeado ("1" + "3" =
    // "13"). fireEvent.change setea el valor final en un solo paso.
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "3" } });

    expect(screen.getByText("Total").parentElement?.textContent).toContain("$30.000");
  });

  // R6 — stepper +/- agregado sobre el mismo input existente (fireEvent.change
  // arriba sigue cubriendo el tipeo directo); acá se cubre el click de los
  // botones nuevos.
  it("stepper +/-: 'Sumar uno' y 'Restar uno' cambian la cantidad y el total; 'Restar uno' se deshabilita en 1", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));

    const restar = screen.getByRole("button", { name: "Restar uno" });
    expect((restar as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Sumar uno" }));
    expect((screen.getByLabelText("Cantidad") as HTMLInputElement).value).toBe("2");
    expect(screen.getByText("Total").parentElement?.textContent).toContain("$20.000");
    expect((restar as HTMLButtonElement).disabled).toBe(false);

    await user.click(restar);
    expect((screen.getByLabelText("Cantidad") as HTMLInputElement).value).toBe("1");
    expect(screen.getByText("Total").parentElement?.textContent).toContain("$10.000");
    expect((restar as HTMLButtonElement).disabled).toBe(true);
  });

  it("quitar del carrito lo saca de la lista y del total", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));

    await user.click(screen.getByRole("button", { name: "Quitar" }));

    expect(screen.getByText("Todavía no agregaste productos.")).toBeTruthy();
    expect(screen.getByText("Total").parentElement?.textContent).toContain("$0");
  });

  it("excede stock: muestra el aviso inline con el stock vigente", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", stock_actual: 2 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));

    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "5" } });

    expect(screen.getByText("⚠ Stock disponible: 2")).toBeTruthy();
  });
});

describe("VenderView — precio y stock SIEMPRE derivados en vivo (no snapshot)", () => {
  it("si el precio del catálogo cambia con el carrito abierto, el total usa el precio NUEVO", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000 })]);
    const { rerender } = render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    expect(screen.getByText("Total").parentElement?.textContent).toContain("$10.000");

    // Misma instancia de useProductos, pero con el precio ya actualizado
    // (ej. una edición hecha en Catálogo mientras el carrito seguía abierto).
    rerender(
      <VenderView
        mostrarToast={vi.fn()}
        productos={crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 15000 })])}
      />,
    );

    expect(screen.getByText("Total").parentElement?.textContent).toContain("$15.000");
  });
});

describe("VenderView — producto inactivo en el carrito (bloqueo duro)", () => {
  it("si un producto del carrito se vuelve inactivo, la línea se marca 'Inactivo' pero NO se purga sola", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas" })]);
    const { rerender } = render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));

    rerender(
      <VenderView
        mostrarToast={vi.fn()}
        productos={crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", activo: false })])}
      />,
    );

    // La línea sigue en el carrito (no se purgó) y ahora se marca inactiva.
    expect(screen.getByRole("button", { name: "Quitar" })).toBeTruthy();
    expect(screen.getByText("Inactivo")).toBeTruthy();
  });

  it("bloquea 'Registrar venta' con un producto inactivo en el carrito, sin ConfirmModal y sin llamar al RPC", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", activo: false })]);
    // El producto ya está inactivo desde el inicio: no puede agregarse desde
    // el picker (no aparece), así que se simula el carrito ya armado vía
    // rerender con el producto todavía activo al agregar, y luego inactivo.
    const activoInicial = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", activo: true })]);
    const { rerender } = render(<VenderView mostrarToast={vi.fn()} productos={activoInicial} />);
    await user.click(filaAgregar("Pelotas"));
    rerender(<VenderView mostrarToast={vi.fn()} productos={productos} />);

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    expect(
      screen.getByText("Hay productos inactivos (o que ya no existen) en el carrito — quitalos o reactivalos antes de registrar la venta."),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Confirmar venta" })).toBeNull();
    expect(registrarVenta).not.toHaveBeenCalled();
  });
});

describe("VenderView — pago", () => {
  it("efectivo/transferencia autocompletan el total (los inputs de mixto no aparecen)", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));

    expect(screen.queryByLabelText("Monto en efectivo")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Transferencia" }));
    expect(screen.queryByLabelText("Monto en efectivo")).toBeNull();
  });

  it("mixto: autocálculo bidireccional entre efectivo y transferencia", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Mixto" }));

    await user.clear(screen.getByLabelText("Monto en efectivo"));
    await user.type(screen.getByLabelText("Monto en efectivo"), "3000");

    expect((screen.getByLabelText("Monto en transferencia") as HTMLInputElement).value).toBe("7000");
  });
});

describe("VenderView — registrar venta", () => {
  it("carrito vacío: mensaje inline, no llama a registrarVenta", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas" })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    expect(screen.getByText("Agregá al menos un producto.")).toBeTruthy();
    expect(registrarVenta).not.toHaveBeenCalled();
  });

  it("sin problemas de stock ni pago: registra directo, sin ConfirmModal", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({ data: "venta-1", error: null } as never);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    expect(screen.queryByRole("dialog", { name: "Confirmar venta" })).toBeNull();
    await waitFor(() => expect(registrarVenta).toHaveBeenCalledWith([{ producto_id: "p1", cantidad: 1 }], 10000, 0, false, null, expect.any(String)));
  });

  it("stock insuficiente: abre ConfirmModal con el mensaje correcto; 'Volver' no llama al RPC ni toca el carrito", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 2 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "5" } });

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    const modal = screen.getByRole("dialog", { name: "Confirmar venta" });
    expect(within(modal).getByText(/No hay stock suficiente de Pelotas \(pedís 5, hay 2\)\./)).toBeTruthy();

    await user.click(within(modal).getByRole("button", { name: "Volver" }));

    expect(registrarVenta).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Cantidad") as HTMLInputElement).value).toBe("5");
  });

  it("stock insuficiente: 'Registrar igual' llama con forzarStockInsuficiente=true", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({ data: "venta-1", error: null } as never);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 2 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "5" } });
    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    const modal = screen.getByRole("dialog", { name: "Confirmar venta" });
    await user.click(within(modal).getByRole("button", { name: "Registrar igual" }));

    await waitFor(() => expect(registrarVenta).toHaveBeenCalledWith([{ producto_id: "p1", cantidad: 5 }], 50000, 0, true, null, expect.any(String)));
  });

  // E1 — decisión de negocio: ya no existe "Registrar igual" para un pago
  // desajustado. Bloquea inline, sin ConfirmModal, sin llamar al RPC — mismo
  // criterio que "Agregá al menos un producto."/"Elegí una reserva.".
  it("mixto: pago mayor al total bloquea sin ConfirmModal ni llamada al RPC", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Mixto" }));
    // admin.html:74-83 (PaymentModal.cambiarMontoEfectivo) — el complemento se
    // clampea a 0 cuando el monto tipeado supera el total: es la forma real
    // de generar un desajuste "por exceso" (tipear los dos montos manualmente
    // siempre los rebalancea a la suma exacta, por diseño).
    await user.type(screen.getByLabelText("Monto en efectivo"), "{selectall}15000");

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    expect(
      screen.getByText(
        "La suma del pago ($15.000) no coincide con el total ($10.000). Corregí los importes para poder registrar la venta.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Confirmar venta" })).toBeNull();
    expect(registrarVenta).not.toHaveBeenCalled();
  });

  it("mixto: pago menor al total (cantidad cambia después de tipear el pago) bloquea sin ConfirmModal ni llamada al RPC", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Mixto" }));
    // Con cantidad=1 el total es $10.000: tipear efectivo=10000 deja el pago
    // exacto (transferencia se autocompleta a 0). Subir la cantidad DESPUÉS
    // sube el total sin tocar los montos ya tipeados (comentario real de
    // cambiarMontoEfectivo en VenderView.tsx) — la forma real de generar un
    // desajuste "por defecto", no alcanzable tipeando los inputs de pago solos.
    await user.type(screen.getByLabelText("Monto en efectivo"), "{selectall}10000");
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "2" } });

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    expect(
      screen.getByText(
        "La suma del pago ($10.000) no coincide con el total ($20.000). Corregí los importes para poder registrar la venta.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Confirmar venta" })).toBeNull();
    expect(registrarVenta).not.toHaveBeenCalled();
  });

  it("mixto exacto: registra directo, sin bloqueo ni ConfirmModal", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({ data: "venta-1", error: null } as never);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Mixto" }));
    await user.type(screen.getByLabelText("Monto en efectivo"), "{selectall}4000");

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    expect(screen.queryByRole("dialog", { name: "Confirmar venta" })).toBeNull();
    await waitFor(() => expect(registrarVenta).toHaveBeenCalledWith([{ producto_id: "p1", cantidad: 1 }], 4000, 6000, false, null, expect.any(String)));
  });

  it("pago desajustado bloquea ANTES de evaluar stock: con los dos problemas a la vez, solo se ve el mensaje de pago, nunca el modal de stock", async () => {
    const user = userEvent.setup();
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 1 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "3" } });
    await user.click(screen.getByRole("button", { name: "Mixto" }));
    await user.type(screen.getByLabelText("Monto en efectivo"), "{selectall}35000");

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    expect(
      screen.getByText(
        "La suma del pago ($35.000) no coincide con el total ($30.000). Corregí los importes para poder registrar la venta.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Confirmar venta" })).toBeNull();
    expect(registrarVenta).not.toHaveBeenCalled();
  });

  it("éxito: llama a registrarVenta, patchea stock local por línea, resetea carrito/pago, toast ok", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({ data: "venta-1", error: null } as never);
    const productos = crearProductosStub([
      crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 }),
      crearProducto({ id: "p2", nombre: "Grips", precio_venta: 3500, stock_actual: 50 }),
    ]);
    const mostrarToast = vi.fn();
    render(<VenderView mostrarToast={mostrarToast} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(filaAgregar("Grips"));

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    await waitFor(() =>
      expect(registrarVenta).toHaveBeenCalledWith(
        [
          { producto_id: "p1", cantidad: 1 },
          { producto_id: "p2", cantidad: 1 },
        ],
        13500,
        0,
        false,
        null,
        expect.any(String),
      ),
    );
    expect(productos.ajustarStockLocal).toHaveBeenCalledWith("p1", -1, null);
    expect(productos.ajustarStockLocal).toHaveBeenCalledWith("p2", -1, null);
    expect(mostrarToast).toHaveBeenCalledWith("Venta registrada.", "ok");
    expect(screen.getByText("Todavía no agregaste productos.")).toBeTruthy();
    expect(screen.getByText("Total").parentElement?.textContent).toContain("$0");
  });

  it("error stock_insuficiente: toast específico, recarga el catálogo, mantiene carrito y pago", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({ data: null, error: { message: "stock_insuficiente" } } as never);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    const mostrarToast = vi.fn();
    render(<VenderView mostrarToast={mostrarToast} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith("El stock cambió justo ahora, revisá el carrito e intentá de nuevo.", "error"),
    );
    expect(productos.recargar).toHaveBeenCalled();
    expect(productos.ajustarStockLocal).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Cantidad")).toBeTruthy();
  });

  it("error remoto monto_pago_no_coincide: toast específico, recarga catálogo, mantiene carrito/pago intactos, sin patch de stock local", async () => {
    const user = userEvent.setup();
    // El cliente arma un pago exacto contra el precio que tiene cargado
    // ($10.000) — el error simula que la RPC, bajo lock, vio otro precio.
    vi.mocked(registrarVenta).mockResolvedValue({ data: null, error: { message: "monto_pago_no_coincide" } } as never);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    const mostrarToast = vi.fn();
    render(<VenderView mostrarToast={mostrarToast} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Mixto" }));
    await user.type(screen.getByLabelText("Monto en efectivo"), "{selectall}4000");

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith(
        "El precio de uno o más productos cambió. Revisá los importes e intentá de nuevo.",
        "error",
      ),
    );
    expect(productos.recargar).toHaveBeenCalled();
    expect(productos.ajustarStockLocal).not.toHaveBeenCalled();
    // Carrito intacto.
    expect((screen.getByLabelText("Cantidad") as HTMLInputElement).value).toBe("1");
    // Pagos intactos: mismo modo (Mixto) y mismos importes tipeados, sin resetear.
    expect(screen.getByRole("button", { name: "Mixto" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Monto en efectivo") as HTMLInputElement).value).toBe("4000");
    expect((screen.getByLabelText("Monto en transferencia") as HTMLInputElement).value).toBe("6000");
  });

  it("error genérico: toast genérico, mantiene carrito y pago", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({ data: null, error: { message: "network" } } as never);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    const mostrarToast = vi.fn();
    render(<VenderView mostrarToast={mostrarToast} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("No se pudo registrar la venta. Probá de nuevo (si ya se había registrado, no se duplica).", "error"));
    expect(productos.recargar).not.toHaveBeenCalled();
    expect(productos.ajustarStockLocal).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Cantidad")).toBeTruthy();
  });

  it("FINAL-F6 idempotencia: el reintento usa la MISMA clave; tras un éxito, la venta siguiente usa otra", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta)
      .mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } } as never)
      .mockResolvedValueOnce({ data: "venta-1", error: null } as never)
      .mockResolvedValueOnce({ data: "venta-2", error: null } as never);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Registrar venta" }));
    await waitFor(() => expect(registrarVenta).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Registrar venta" })); // reintento
    await waitFor(() => expect(registrarVenta).toHaveBeenCalledTimes(2));
    const clave = (n: number) => vi.mocked(registrarVenta).mock.calls[n][5];
    expect(clave(1)).toBe(clave(0));
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Registrar venta" })); // otra venta
    await waitFor(() => expect(registrarVenta).toHaveBeenCalledTimes(3));
    expect(clave(2)).not.toBe(clave(0));
  });

  it("FINAL-F6 idempotencia: clave ya registrada con otro carrito (IK001) -> avisa, no duplica y resetea", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({ data: null, error: { message: "idempotency_key_reutilizada", code: "IK001" } } as never);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    const mostrarToast = vi.fn();
    render(<VenderView mostrarToast={mostrarToast} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Registrar venta" }));
    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith(expect.stringMatching(/ya se había registrado/), "error"));
    expect(productos.recargar).toHaveBeenCalled();
  });
});

describe("VenderView — D4 toggle Venta suelta / Atada a reserva", () => {
  it("modo suelta (default): no muestra la sección Reserva ni carga reservas", () => {
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    expect(screen.queryByText("Reserva")).toBeNull();
    expect(obtenerReservasPorRango).not.toHaveBeenCalled();
  });

  it("cambiar a atada preserva el carrito ya armado en suelta", async () => {
    const user = userEvent.setup();
    mockearReservas([]);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));

    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));

    expect(screen.getByText("Total").parentElement?.textContent).toContain("$10.000");
    expect(screen.getByRole("button", { name: "Quitar" })).toBeTruthy();
  });

  it("atada -> suelta limpia la reserva elegida; volver a atada no repite la carga", async () => {
    const user = userEvent.setup();
    mockearReservas([crearReserva({ id: "r1", nombre: "Juan" })]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));
    await user.click(filaReserva("Juan"));
    expect(screen.getByText(/Venta atada a: Juan/)).toBeTruthy();
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Venta suelta" }));
    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));

    expect(screen.queryByText(/Venta atada a:/)).toBeNull();
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);
  });
});

describe("VenderView — D4 carga de reservas (useReservasParaVenta)", () => {
  it("muestra 'Buscando reservas...' mientras la carga está en vuelo", async () => {
    const user = userEvent.setup();
    const diferido = crearDiferido<{ data: ReservaRow[] | null; error: { message: string } | null }>();
    vi.mocked(obtenerReservasPorRango).mockReturnValueOnce(diferido.promise as never);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));
    expect(screen.getByText("Buscando reservas...")).toBeTruthy();

    await act(async () => {
      diferido.resolve({ data: [], error: null });
    });
    expect(screen.queryByText("Buscando reservas...")).toBeNull();
  });

  it("error de carga: mensaje + botón Reintentar; Reintentar dispara una nueva carga", async () => {
    const user = userEvent.setup();
    vi.mocked(obtenerReservasPorRango)
      .mockResolvedValueOnce({ data: null, error: { message: "fallo" } } as never)
      .mockResolvedValueOnce({ data: [crearReserva({ id: "r1", nombre: "Juan" })], error: null } as never);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));
    expect(await screen.findByText("No se pudieron cargar las reservas.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Juan")).toBeTruthy();
    expect(screen.queryByText("No se pudieron cargar las reservas.")).toBeNull();
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2);
  });
});

describe("VenderView — D4 picker de reservas", () => {
  it("excluye reservas bloqueadas (no son un cliente real)", async () => {
    const user = userEvent.setup();
    mockearReservas([
      crearReserva({ id: "r1", nombre: "Juan", bloqueado: false }),
      crearReserva({ id: "r2", nombre: "Bloqueado", bloqueado: true, confirmada: true }),
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));

    expect(await screen.findByText("Juan")).toBeTruthy();
    expect(screen.queryByText("Bloqueado")).toBeNull();
  });

  it("muestra horario y estado (Confirmada/Pendiente) de cada reserva", async () => {
    const user = userEvent.setup();
    // P2 — las dos reservas tienen que caer dentro de la ventana candidata
    // para un mismo "ahora": Juan (15:00-16:00) terminó hace <=3h y María
    // (18:00-19:00) está en juego, ambas evaluadas a las 18:30.
    vi.setSystemTime(new Date("2026-01-07T18:30:00"));
    mockearReservas([
      crearReserva({ id: "r1", nombre: "Juan", hora_inicio: "15:00:00", hora_fin: "16:00:00", confirmada: true }),
      crearReserva({ id: "r2", nombre: "María", hora_inicio: "18:00:00", hora_fin: "19:00:00", confirmada: false }),
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));
    await screen.findByText("Juan");

    expect(screen.getByText("Confirmada")).toBeTruthy();
    expect(screen.getByText("Pendiente")).toBeTruthy();
    expect(screen.getByText(/15:00–16:00/)).toBeTruthy();
  });

  it("el buscador del picker filtra por nombre", async () => {
    const user = userEvent.setup();
    mockearReservas([crearReserva({ id: "r1", nombre: "Juan Pérez" }), crearReserva({ id: "r2", nombre: "María" })]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);
    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));
    await screen.findByText("Juan Pérez");

    await user.type(screen.getByPlaceholderText("Buscar reserva por nombre..."), "mar");

    expect(screen.queryByText("Juan Pérez")).toBeNull();
    expect(screen.getByText("María")).toBeTruthy();
  });

  it("sin reservas que coincidan: mensaje vacío", async () => {
    const user = userEvent.setup();
    mockearReservas([crearReserva({ id: "r1", nombre: "Juan" })]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);
    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));
    await screen.findByText("Juan");

    await user.type(screen.getByPlaceholderText("Buscar reserva por nombre..."), "xyz");

    expect(screen.getByText("No hay reservas en juego ni terminadas hace menos de 3 horas que coincidan.")).toBeTruthy();
  });

  it("seleccionar una reserva muestra el resumen 'Venta atada a: ...'", async () => {
    const user = userEvent.setup();
    mockearReservas([crearReserva({ id: "r1", nombre: "Juan" })]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);
    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));

    await user.click(filaReserva("Juan"));

    expect(screen.getByText(/Venta atada a: Juan/)).toBeTruthy();
  });
});

describe("VenderView — P2 filtrar reservas candidatas al vender", () => {
  it("una reserva futura (todavía no empezó) no aparece en el picker", async () => {
    mockearReservas([
      crearReserva({ id: "r1", nombre: "EnJuego", hora_inicio: "10:00:00", hora_fin: "11:00:00" }),
      crearReserva({ id: "r2", nombre: "Futura", hora_inicio: "14:00:00", hora_fin: "15:00:00" }),
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    fireEvent.click(screen.getByRole("button", { name: "Atada a reserva" }));

    expect(await screen.findByText("EnJuego")).toBeTruthy();
    expect(screen.queryByText("Futura")).toBeNull();
  });

  it("una reserva terminada hace más de 3h no aparece; una terminada hace menos de 3h sí", async () => {
    vi.setSystemTime(new Date("2026-01-07T13:00:00"));
    mockearReservas([
      crearReserva({ id: "r1", nombre: "TerminoHaceRato", hora_inicio: "08:00:00", hora_fin: "09:00:00" }), // 4h antes
      crearReserva({ id: "r2", nombre: "TerminoRecien", hora_inicio: "10:00:00", hora_fin: "11:00:00" }), // 2h antes
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    fireEvent.click(screen.getByRole("button", { name: "Atada a reserva" }));

    expect(await screen.findByText("TerminoRecien")).toBeTruthy();
    expect(screen.queryByText("TerminoHaceRato")).toBeNull();
  });

  // Caso obligatorio del pedido: una reserva 23:30–01:00 sigue siendo
  // candidata mientras juega y durante las 3h posteriores, aunque el
  // calendario ya haya cambiado de día respecto de `fecha`.
  it("cruce de medianoche (23:30–01:00): en juego después de la medianoche sigue candidata aunque cambió el día calendario", async () => {
    vi.setSystemTime(new Date("2026-01-08T00:15:00"));
    mockearReservas([
      crearReserva({ id: "r1", nombre: "Nocturna", fecha: "2026-01-07", hora_inicio: "23:30:00", hora_fin: "01:00:00" }),
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    fireEvent.click(screen.getByRole("button", { name: "Atada a reserva" }));

    expect(await screen.findByText("Nocturna")).toBeTruthy();
  });

  it("cruce de medianoche: terminada hace más de 3h ya no aparece", async () => {
    vi.setSystemTime(new Date("2026-01-08T04:01:00")); // fin 01:00 + 3h01m
    mockearReservas([
      crearReserva({ id: "r1", nombre: "Nocturna", fecha: "2026-01-07", hora_inicio: "23:30:00", hora_fin: "01:00:00" }),
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    fireEvent.click(screen.getByRole("button", { name: "Atada a reserva" }));

    expect(await screen.findByText("No hay reservas en juego ni terminadas hace menos de 3 horas que coincidan.")).toBeTruthy();
    expect(screen.queryByText("Nocturna")).toBeNull();
  });
});

// P2 (revisión) — la apertura usada para resolver instantes reales viene de
// `hora_apertura_vigente` de CADA reserva (columna poblada por trigger desde
// C4.1), nunca de configCancha ni de ninguna otra noción de "horario actual":
// reinterpretar una reserva ya jugada con el horario de hoy la rompería si el
// horario del local cambió después.
describe("VenderView — P2 apertura vigente por reserva (no la config actual)", () => {
  it("apertura distinta de 08:00: 07:00 con apertura vigente 06:00 es horario normal (sin corrimiento de día)", async () => {
    vi.setSystemTime(new Date("2026-01-07T07:30:00"));
    mockearReservas([
      crearReserva({
        id: "r1",
        nombre: "AperturaTemprana",
        hora_inicio: "07:00:00",
        hora_fin: "08:00:00",
        hora_apertura_vigente: "06:00:00",
      }),
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    fireEvent.click(screen.getByRole("button", { name: "Atada a reserva" }));

    expect(await screen.findByText("AperturaTemprana")).toBeTruthy();
  });

  it("un cambio posterior del horario del local no reinterpreta una reserva ya creada: cada una usa SU PROPIA apertura vigente", async () => {
    // Mismo horaInicio/horaFin (07:00-08:00) en las dos, pero creadas bajo
    // aperturas vigentes distintas — lo que pasaría si el horario del local
    // cambió entre una reserva y la otra. A las 2026-01-07T07:30 (mismo día
    // calendario de `fecha`): la reserva vieja (apertura 08:00 al crearse)
    // todavía no "empezó" para su propia interpretación (07:00 < 08:00 corre
    // al día calendario siguiente); la nueva (apertura ya en 06:00) sí está
    // en juego, porque 07:00 >= 06:00 no corre de día.
    vi.setSystemTime(new Date("2026-01-07T07:30:00"));
    mockearReservas([
      crearReserva({
        id: "vieja",
        nombre: "CreadaConApertura08",
        hora_inicio: "07:00:00",
        hora_fin: "08:00:00",
        hora_apertura_vigente: "08:00:00",
      }),
      crearReserva({
        id: "nueva",
        nombre: "CreadaConApertura06",
        hora_inicio: "07:00:00",
        hora_fin: "08:00:00",
        hora_apertura_vigente: "06:00:00",
      }),
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    fireEvent.click(screen.getByRole("button", { name: "Atada a reserva" }));

    expect(await screen.findByText("CreadaConApertura06")).toBeTruthy();
    expect(screen.queryByText("CreadaConApertura08")).toBeNull();
  });

  it("hora_apertura_vigente null (dato viejo sin resolver): NO cae en un fallback silencioso de 08:00", async () => {
    // Con 08:00 como fallback, 07:00 < 08:00 correría al día calendario
    // siguiente y esta reserva NO aparecería a las 07:30 del mismo día.
    vi.setSystemTime(new Date("2026-01-07T07:30:00"));
    mockearReservas([
      crearReserva({
        id: "r1",
        nombre: "SinApertura",
        hora_inicio: "07:00:00",
        hora_fin: "08:00:00",
        hora_apertura_vigente: null,
      }),
    ]);
    render(<VenderView mostrarToast={vi.fn()} productos={crearProductosStub([])} />);

    fireEvent.click(screen.getByRole("button", { name: "Atada a reserva" }));

    expect(await screen.findByText("SinApertura")).toBeTruthy();
  });
});

describe("VenderView — D4 corte duro: modo atada sin reserva elegida", () => {
  it("mensaje 'Elegí una reserva.' y NO llama a registrarVenta", async () => {
    const user = userEvent.setup();
    mockearReservas([crearReserva({ id: "r1", nombre: "Juan" })]);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas" })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    expect(screen.getByText("Elegí una reserva.")).toBeTruthy();
    expect(registrarVenta).not.toHaveBeenCalled();
  });
});

describe("VenderView — D4 registrar venta atada a una reserva", () => {
  it("registrarVenta recibe el id de la reserva elegida", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({ data: "venta-1", error: null } as never);
    mockearReservas([crearReserva({ id: "r1", nombre: "Juan" })]);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));
    await user.click(filaReserva("Juan"));

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    await waitFor(() =>
      expect(registrarVenta).toHaveBeenCalledWith([{ producto_id: "p1", cantidad: 1 }], 10000, 0, false, "r1", expect.any(String)),
    );
  });

  it("éxito: resetea carrito/pago, limpia la selección y se mantiene en modo atada", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({ data: "venta-1", error: null } as never);
    mockearReservas([crearReserva({ id: "r1", nombre: "Juan" })]);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));
    await user.click(filaReserva("Juan"));

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    await waitFor(() => expect(registrarVenta).toHaveBeenCalled());
    expect(screen.getByText("Todavía no agregaste productos.")).toBeTruthy();
    expect(screen.queryByText(/Venta atada a:/)).toBeNull();
    // Sigue en modo atada (la sección "Reserva" sigue visible) — pero exige
    // elegir de nuevo: con un producto nuevo en el carrito, el corte duro por
    // falta de reserva vuelve a activarse (no el de carrito vacío).
    expect(screen.getByText("Reserva")).toBeTruthy();
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Registrar venta" }));
    expect(screen.getByText("Elegí una reserva.")).toBeTruthy();
  });

  it("reserva ya no existe (FK 23503 sobre ventas_reserva_id_fkey): toast claro, limpia selección, mantiene carrito y pago", async () => {
    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({
      data: null,
      error: {
        code: "23503",
        message: 'insert or update on table "ventas" violates foreign key constraint "ventas_reserva_id_fkey"',
      },
    } as never);
    mockearReservas([crearReserva({ id: "r1", nombre: "Juan" })]);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    const mostrarToast = vi.fn();
    render(<VenderView mostrarToast={mostrarToast} productos={productos} />);
    await user.click(filaAgregar("Pelotas"));
    await user.click(screen.getByRole("button", { name: "Atada a reserva" }));
    await user.click(filaReserva("Juan"));

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("La reserva ya no existe. Elegí otra.", "error"));
    expect(screen.queryByText(/Venta atada a:/)).toBeNull();
    expect(screen.getByRole("button", { name: "Quitar" })).toBeTruthy();
    expect(productos.ajustarStockLocal).not.toHaveBeenCalled();

    // Corte duro se reactiva: sin elegir otra reserva no se puede reintentar.
    await user.click(screen.getByRole("button", { name: "Registrar venta" }));
    expect(screen.getByText("Elegí una reserva.")).toBeTruthy();
  });
});

// R6 — el layout de dos columnas (catálogo/carrito) es responsive por CSS
// puro (Tailwind `lg:`), no por una rama de JS como Agenda/ReservasView (ver
// cabecera de VenderView.tsx) — así que no hay dos árboles de DOM distintos
// que probar por separado. Este bloque es un smoke test básico: a un ancho
// mobile, el flujo completo (buscar, agregar, cambiar cantidad, pagar,
// registrar) sigue siendo alcanzable en el mismo árbol, sin nada oculto
// detrás de una condición de breakpoint en JS.
describe("VenderView — mobile básico (una columna, sin rama de JS por ancho)", () => {
  it("con un ancho de mobile (390px) el flujo de agregar/cobrar sigue completo", async () => {
    const anchoOriginal = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));

    const user = userEvent.setup();
    vi.mocked(registrarVenta).mockResolvedValue({ data: "venta-1", error: null } as never);
    const productos = crearProductosStub([crearProducto({ id: "p1", nombre: "Pelotas", precio_venta: 10000, stock_actual: 20 })]);
    render(<VenderView mostrarToast={vi.fn()} productos={productos} />);

    await user.click(filaAgregar("Pelotas"));
    expect(screen.getByText("Total").parentElement?.textContent).toContain("$10.000");
    await user.click(screen.getByRole("button", { name: "Transferencia" }));

    await user.click(screen.getByRole("button", { name: "Registrar venta" }));
    await waitFor(() => expect(registrarVenta).toHaveBeenCalledWith([{ producto_id: "p1", cantidad: 1 }], 0, 10000, false, null, expect.any(String)));

    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: anchoOriginal });
  });
});

it("distingue carga, error y vacío sin perder el carrito", async () => {
  const user = userEvent.setup();
  const productos = crearProductosStub([crearProducto()]);
  const { rerender } = render(<VenderView productos={productos} mostrarToast={vi.fn()} />);
  await user.click(filaAgregar("Pelotas Odea x2"));
  const carrito = screen.getByTestId("carrito-panel");
  rerender(<VenderView productos={{ ...productos, loading: true }} mostrarToast={vi.fn()} />);
  expect(screen.getByRole("status").textContent).toContain("Cargando productos");
  expect(within(carrito).getByText("Pelotas Odea x2")).toBeTruthy();
  expect(screen.queryByText(/No hay productos/)).toBeNull();
  rerender(<VenderView productos={{ ...productos, error: true }} mostrarToast={vi.fn()} />);
  expect(screen.getByRole("alert").textContent).toContain("No se pudieron cargar");
  expect(within(carrito).getByText("Pelotas Odea x2")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(productos.recargar).toHaveBeenCalled();
});
