/** @vitest-environment jsdom */
// Comportamiento real de la campana: se re-renderiza con datos nuevos (lo que
// hace AdminShell cuando cambia el estado compartido) y se verifica badge,
// panel, descartes, foco y navegación. Nada de snapshots.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionConfig } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReservaProcesada } from "../reservas/reservas.types";
import type { Producto } from "../productos/productos.logic";
import { NotificacionesCampana, type NotificacionesCampanaProps } from "./NotificacionesCampana";
import { DESCARTES_STORAGE_KEY } from "./notificaciones.logic";
import { AHORA, crearPendiente, crearProducto, crearReserva, sinPago, stockBajo } from "./notificaciones.fixtures";

type Datos = { jugadas: ReservaProcesada[]; proximas: ReservaProcesada[]; productos: Producto[] };

const VACIO: Datos = { jugadas: [], proximas: [], productos: [] };
const COMPLETO: Datos = {
  jugadas: sinPago(["a", "b", "c"]),
  proximas: [crearPendiente()],
  productos: stockBajo(["x", "y"]),
};

function Campana(props: Partial<NotificacionesCampanaProps> & Datos) {
  return (
    <MotionConfig reducedMotion="always">
      <NotificacionesCampana onNavegar={vi.fn()} {...props} />
    </MotionConfig>
  );
}

function montar(datos: Datos = COMPLETO, onNavegar = vi.fn()) {
  const utils = render(<Campana {...datos} onNavegar={onNavegar} />);
  return {
    ...utils,
    onNavegar,
    actualizar: (nuevos: Datos) => utils.rerender(<Campana {...nuevos} onNavegar={onNavegar} />),
  };
}

const campana = (nombre: RegExp | string = /^Notificaciones/) => screen.getByRole("button", { name: nombre });
const panel = () => screen.queryByRole("dialog", { name: "Pendientes" });

async function abrir(user: ReturnType<typeof userEvent.setup>) {
  await user.click(campana());
  return await screen.findByRole("dialog", { name: "Pendientes" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("badge", () => {
  it("suma el TOTAL de lo accionable (3 + 1 + 2 = 6) y lo comunica por aria-label", () => {
    montar();
    expect(campana("Notificaciones, 6 pendientes")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
  });

  it("singular cuando hay uno solo", () => {
    montar({ ...VACIO, jugadas: sinPago(["a"]) });
    expect(campana("Notificaciones, 1 pendiente")).toBeTruthy();
  });

  it("con 0 pendientes no muestra ningún número", () => {
    montar(VACIO);
    expect(campana("Notificaciones, 0 pendientes")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("3 turnos sin pago → se paga uno → queda 2 y el badge baja de 6 a 5", async () => {
    const user = userEvent.setup();
    const { actualizar } = montar();
    actualizar({ ...COMPLETO, jugadas: [crearReserva({ id: "a", pago_efectivo: 20000 }), ...sinPago(["b", "c"])] });

    expect(campana("Notificaciones, 5 pendientes")).toBeTruthy();
    await abrir(user);
    expect(screen.getByText("2 turnos sin pago")).toBeTruthy();
  });

  it("confirmar una reserva pendiente la saca de pendientes", async () => {
    const user = userEvent.setup();
    const { actualizar } = montar();
    actualizar({ ...COMPLETO, proximas: [crearPendiente({ confirmada: true })] });

    expect(campana("Notificaciones, 5 pendientes")).toBeTruthy();
    await abrir(user);
    expect(screen.queryByText(/reserva pendiente/)).toBeNull();
  });

  it("el stock bajo se actualiza al reponer / vender", async () => {
    const user = userEvent.setup();
    const { actualizar } = montar();
    actualizar({ ...COMPLETO, productos: [crearProducto({ id: "x", stock_actual: 20 }), ...stockBajo(["y"])] });
    expect(campana("Notificaciones, 5 pendientes")).toBeTruthy();

    actualizar({ ...COMPLETO, productos: [...stockBajo(["x", "y"]), crearProducto({ id: "z", stock_actual: 0 })] });
    expect(campana("Notificaciones, 7 pendientes")).toBeTruthy();
    await abrir(user);
    expect(screen.getByText("3 productos con stock bajo")).toBeTruthy();
  });
});

describe("panel — abrir, cerrar, foco", () => {
  it("abre y cierra con la campana; aria-expanded acompaña", async () => {
    const user = userEvent.setup();
    montar();
    expect(campana().getAttribute("aria-expanded")).toBe("false");
    await abrir(user);
    expect(campana().getAttribute("aria-expanded")).toBe("true");

    await user.click(campana());
    await waitFor(() => expect(panel()).toBeNull());
    expect(campana().getAttribute("aria-expanded")).toBe("false");
  });

  it("está nombrado, no es modal y muestra el total", async () => {
    const user = userEvent.setup();
    montar();
    const dialogo = await abrir(user);
    expect(dialogo.getAttribute("aria-modal")).toBe("false");
    expect(within(dialogo).getByRole("heading", { name: "Pendientes" })).toBeTruthy();
    expect(within(dialogo).getByText("6 en total")).toBeTruthy();
  });

  it("al abrir, el foco pasa al panel", async () => {
    const user = userEvent.setup();
    montar();
    const dialogo = await abrir(user);
    expect(document.activeElement).toBe(dialogo);
  });

  it("click afuera cierra", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">otro</button>
        <Campana {...COMPLETO} />
      </>,
    );
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "otro" }));
    await waitFor(() => expect(panel()).toBeNull());
  });

  it("click dentro del panel no lo cierra", async () => {
    const user = userEvent.setup();
    montar();
    const dialogo = await abrir(user);
    await user.click(within(dialogo).getByRole("heading", { name: "Pendientes" }));
    expect(panel()).toBeTruthy();
  });

  it("Escape cierra y devuelve el foco a la campana", async () => {
    const user = userEvent.setup();
    montar();
    await abrir(user);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(panel()).toBeNull());
    expect(document.activeElement).toBe(campana());
  });

  it("navegación por teclado: Tab llega a los CTA y a los botones de descartar", async () => {
    const user = userEvent.setup();
    montar();
    await abrir(user);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ver reservas: 1 reserva pendiente" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Descartar: 1 reserva pendiente" }));
  });

  it("si el foco sale del panel hacia otro elemento, se cierra sin robarle el foco", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Campana {...VACIO} />
        <button type="button">siguiente</button>
      </>,
    );
    await abrir(user);
    screen.getByRole("button", { name: "siguiente" }).focus();
    await waitFor(() => expect(panel()).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "siguiente" }));
  });
});

describe("panel — contenido y CTA", () => {
  it("sin pendientes muestra 'Todo al día'", async () => {
    const user = userEvent.setup();
    montar(VACIO);
    const dialogo = await abrir(user);
    expect(within(dialogo).getByText("Todo al día")).toBeTruthy();
    expect(within(dialogo).getByText("Al día")).toBeTruthy();
    expect(within(dialogo).queryByRole("list")).toBeNull();
  });

  it("cada fila tiene título, descripción, CTA y descartar", async () => {
    const user = userEvent.setup();
    montar();
    const dialogo = await abrir(user);
    expect(within(dialogo).getByText("3 turnos sin pago")).toBeTruthy();
    expect(within(dialogo).getByText("Hay turnos jugados pendientes de cobro")).toBeTruthy();
    expect(within(dialogo).getByText("2 productos con stock bajo")).toBeTruthy();
    expect(within(dialogo).getByText("Revisá el stock disponible")).toBeTruthy();
    expect(within(dialogo).getByText("Hay una reserva esperando confirmación")).toBeTruthy();
    expect(within(dialogo).getAllByRole("button", { name: /^Descartar:/ })).toHaveLength(3);
  });

  it("CTA de turnos sin pago: cierra el panel y navega a Reservas > Jugadas", async () => {
    const user = userEvent.setup();
    const { onNavegar } = montar();
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Ver reservas: 3 turnos sin pago" }));
    expect(onNavegar).toHaveBeenCalledWith({ vista: "reservas", tab: "jugadas" });
    await waitFor(() => expect(panel()).toBeNull());
    expect(document.activeElement).toBe(campana());
  });

  it("CTA de reserva pendiente: navega a Reservas > Pendientes", async () => {
    const user = userEvent.setup();
    const { onNavegar } = montar();
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Ver reservas: 1 reserva pendiente" }));
    expect(onNavegar).toHaveBeenCalledWith({ vista: "reservas", tab: "pendientes" });
  });

  it("CTA de stock bajo: navega a Productos", async () => {
    const user = userEvent.setup();
    const { onNavegar } = montar();
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Ver productos: 2 productos con stock bajo" }));
    expect(onNavegar).toHaveBeenCalledWith({ vista: "productos" });
  });
});

describe("descartes", () => {
  it("descartar saca la categoría del panel y del badge y la guarda en localStorage", async () => {
    const user = userEvent.setup();
    montar();
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Descartar: 3 turnos sin pago" }));

    await waitFor(() => expect(screen.queryByText("3 turnos sin pago")).toBeNull());
    expect(campana("Notificaciones, 3 pendientes")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(DESCARTES_STORAGE_KEY)!)["sin-pago"]).toMatch(/^sin-pago:3:/);
    // el foco no se pierde en el <body>: queda en el panel
    expect(document.activeElement).toBe(panel());
  });

  it("si el estado cambia (3 → 2 sin pago) la notificación reaparece", async () => {
    const user = userEvent.setup();
    const { actualizar } = montar({ ...VACIO, jugadas: sinPago(["a", "b", "c"]) });
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Descartar: 3 turnos sin pago" }));
    await waitFor(() => expect(campana("Notificaciones, 0 pendientes")).toBeTruthy());

    actualizar({ ...VACIO, jugadas: [crearReserva({ id: "a", pago_efectivo: 1 }), ...sinPago(["b", "c"])] });
    expect(campana("Notificaciones, 2 pendientes")).toBeTruthy();
    expect(await screen.findByText("2 turnos sin pago")).toBeTruthy();
  });

  it("misma cantidad pero otros turnos → reaparece", async () => {
    const user = userEvent.setup();
    const { actualizar } = montar({ ...VACIO, jugadas: sinPago(["a", "b", "c"]) });
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Descartar: 3 turnos sin pago" }));
    await waitFor(() => expect(campana("Notificaciones, 0 pendientes")).toBeTruthy());

    actualizar({ ...VACIO, jugadas: sinPago(["a", "b", "d"]) });
    expect(campana("Notificaciones, 3 pendientes")).toBeTruthy();
  });

  it("el mismo conjunto en otro orden sigue descartado", async () => {
    const user = userEvent.setup();
    const { actualizar } = montar({ ...VACIO, jugadas: sinPago(["a", "b", "c"]) });
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Descartar: 3 turnos sin pago" }));
    await waitFor(() => expect(campana("Notificaciones, 0 pendientes")).toBeTruthy());

    actualizar({ ...VACIO, jugadas: sinPago(["c", "a", "b"]) });
    expect(campana("Notificaciones, 0 pendientes")).toBeTruthy();
  });

  it("el descarte sobrevive a recargar (remount) mientras el estado no cambie", async () => {
    const user = userEvent.setup();
    const primera = montar();
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Descartar: 2 productos con stock bajo" }));
    await waitFor(() => expect(campana("Notificaciones, 4 pendientes")).toBeTruthy());
    primera.unmount();

    montar();
    expect(campana("Notificaciones, 4 pendientes")).toBeTruthy();
  });

  it("al remontar con datos todavía vacíos no se pierde un descarte válido", async () => {
    const user = userEvent.setup();
    const primera = montar({ ...VACIO, productos: stockBajo(["x"]) });
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Descartar: 1 producto con stock bajo" }));
    await waitFor(() => expect(campana("Notificaciones, 0 pendientes")).toBeTruthy());
    primera.unmount();

    // Sesión nueva: primero llega todo vacío (datos sin cargar) y después los datos reales.
    const segunda = montar(VACIO);
    segunda.actualizar({ ...VACIO, productos: stockBajo(["x"]) });
    expect(campana("Notificaciones, 0 pendientes")).toBeTruthy();
  });

  it("si el problema se resuelve del todo y vuelve a aparecer, avisa de nuevo", async () => {
    const user = userEvent.setup();
    const { actualizar } = montar({ ...VACIO, productos: stockBajo(["x"]) });
    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Descartar: 1 producto con stock bajo" }));
    await waitFor(() => expect(campana("Notificaciones, 0 pendientes")).toBeTruthy());

    actualizar(VACIO); // repuesto
    actualizar({ ...VACIO, productos: stockBajo(["x"]) }); // vuelve a bajar
    expect(campana("Notificaciones, 1 pendiente")).toBeTruthy();
  });

  it("localStorage corrupto: no rompe y muestra todo", () => {
    for (const crudo of ["{roto", "[]", "123"]) {
      window.localStorage.setItem(DESCARTES_STORAGE_KEY, crudo);
      const { unmount } = montar();
      expect(campana("Notificaciones, 6 pendientes")).toBeTruthy();
      unmount();
    }
  });

  it("localStorage inaccesible: no rompe y el descarte vale durante la sesión", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denegado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denegado");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denegado");
    });
    const user = userEvent.setup();
    montar();
    expect(campana("Notificaciones, 6 pendientes")).toBeTruthy();

    await abrir(user);
    await user.click(screen.getByRole("button", { name: "Descartar: 3 turnos sin pago" }));
    await waitFor(() => expect(campana("Notificaciones, 3 pendientes")).toBeTruthy());
  });
});

describe("movimiento reducido", () => {
  it("con reduced-motion el panel no usa transform (solo opacidad) y abre/cierra igual", async () => {
    const user = userEvent.setup();
    montar();
    const dialogo = await abrir(user);
    expect(dialogo.style.transform === "" || dialogo.style.transform === "none").toBe(true);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(panel()).toBeNull());
  });
});
