/** @vitest-environment jsdom */
import { selectPastDate } from "../../../components/ui/picker-test-helpers";
// Tests de interacción real de ReservasView. No se testean CSS/animaciones/
// snapshots, solo comportamiento: qué id recibe cada mutación, qué aparece/
// desaparece, y el feedback de error vía mostrarToast.
//
// R5 — rediseño: "Necesitan confirmación" pasa a ser su propio tab
// ("Pendientes"), y las acciones (Confirmar/Cancelar/WhatsApp/Pago) se
// mueven de cada fila de la lista a un panel de detalle (`data-testid=
// "detalle-reserva"`, visible tras seleccionar una fila) — de ahí que casi
// todos los tests ahora sigan el patrón "seleccionar la fila, después
// interactuar dentro del panel" en vez de clickear un botón inline. La lógica
// de datos/mutaciones en sí (qué se llama, con qué id, qué patch local se
// aplica) es exactamente la misma que antes de R5.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionConfig } from "motion/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { obtenerDatosPublicosCancha } from "../configuracion/configuracion.api";
import { registrarDevolucion } from "../devoluciones/devoluciones.api";
import type { ItemVentaCruda, VentaCruda } from "../historial/historial.types";
import { obtenerFranjaOperativa } from "../../reservations-public/reservations.api";
import { TURNOS_FIJOS_VACIO } from "../turnos-fijos/useTurnosFijos";
import { obtenerVentasPorReserva } from "../ventas/ventas.api";
import { ReservasView, type ReservasViewProps } from "./ReservasView";
import {
  buscarReservas,
  cancelarReserva,
  confirmarReserva,
  obtenerMovimientosPago,
  obtenerReservasPorRango,
  registrarMovimientoPago,
  obtenerReservasProximas,
} from "./reservas.api";
import { formatearBadgeFecha } from "./reservas.logic";
import type { ExcepcionTurnoFijoRow, ReservaRow, TurnoFijoConHorario } from "./reservas.types";
import { useReservasJugadas } from "./useReservasJugadas";
import { useReservasProximas } from "./useReservasProximas";

vi.mock("./reservas.api", () => ({
  obtenerReservasProximas: vi.fn(),
  obtenerReservasPorRango: vi.fn(),
  confirmarReserva: vi.fn(),
  cancelarReserva: vi.fn(),
  registrarMovimientoPago: vi.fn(),
  obtenerMovimientosPago: vi.fn(),
  buscarReservas: vi.fn(),
}));

// P3 — productos/ventas asociados (DetalleReservaContenido -> useVentasDeReserva).
vi.mock("../ventas/ventas.api", () => ({
  obtenerVentasPorReserva: vi.fn(),
}));

// P4 — devolver un producto (mismo RPC/mock que HistorialView.test.tsx).
vi.mock("../devoluciones/devoluciones.api", () => ({
  registrarDevolucion: vi.fn(),
}));

// CFG-F1.1 — nombre real de la cancha (DetalleReservaContenido ->
// useNombreCancha), mismo criterio que el resto de este archivo.
vi.mock("../configuracion/configuracion.api", () => ({
  obtenerDatosPublicosCancha: vi.fn(),
}));

// CFG-F2 — apertura real de hoy (useFranjaOperativa, para clasificar
// ocurrencias virtuales de turno fijo), mismo criterio que el resto de este
// archivo: sin este default resolvería contra el cliente real de Supabase.
vi.mock("../../reservations-public/reservations.api", () => ({
  obtenerFranjaOperativa: vi.fn(),
}));

// R2 — `jugadas` pasó a ser un prop obligatorio (antes ReservasView creaba su
// propia instancia de useReservasJugadas; ahora la levanta AdminShell y la
// comparte con CajaView, ver AdminShell.tsx). Este wrapper reproduce esa
// misma instancia acá, sin duplicar ningún mock: sigue siendo el mismo
// useReservasJugadas() de siempre, un nivel más arriba. Caja ya NO se
// renderiza dentro de ReservasView — sus propios tests viven en
// caja/CajaView.test.tsx.
// R5 — MotionConfig reducedMotion="always" desactiva las animaciones de
// Motion (el drawer/bottom sheet de detalle, la píldora animada de los tabs)
// durante los tests: sin esto, el cierre del bottom sheet queda "en vuelo"
// (AnimatePresence lo mantiene montado hasta que termina su spring) y bajo
// carga real de CI (muchos workers de test en paralelo) esa animación por
// requestAnimationFrame puede tardar bastante más que en una corrida aislada
// — exactamente el mismo motivo por el que Motion expone este flag para
// tests, en vez de ajustar el timeout a un entorno ideal.
function ReservasViewConJugadas(props: Omit<ReservasViewProps, "jugadas" | "proximas">) {
  const jugadas = useReservasJugadas();
  const proximas = useReservasProximas(); // Notificaciones — levantada a AdminShell, igual que jugadas
  return (
    <MotionConfig reducedMotion="always">
      <ReservasView {...props} jugadas={jugadas} proximas={proximas} />
    </MotionConfig>
  );
}

beforeEach(() => { Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1366 }); });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

// fecha lejana en el futuro para no depender de "hoy" real (no es pasado con
// ningún reloj de test) y `creado` = ahora para que procesarReservas la trate
// como vigente aunque esté pendiente.
function crearReserva(overrides: Partial<ReservaRow> = {}): ReservaRow {
  return {
    id: "r1",
    fecha: "2099-01-01",
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

function mockearCargas(proximasData: ReservaRow[]) {
  vi.mocked(obtenerReservasProximas).mockResolvedValue({ data: proximasData, error: null } as never);
  vi.mocked(obtenerReservasPorRango).mockResolvedValue({ data: [], error: null } as never);
  // Default defensivo: los tests que no ejercitan búsqueda no deberían
  // disparar una request real, pero si algún filtro de nombre/fecha cruza el
  // umbral por accidente, que resuelva vacío en vez de dejar una promesa sin
  // mock (evita "Unhandled Rejection" ruidoso en tests no relacionados).
  vi.mocked(buscarReservas).mockResolvedValue({ data: [], error: null } as never);
  // P3 — default defensivo: seleccionar cualquier fila real dispara
  // useVentasDeReserva; sin este default resolvería contra el cliente real.
  vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [], error: null } as never);
  vi.mocked(obtenerMovimientosPago).mockResolvedValue({ data: [], error: null } as never);
  // CFG-F1.1 — default defensivo: el panel de detalle dispara
  // useNombreCancha ni bien se selecciona una fila.
  vi.mocked(obtenerDatosPublicosCancha).mockResolvedValue({
    data: { nombre_cancha: "Los amigos padel" },
    error: null,
  } as never);
  // CFG-F2 — default defensivo: ReservasView siempre resuelve la apertura de
  // hoy al montar (useFranjaOperativa), para las ocurrencias virtuales de
  // turno fijo.
  vi.mocked(obtenerFranjaOperativa).mockResolvedValue({
    data: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "01:00:00" }],
    error: null,
  } as never);
}

// R5 — helpers de interacción del nuevo patrón lista+detalle.
async function irATab(user: ReturnType<typeof userEvent.setup>, nombre: RegExp | string) {
  await user.click(screen.getByRole("tab", { name: nombre }));
}

function panelDetalle(): HTMLElement {
  return screen.getByTestId("detalle-reserva");
}

async function seleccionarFila(user: ReturnType<typeof userEvent.setup>, contenedor: HTMLElement, nombre: RegExp | string) {
  await user.click(await within(contenedor).findByRole("button", { name: nombre }));
  return panelDetalle();
}

describe("ReservasView — selección", () => {
  it.each(["click", "teclado"])("%s: selecciona, deselecciona la misma fila y cambia a otra", async (modo) => {
    const user = userEvent.setup();
    mockearCargas([
      crearReserva({ id: "a", nombre: "Reserva A", confirmada: true }),
      crearReserva({ id: "b", nombre: "Reserva B", confirmada: true }),
    ]);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    const filaA = await within(proximas).findByRole("button", { name: "Reserva A" });
    const filaB = within(proximas).getByRole("button", { name: "Reserva B" });
    const detalle = panelDetalle();
    const activar = async (fila: HTMLElement, tecla = "{Enter}") => {
      if (modo === "click") await user.click(fila);
      else {
        fila.focus();
        await user.keyboard(tecla);
        // P7.1: abrir el detalle mueve el foco al panel.
      }
    };

    expect(within(detalle).getByText("Seleccioná una reserva para ver el detalle.")).toBeTruthy();
    await activar(filaA);
    expect(filaA.getAttribute("aria-pressed")).toBe("true");
    expect(filaA.classList.contains("bg-accent-muted")).toBe(true);
    expect(within(detalle).getByText("Reserva A")).toBeTruthy();

    await activar(filaA, " ");
    expect(filaA.getAttribute("aria-pressed")).toBe("false");
    expect(filaA.classList.contains("bg-accent-muted")).toBe(false);
    await waitFor(() => expect(within(detalle).queryByText("Reserva A")).toBeNull());
    expect(within(detalle).getByText("Seleccioná una reserva para ver el detalle.")).toBeTruthy();

    await activar(filaA);
    await activar(filaB);
    expect(filaA.getAttribute("aria-pressed")).toBe("false");
    expect(filaB.getAttribute("aria-pressed")).toBe("true");
    expect(within(detalle).queryByText("Reserva A")).toBeNull();
    expect(within(detalle).getByText("Reserva B")).toBeTruthy();
    expect(confirmarReserva).not.toHaveBeenCalled();
    expect(cancelarReserva).not.toHaveBeenCalled();
    expect(registrarMovimientoPago).not.toHaveBeenCalled();
  });
});

describe("ReservasView — confirmar", () => {
  it("pendiente: click Confirmar llama confirmarReserva con el id, desaparece de Pendientes y sigue en Próximas como Confirmado", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "p1", nombre: "Juan Pendiente" })]);
    vi.mocked(confirmarReserva).mockResolvedValue({ error: null } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);

    await irATab(user, /Pendientes/);
    const pendientes = await screen.findByLabelText("Pendientes");
    const detalle = await seleccionarFila(user, pendientes, "Juan Pendiente");
    await user.click(within(detalle).getByRole("button", { name: "Confirmar" }));

    expect(confirmarReserva).toHaveBeenCalledWith("p1");

    await waitFor(() => {
      expect(within(pendientes).queryByRole("button", { name: "Juan Pendiente" })).toBeNull();
    });

    await irATab(user, /Próximas/);
    const proximas = screen.getByLabelText("Próximas");
    expect(within(proximas).getByText("Confirmado")).toBeTruthy();
    expect(within(proximas).getByText(/Juan Pendiente/)).toBeTruthy();
  });

  it("error: muestra toast, la reserva sigue Pendiente y sigue en Pendientes", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "p1", nombre: "Juan Pendiente" })]);
    vi.mocked(confirmarReserva).mockResolvedValue({ error: { message: "fallo" } } as never);
    const mostrarToast = vi.fn();

    render(<ReservasViewConJugadas mostrarToast={mostrarToast} />);

    await irATab(user, /Pendientes/);
    const pendientes = await screen.findByLabelText("Pendientes");
    const detalle = await seleccionarFila(user, pendientes, "Juan Pendiente");
    await user.click(within(detalle).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(mostrarToast).toHaveBeenCalledWith("No se pudo confirmar. Probá de nuevo.", "error");
    });

    expect(within(pendientes).getByRole("button", { name: "Juan Pendiente" })).toBeTruthy();
    expect(within(detalle).getByText("Pendiente")).toBeTruthy();
  });
});

describe("ReservasView — cancelar", () => {
  it("éxito: abre modal, al confirmar llama cancelarReserva con el id y la reserva desaparece de Próximas", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "c1", nombre: "Ana Confirmada", confirmada: true })]);
    vi.mocked(cancelarReserva).mockResolvedValue({ error: null } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);

    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByRole("button", { name: "Ana Confirmada" })).toBeTruthy());
    const detalle = await seleccionarFila(user, proximas, "Ana Confirmada");
    await user.click(within(detalle).getByRole("button", { name: "Cancelar" }));

    const modal = screen.getByRole("dialog");
    await user.click(within(modal).getByRole("button", { name: "Confirmar" }));

    expect(cancelarReserva).toHaveBeenCalledWith("c1");

    await waitFor(() => {
      expect(within(proximas).queryByRole("button", { name: "Ana Confirmada" })).toBeNull();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    // El panel de detalle vuelve a su estado vacío (la reserva ya no existe).
    expect(await within(panelDetalle()).findByText("Seleccioná una reserva para ver el detalle.")).toBeTruthy();
  });

  it("error: muestra toast, la reserva NO desaparece, pero el modal se cierra igual (paridad legacy)", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "c1", nombre: "Ana Confirmada", confirmada: true })]);
    vi.mocked(cancelarReserva).mockResolvedValue({ error: { message: "fallo" } } as never);
    const mostrarToast = vi.fn();

    render(<ReservasViewConJugadas mostrarToast={mostrarToast} />);

    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByRole("button", { name: "Ana Confirmada" })).toBeTruthy());
    const detalle = await seleccionarFila(user, proximas, "Ana Confirmada");
    await user.click(within(detalle).getByRole("button", { name: "Cancelar" }));

    const modal = screen.getByRole("dialog");
    await user.click(within(modal).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(mostrarToast).toHaveBeenCalledWith("No se pudo cancelar. Probá de nuevo.", "error");
    });

    expect(within(proximas).getByRole("button", { name: "Ana Confirmada" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ReservasView — tabs y jugadas (B4.3)", () => {
  it("cambia de Próximas a Jugadas: se ven las jugadas y Próximas deja de ser la sección activa", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "p1", nombre: "Reserva Proxima", confirmada: true })]);
    vi.mocked(obtenerReservasPorRango).mockResolvedValueOnce({
      data: [crearReserva({ id: "j1", nombre: "Reserva Jugada", fecha: "2020-01-01", confirmada: true })],
      error: null,
    } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);

    const proximas = await screen.findByLabelText("Próximas");
    expect(within(proximas).getByText(/Reserva Proxima/)).toBeTruthy();

    await irATab(user, /Jugadas/);

    expect(screen.queryByLabelText("Próximas")).toBeNull();
    const jugadas = await screen.findByLabelText("Jugadas");
    expect(within(jugadas).getByText(/Reserva Jugada/)).toBeTruthy();
    expect(within(jugadas).getByText("Jugado")).toBeTruthy();
  });

  it("orden recientes/antiguos cambia el orden observable de la lista de Jugadas", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(obtenerReservasPorRango).mockResolvedValueOnce({
      data: [
        crearReserva({ id: "j1", nombre: "Reserva Vieja", fecha: "2020-01-01", confirmada: true }),
        crearReserva({ id: "j2", nombre: "Reserva Nueva", fecha: "2020-06-01", confirmada: true }),
      ],
      error: null,
    } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await irATab(user, /Jugadas/);
    const jugadas = await screen.findByLabelText("Jugadas");
    await waitFor(() => expect(within(jugadas).getByText(/Reserva Nueva/)).toBeTruthy());

    // Default "Recientes primero": la fecha más nueva aparece antes en el DOM.
    expect(jugadas.textContent!.indexOf("Reserva Nueva")).toBeLessThan(jugadas.textContent!.indexOf("Reserva Vieja"));

    await user.click(screen.getByRole("button", { name: "Antiguos primero" }));

    expect(jugadas.textContent!.indexOf("Reserva Vieja")).toBeLessThan(jugadas.textContent!.indexOf("Reserva Nueva"));
  });

  it("cargar semana anterior: pide el rango correcto y agrega las reservas sin reemplazar la semana actual", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(obtenerReservasPorRango)
      .mockResolvedValueOnce({
        data: [crearReserva({ id: "j1", nombre: "Reserva Actual", fecha: "2020-01-08", confirmada: true })],
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: [crearReserva({ id: "j0", nombre: "Reserva Anterior", fecha: "2020-01-01", confirmada: true })],
        error: null,
      } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await irATab(user, /Jugadas/);
    const jugadas = await screen.findByLabelText("Jugadas");
    await waitFor(() => expect(within(jugadas).getByText(/Reserva Actual/)).toBeTruthy());

    await user.click(within(jugadas).getByRole("button", { name: "Cargar semana anterior" }));

    await waitFor(() => expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2));
    const [inicio1, fin1] = vi.mocked(obtenerReservasPorRango).mock.calls[0] as [string, string];
    const [inicio2, fin2] = vi.mocked(obtenerReservasPorRango).mock.calls[1] as [string, string];
    const unaSemanaAntes = (iso: string) => {
      const d = new Date(`${iso}T00:00:00`);
      d.setDate(d.getDate() - 7);
      return d.toISOString().slice(0, 10);
    };
    expect(inicio2).toBe(unaSemanaAntes(inicio1));
    expect(fin2).toBe(unaSemanaAntes(fin1));

    await waitFor(() => expect(within(jugadas).getByText(/Reserva Anterior/)).toBeTruthy());
    expect(within(jugadas).getByText(/Reserva Actual/)).toBeTruthy();
  });

  // R2 — el toast de jugadas.errorAnterior se movió a AdminShell (dueño
  // único de la instancia compartida con CajaView, ver AdminShell.tsx): ya no
  // es un comportamiento de ReservasView, así que se deja de afirmar acá. Lo
  // que sigue siendo responsabilidad de esta vista es que un error no le
  // haga perder lo ya cargado ni deje el botón trabado.
  it("error al cargar semana anterior: conserva lo ya cargado y el botón sigue disponible para reintentar", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(obtenerReservasPorRango)
      .mockResolvedValueOnce({
        data: [crearReserva({ id: "j1", nombre: "Reserva Actual", fecha: "2020-01-08", confirmada: true })],
        error: null,
      } as never)
      .mockResolvedValueOnce({ data: null, error: { message: "fallo" } } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await irATab(user, /Jugadas/);
    const jugadas = await screen.findByLabelText("Jugadas");
    await waitFor(() => expect(within(jugadas).getByText(/Reserva Actual/)).toBeTruthy());

    await user.click(within(jugadas).getByRole("button", { name: "Cargar semana anterior" }));

    await waitFor(() => {
      const boton = within(jugadas).getByRole("button", { name: "Cargar semana anterior" }) as HTMLButtonElement;
      expect(boton.disabled).toBe(false);
    });
    expect(within(jugadas).getByText(/Reserva Actual/)).toBeTruthy();
  });
});

async function irAJugadas(user: ReturnType<typeof userEvent.setup>) {
  await irATab(user, /Jugadas/);
  return screen.findByLabelText("Jugadas");
}

describe("ReservasView — pagos por movimientos (FINAL-F6)", () => {
  const resultado = (ef: number, tr: number, repetido = false) => ({
    data: { operacion_id: "op", reserva_id: "j1", pago_efectivo: ef, pago_transferencia: tr, repetido },
    error: null,
  });
  let mostrarToast = vi.fn();
  beforeEach(() => { mostrarToast = vi.fn(); });

  async function abrirPago(user: ReturnType<typeof userEvent.setup>, reserva: Partial<ReservaRow>, boton: RegExp | string = "Cargar pago") {
    vi.mocked(obtenerReservasPorRango).mockResolvedValueOnce({
      data: [crearReserva({ id: "j1", nombre: "Pedro", fecha: "2020-01-01", confirmada: true, precio: 10000, ...reserva })],
      error: null,
    } as never);
    render(<ReservasViewConJugadas mostrarToast={mostrarToast} />);
    const jugadas = await irAJugadas(user);
    await waitFor(() => expect(within(jugadas).getByText(/Pedro/)).toBeTruthy());
    const detalle = await seleccionarFila(user, jugadas, "Pedro");
    await user.click(within(detalle).getByRole("button", { name: boton }));
    return { jugadas, modal: screen.getByRole("dialog", { name: "Pago del turno" }) };
  }

  it("abrir el pago precarga el SALDO en Efectivo pero no registra nada hasta tocar Registrar cobro", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    const { modal } = await abrirPago(user, { pago_efectivo: 5000 }, "Pago");
    expect(within(modal).getByTestId("pago-registrado").textContent).toBe("$5.000");
    expect(within(modal).getByTestId("cobro-resumen").textContent).toBe("Cobro: $5.000 en efectivo");
    expect(registrarMovimientoPago).not.toHaveBeenCalled();
  });

  it("cobro del saldo en Efectivo: manda solo lo recibido y lo que la UI mostraba; parchea la lista", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(registrarMovimientoPago).mockResolvedValue(resultado(10000, 0) as never);
    const { jugadas, modal } = await abrirPago(user, { pago_efectivo: 5000 }, "Pago");
    expect(within(modal).getByTestId("pago-resultado").textContent).toContain("$5.000 → $10.000");
    await user.click(within(modal).getByRole("button", { name: "Registrar cobro" }));
    expect(registrarMovimientoPago).toHaveBeenCalledWith(expect.objectContaining({
      reservaId: "j1", tipo: "cobro", efectivo: 5000, transferencia: 0, motivo: null, esperadoEfectivo: 5000, esperadoTransferencia: 0,
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pago del turno" })).toBeNull());
    expect(within(jugadas).getByText(/Efectivo \$10.000/)).toBeTruthy();
    expect(mostrarToast).toHaveBeenCalledWith("Movimiento registrado.", "ok");
  });

  it("cobro de un turno FUTURO: el botón existe en Próximos y registra el cobro", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "f1", nombre: "Futuro", confirmada: true, precio: 10000 })]);
    vi.mocked(registrarMovimientoPago).mockResolvedValue({ data: { operacion_id: "op", reserva_id: "f1", pago_efectivo: 0, pago_transferencia: 3000, repetido: false }, error: null } as never);
    render(<ReservasViewConJugadas mostrarToast={mostrarToast} />);
    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByText(/Futuro/)).toBeTruthy());
    const detalle = await seleccionarFila(user, proximas, "Futuro");
    await user.click(within(detalle).getByRole("button", { name: "Cobrar" }));
    const modal = screen.getByRole("dialog", { name: "Pago del turno" });
    await user.click(within(modal).getByRole("button", { name: "Mixto" }));
    await user.clear(within(modal).getByLabelText("Monto en transferencia"));
    await user.type(within(modal).getByLabelText("Monto en transferencia"), "3000");
    expect((within(modal).getByLabelText("Monto en efectivo") as HTMLInputElement).value).toBe("7000");
    await user.click(within(modal).getByRole("button", { name: "Registrar cobro" }));
    expect(registrarMovimientoPago).toHaveBeenCalledWith(expect.objectContaining({ reservaId: "f1", tipo: "cobro", efectivo: 7000, transferencia: 3000 }));
  });

  it("otra pestaña cambió el pago (pago_desactualizado): no se parchea nada, se explica y se recarga", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(registrarMovimientoPago).mockResolvedValue({ data: null, error: { message: "pago_desactualizado", code: "RP006" } } as never);
    const { jugadas, modal } = await abrirPago(user, {});
    const cargasPrevias = vi.mocked(obtenerReservasPorRango).mock.calls.length;
    await user.click(within(modal).getByRole("button", { name: "Registrar cobro" }));
    await within(modal).findByText(/Otro admin u otra pestaña registró un movimiento/);
    expect(within(modal).getByRole("button", { name: "Cerrar" })).toBeTruthy();
    expect((within(modal).getByRole("button", { name: "Registrar cobro" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(jugadas).getByText(/Pago sin registrar/)).toBeTruthy();
    await waitFor(() => expect(vi.mocked(obtenerReservasPorRango).mock.calls.length).toBeGreaterThan(cargasPrevias));
  });

  it("respuesta repetida (retry de una operación ya registrada): avisa que no se duplicó", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(registrarMovimientoPago).mockResolvedValue(resultado(10000, 0, true) as never);
    const { modal } = await abrirPago(user, {});
    await user.click(within(modal).getByRole("button", { name: "Registrar cobro" }));
    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("Ese movimiento ya estaba registrado (no se duplicó).", "ok"));
  });
});

function crearVarias(n: number, prefix: string, idPrefix: string): ReservaRow[] {
  return Array.from({ length: n }, (_, i) =>
    crearReserva({
      id: `${idPrefix}${i + 1}`,
      nombre: `${prefix} ${String(i + 1).padStart(2, "0")}`,
      fecha: `2099-01-${String(i + 1).padStart(2, "0")}`,
    }),
  );
}

// R5 — contador de filas renderizadas: reemplaza al viejo truco de contar
// links de WhatsApp (esa acción ya no vive en la lista, ver cabecera).
function contarFilas(contenedor: HTMLElement): number {
  return within(contenedor).getAllByTestId("fila-reserva").length;
}

// P3 — productos/ventas asociados en el panel de detalle. Mismo shape crudo
// real de SELECT_VENTA_CON_DETALLE que ya reproducen historial.logic.test.ts/
// useVentasDeReserva.test.ts/AgendaView.test.tsx — cada archivo arma su
// propia fixture local, sin compartirla entre sí.
function crearItemCrudoP3(overrides: Partial<ItemVentaCruda> = {}): ItemVentaCruda {
  return {
    id: "i1",
    producto_id: "p1",
    cantidad: 2,
    precio_unitario_snapshot: 4000,
    costo_unitario_snapshot: 1500,
    subtotal: 8000,
    creado: new Date().toISOString(),
    productos: { nombre: "Pelotas" },
    devoluciones: [],
    ...overrides,
  };
}

function crearVentaCrudaP3(overrides: Partial<VentaCruda> = {}): VentaCruda {
  return {
    id: "v1",
    reserva_id: "r1",
    fecha: "2099-01-01",
    pago_efectivo: 8000,
    pago_transferencia: 0,
    total: 8000,
    creado: new Date().toISOString(),
    reservas: null,
    venta_items: [crearItemCrudoP3()],
    ...overrides,
  };
}

describe("ReservasView — P3 productos/ventas asociados", () => {
  it("sin ventas: la sección Productos muestra 'Sin productos asociados.'", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true })]);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");

    const detalle = await seleccionarFila(user, proximas, "Juan");

    expect(await within(detalle).findByText("Sin productos asociados.")).toBeTruthy();
  });

  it("una venta con un producto: aparece en Productos y suma en el Resumen (Productos netos/Total asociado)", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [crearVentaCrudaP3()], error: null } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");

    const detalle = await seleccionarFila(user, proximas, "Juan");

    expect(await within(detalle).findByText(/Pelotas × 2/)).toBeTruthy();
    expect(within(detalle).getByText("Productos netos").parentElement?.textContent).toContain("$8.000");
    expect(within(detalle).getByText("Total asociado").parentElement?.textContent).toContain("$28.000");
  });

  it("varias ventas asociadas a la misma reserva: se listan los productos de todas y se suman", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({
      data: [
        crearVentaCrudaP3({ id: "v1", total: 8000 }),
        crearVentaCrudaP3({
          id: "v2",
          total: 3000,
          venta_items: [crearItemCrudoP3({ id: "i2", producto_id: "p2", cantidad: 1, precio_unitario_snapshot: 3000, subtotal: 3000, productos: { nombre: "Grips" } })],
        }),
      ],
      error: null,
    } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");

    const detalle = await seleccionarFila(user, proximas, "Juan");

    expect(await within(detalle).findByText(/Pelotas × 2/)).toBeTruthy();
    expect(within(detalle).getByText(/Grips × 1/)).toBeTruthy();
    expect(within(detalle).getByText("Productos netos").parentElement?.textContent).toContain("$11.000");
  });

  it("devolución parcial: muestra 'Devueltos X de Y' y el neto en Productos/Resumen", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({
      data: [crearVentaCrudaP3({ venta_items: [crearItemCrudoP3({ devoluciones: [{ cantidad: 1, medio_reembolso: "efectivo" }] })] })],
      error: null,
    } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");

    const detalle = await seleccionarFila(user, proximas, "Juan");

    expect(await within(detalle).findByText("Devueltos 1 de 2")).toBeTruthy();
    expect(within(detalle).getByText("Productos netos").parentElement?.textContent).toContain("$4.000");
  });

  it("devolución total: el ítem sigue visible ('Totalmente devuelto'), pero no suma al Resumen", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({
      data: [crearVentaCrudaP3({ venta_items: [crearItemCrudoP3({ devoluciones: [{ cantidad: 2, medio_reembolso: "efectivo" }] })] })],
      error: null,
    } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");

    const detalle = await seleccionarFila(user, proximas, "Juan");

    expect(await within(detalle).findByText("Totalmente devuelto (2)")).toBeTruthy();
    expect(within(detalle).getByText("Productos netos").parentElement?.textContent).toContain("$0");
  });

  it.each([
    { nombre: "SinPagar", pagoEfectivo: 0, esperado: "Pago pendiente" },
    { nombre: "PagoParcial", pagoEfectivo: 10000, esperado: "Pago parcial" },
    { nombre: "PagoCompleto", pagoEfectivo: 20000, esperado: "Pago completo" },
  ])("estado de pago del turno ($esperado)", async ({ nombre, pagoEfectivo, esperado }) => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre, confirmada: true, precio: 20000, pago_efectivo: pagoEfectivo, pago_transferencia: 0 })]);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");

    const detalle = await seleccionarFila(user, proximas, nombre);

    expect(within(detalle).getByText(esperado)).toBeTruthy();
  });

  it("saldo pendiente NUNCA incluye productos: turno sin pagar + producto ya cobrado -> el saldo es solo el del turno", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true, precio: 20000, pago_efectivo: 0, pago_transferencia: 0 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [crearVentaCrudaP3()], error: null } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");

    const detalle = await seleccionarFila(user, proximas, "Juan");
    await within(detalle).findByText(/Pelotas × 2/);

    expect(within(detalle).getByText("Total asociado").parentElement?.textContent).toContain("$28.000");
    expect(within(detalle).getByText("Saldo pendiente").parentElement?.textContent).toContain("$20.000");
  });

  it("error al cargar productos: mensaje + botón Reintentar; Reintentar dispara una nueva carga", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true })]);
    vi.mocked(obtenerVentasPorReserva)
      .mockResolvedValueOnce({ data: null, error: { message: "fallo" } } as never)
      .mockResolvedValueOnce({ data: [crearVentaCrudaP3()], error: null } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");

    const detalle = await seleccionarFila(user, proximas, "Juan");
    expect(await within(detalle).findByText("No se pudieron cargar los productos.")).toBeTruthy();

    await user.click(within(detalle).getByRole("button", { name: "Reintentar" }));

    expect(await within(detalle).findByText(/Pelotas × 2/)).toBeTruthy();
    expect(within(detalle).queryByText("No se pudieron cargar los productos.")).toBeNull();
  });

  it("cambiar rápido de reserva seleccionada no muestra datos stale de la anterior", async () => {
    const user = userEvent.setup();
    mockearCargas([
      crearReserva({ id: "r1", nombre: "Primera", confirmada: true }),
      crearReserva({ id: "r2", nombre: "Segunda", confirmada: true, fecha: "2099-01-02" }),
    ]);
    const diferidoPrimera = crearDiferido<{ data: VentaCruda[]; error: null }>();
    vi.mocked(obtenerVentasPorReserva)
      .mockReturnValueOnce(diferidoPrimera.promise as never)
      .mockResolvedValueOnce({ data: [crearVentaCrudaP3({ id: "vb", reserva_id: "r2" })], error: null } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");

    // Selecciona la primera (carga en vuelo, sin resolver todavía) y cambia
    // enseguida a la segunda, ANTES de que la primera responda.
    await seleccionarFila(user, proximas, "Primera");
    const detalle = await seleccionarFila(user, proximas, "Segunda");
    expect(await within(detalle).findByText(/Pelotas × 2/)).toBeTruthy();

    // La respuesta tardía de la primera reserva no debe pisar lo que ya se
    // asentó para la segunda.
    await act(async () => {
      diferidoPrimera.resolve({ data: [crearVentaCrudaP3({ id: "va", reserva_id: "r1" })], error: null });
    });
    expect(within(detalle).getByText(/Pelotas × 2/)).toBeTruthy();
  });
});

// P4 — devolver un producto desde el detalle de Reservas. Mismo RPC/modal
// que ya usa HistorialView.test.tsx (registrar_devolucion, DevolucionModal) y
// mismo criterio de AgendaView.test.tsx — acá se confirma el cableado
// (patch local vía itemsConVentaId + patchearDevolucion), no se re-derivan
// los casos de negocio ya cubiertos ahí.
describe("ReservasView — P4 devolver productos desde el detalle", () => {
  it("devolución parcial: patchea cantidad/neto y el Resumen sin refetch", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [crearVentaCrudaP3()], error: null } as never);
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-1", error: null } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    const detalle = await seleccionarFila(user, proximas, "Juan");
    await within(detalle).findByText(/Pelotas × 2/);

    await user.click(within(detalle).getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledWith("i1", 1, null, "efectivo", expect.any(String)));
    expect(screen.queryByRole("dialog", { name: "Devolver · Pelotas" })).toBeNull();
    expect(within(detalle).getByText("Devueltos 1 de 2")).toBeTruthy();
    expect(within(detalle).getByText("Productos netos").parentElement?.textContent).toContain("$4.000");
    expect(within(detalle).getByText("Total asociado").parentElement?.textContent).toContain("$24.000");
    expect(obtenerVentasPorReserva).toHaveBeenCalledTimes(1);
  });

  it("devolución total: cantidad vigente llega a 0, ya no queda botón Devolver para ese ítem", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [crearVentaCrudaP3()], error: null } as never);
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-1", error: null } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    const detalle = await seleccionarFila(user, proximas, "Juan");
    await within(detalle).findByText(/Pelotas × 2/);

    await user.click(within(detalle).getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "2");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledWith("i1", 2, null, "efectivo", expect.any(String)));
    expect(within(detalle).getByText("Totalmente devuelto (2)")).toBeTruthy();
    expect(within(detalle).queryByRole("button", { name: "Devolver" })).toBeNull();
    expect(within(detalle).getByText("Productos netos").parentElement?.textContent).toContain("$0");
  });

  it("devolución previa + nueva: el disponible ya refleja lo devuelto antes, y se acumula", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({
      data: [crearVentaCrudaP3({ venta_items: [crearItemCrudoP3({ devoluciones: [{ cantidad: 1, medio_reembolso: "efectivo" }] })] })],
      error: null,
    } as never);
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-2", error: null } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    const detalle = await seleccionarFila(user, proximas, "Juan");
    await within(detalle).findByText("Devueltos 1 de 2");

    await user.click(within(detalle).getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    expect(within(modal).getByText("Cantidad disponible para devolver: 1")).toBeTruthy();
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledWith("i1", 1, null, "efectivo", expect.any(String)));
    expect(within(detalle).getByText("Totalmente devuelto (2)")).toBeTruthy();
  });

  it("varias ventas asociadas: devolver un producto de una no afecta los ítems de la otra", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({
      data: [
        crearVentaCrudaP3({ id: "v1", total: 8000 }),
        crearVentaCrudaP3({
          id: "v2",
          total: 3000,
          venta_items: [crearItemCrudoP3({ id: "i2", producto_id: "p2", cantidad: 1, precio_unitario_snapshot: 3000, subtotal: 3000, productos: { nombre: "Grips" } })],
        }),
      ],
      error: null,
    } as never);
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-1", error: null } as never);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    const detalle = await seleccionarFila(user, proximas, "Juan");
    await within(detalle).findByText(/Pelotas × 2/);
    expect(within(detalle).getByText("Productos netos").parentElement?.textContent).toContain("$11.000");

    const botonesDevolver = within(detalle).getAllByRole("button", { name: "Devolver" });
    await user.click(botonesDevolver[0]);
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledWith("i1", 1, null, "efectivo", expect.any(String)));
    expect(within(detalle).getByText("Devueltos 1 de 2")).toBeTruthy();
    expect(within(detalle).getByText(/Grips × 1/)).toBeTruthy();
    expect(within(detalle).getByText("Productos netos").parentElement?.textContent).toContain("$7.000");
  });

  it("error del RPC: no patchea la UI y muestra el toast de error", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "r1", nombre: "Juan", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [crearVentaCrudaP3()], error: null } as never);
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: null, error: { message: "network" } } as never);
    const mostrarToast = vi.fn();
    render(<ReservasViewConJugadas mostrarToast={mostrarToast} />);
    const proximas = await screen.findByLabelText("Próximas");
    const detalle = await seleccionarFila(user, proximas, "Juan");
    await within(detalle).findByText(/Pelotas × 2/);

    await user.click(within(detalle).getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("No se pudo registrar la devolución. Probá de nuevo.", "error"));
    expect(screen.getByRole("dialog", { name: "Devolver · Pelotas" })).toBeTruthy();
    expect(within(detalle).queryByText(/Devueltos/)).toBeNull();
    expect(within(detalle).getByText("Productos netos").parentElement?.textContent).toContain("$8.000");
  });
});

describe("ReservasView — filtros y límite visible (B4.5.1)", () => {
  it("filtro Hoy oculta reservas que no son de hoy, y al desactivarlo vuelven a aparecer", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "p1", nombre: "Reserva Futura" })]);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByText(/Reserva Futura/)).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "Hoy" }));

    await waitFor(() => expect(within(proximas).queryByText(/Reserva Futura/)).toBeNull());
    expect(await within(proximas).findByText("No hay reservas para mostrar.")).toBeTruthy();

    // click de nuevo sobre el filtro ya activo -> vuelve a null (admin.html:2341-2344).
    await user.click(screen.getByRole("button", { name: "Hoy" }));
    await waitFor(() => expect(within(proximas).getByText(/Reserva Futura/)).toBeTruthy());
  });

  it("Solo pendientes filtra las confirmadas de Próximas", async () => {
    const user = userEvent.setup();
    mockearCargas([
      crearReserva({ id: "p1", nombre: "Reserva Confirmada", confirmada: true }),
      crearReserva({ id: "p2", nombre: "Reserva Pendiente", confirmada: false }),
    ]);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByText(/Reserva Confirmada/)).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "Solo pendientes" }));

    await waitFor(() => expect(within(proximas).queryByText(/Reserva Confirmada/)).toBeNull());
    expect(within(proximas).getByText(/Reserva Pendiente/)).toBeTruthy();
  });

  it("Solo pendientes sigue activo al cambiar a Jugadas y también filtra ahí", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(obtenerReservasPorRango).mockResolvedValueOnce({
      data: [
        crearReserva({ id: "j1", nombre: "Jugada Confirmada", fecha: "2020-01-01", confirmada: true }),
        crearReserva({ id: "j2", nombre: "Jugada Pendiente", fecha: "2020-01-01", confirmada: false }),
      ],
      error: null,
    } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");
    await user.click(screen.getByRole("button", { name: "Solo pendientes" }));
    await irATab(user, /Jugadas/);

    const jugadas = await screen.findByLabelText("Jugadas");
    await waitFor(() => expect(within(jugadas).getByText(/Jugada Pendiente/)).toBeTruthy());
    expect(within(jugadas).queryByText(/Jugada Confirmada/)).toBeNull();
  });

  it("Limpiar aparece solo con un filtro activo y resetea fecha/nombre/rápido", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "p1", nombre: "Reserva Futura" })]);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByText(/Reserva Futura/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Limpiar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Hoy" }));
    await waitFor(() => expect(within(proximas).queryByText(/Reserva Futura/)).toBeNull());
    expect(screen.getByRole("button", { name: "Limpiar" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Limpiar" }));

    await waitFor(() => expect(within(proximas).getByText(/Reserva Futura/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Limpiar" })).toBeNull();
  });

  it("Mostrar más: empieza mostrando 20 y suma 20 más al hacer click", async () => {
    const user = userEvent.setup();
    mockearCargas(crearVarias(25, "Reserva", "p"));

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(contarFilas(proximas)).toBe(20));

    await user.click(screen.getByRole("button", { name: "Mostrar más (5 más)" }));

    await waitFor(() => expect(contarFilas(proximas)).toBe(25));
    expect(screen.queryByRole("button", { name: /Mostrar más/ })).toBeNull();
  });

  it("cambiar el filtro de nombre resetea el límite visible a 20", async () => {
    const user = userEvent.setup();
    mockearCargas(crearVarias(25, "Reserva", "p"));

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    await user.click(await screen.findByRole("button", { name: "Mostrar más (5 más)" }));
    await waitFor(() => expect(contarFilas(proximas)).toBe(25));

    // "Re" (2 caracteres, se mantiene local — B4.5.2 recién activa la
    // búsqueda server-side a partir de 3) matchea las 25 por igual (mismo
    // prefijo) — el total filtrado no cambia, solo el límite visible que se
    // resetea a 20.
    await user.type(screen.getByPlaceholderText("Buscar por nombre..."), "Re");

    await waitFor(() => expect(contarFilas(proximas)).toBe(20));
    expect(screen.getByRole("button", { name: "Mostrar más (5 más)" })).toBeTruthy();
  });

  it("cambiar de tab resetea el límite visible a 20", async () => {
    const user = userEvent.setup();
    mockearCargas(crearVarias(25, "Reserva", "p"));

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    await user.click(await screen.findByRole("button", { name: "Mostrar más (5 más)" }));
    await waitFor(() => expect(contarFilas(proximas)).toBe(25));

    await irATab(user, /Jugadas/);
    await screen.findByLabelText("Jugadas");
    await irATab(user, /Próximas/);

    const proximasDeNuevo = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(contarFilas(proximasDeNuevo)).toBe(20));
    expect(screen.getByRole("button", { name: "Mostrar más (5 más)" })).toBeTruthy();
  });
});

// Promesa controlable a mano para ejercitar el guard anti-race: se resuelve
// cuando el test lo decide, no cuando el mock lo decide.
function crearDiferido<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("ReservasView — búsqueda server-side (B4.5.2)", () => {
  it("nombre con menos de 3 caracteres no dispara búsqueda server-side", async () => {
    mockearCargas([]);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre..."), { target: { value: "Re" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(buscarReservas).not.toHaveBeenCalled();
  });

  it("nombre con 3+ caracteres espera el debounce de 400ms y llama buscarReservas con los valores correctos", async () => {
    mockearCargas([]);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre..."), { target: { value: "Juan" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(buscarReservas).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(buscarReservas).toHaveBeenCalledWith({ nombre: "Juan", fecha: "" });
  });

  it("una fecha pasada fuera del rango cargado activa la búsqueda server-side", async () => {
    mockearCargas([]);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");

    vi.useFakeTimers();
    selectPastDate(screen.getByRole("button", { name: "Fecha" }), "2020-01-01");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(buscarReservas).toHaveBeenCalledWith({ nombre: "", fecha: "2020-01-01" });
  });

  it("limpiar los filtros mientras la búsqueda está en vuelo descarta la respuesta vieja", async () => {
    mockearCargas([]);
    const diferido = crearDiferido<{ data: ReservaRow[]; error: null }>();
    vi.mocked(buscarReservas).mockReturnValueOnce(diferido.promise as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre..."), { target: { value: "Juan" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(buscarReservas).toHaveBeenCalledTimes(1);

    // Limpia mientras la request A sigue pendiente.
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));

    await act(async () => {
      diferido.resolve({ data: [crearReserva({ id: "x1", nombre: "Juan Viejo" })], error: null });
    });

    const proximas = screen.getByLabelText("Próximas");
    expect(within(proximas).queryByText(/Juan Viejo/)).toBeNull();
  });

  it("pasar de 3+ caracteres a menos de 3 descarta la respuesta pendiente de la búsqueda vieja", async () => {
    mockearCargas([]);
    const diferido = crearDiferido<{ data: ReservaRow[]; error: null }>();
    vi.mocked(buscarReservas).mockReturnValueOnce(diferido.promise as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");

    vi.useFakeTimers();
    const input = screen.getByPlaceholderText("Buscar por nombre...");
    fireEvent.change(input, { target: { value: "Juan" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(buscarReservas).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "Ju" } });

    await act(async () => {
      diferido.resolve({ data: [crearReserva({ id: "x1", nombre: "Juan Viejo" })], error: null });
    });

    const proximas = screen.getByLabelText("Próximas");
    expect(within(proximas).queryByText(/Juan Viejo/)).toBeNull();
  });

  it("carrera A→B: la respuesta de una búsqueda vieja no pisa la de una más nueva", async () => {
    mockearCargas([]);
    const diferidoA = crearDiferido<{ data: ReservaRow[]; error: null }>();
    const diferidoB = crearDiferido<{ data: ReservaRow[]; error: null }>();
    vi.mocked(buscarReservas)
      .mockReturnValueOnce(diferidoA.promise as never)
      .mockReturnValueOnce(diferidoB.promise as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");

    vi.useFakeTimers();
    const input = screen.getByPlaceholderText("Buscar por nombre...");
    fireEvent.change(input, { target: { value: "Juan" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(buscarReservas).toHaveBeenNthCalledWith(1, { nombre: "Juan", fecha: "" });

    fireEvent.change(input, { target: { value: "Juan Pérez" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(buscarReservas).toHaveBeenNthCalledWith(2, { nombre: "Juan Pérez", fecha: "" });

    // Ambos nombres contienen "Juan Pérez" (el filtro local vigente al
    // resolver) para que el resultado de A, si llegara a colarse, pase
    // igual el pasaFiltros que se re-aplica sobre resultadosBusqueda — así la
    // aserción prueba específicamente el guard anti-race, no un descarte por
    // un filtro de nombre que no coincide.
    // Se resuelve primero B (la búsqueda nueva) y recién después A (la vieja).
    await act(async () => {
      diferidoB.resolve({ data: [crearReserva({ id: "b1", nombre: "Juan Pérez Nuevo" })], error: null });
    });
    await act(async () => {
      diferidoA.resolve({ data: [crearReserva({ id: "a1", nombre: "Juan Pérez Antiguo" })], error: null });
    });

    const proximas = screen.getByLabelText("Próximas");
    expect(within(proximas).getByText(/Juan Pérez Nuevo/)).toBeTruthy();
    expect(within(proximas).queryByText(/Juan Pérez Antiguo/)).toBeNull();
  });

  it("confirmar con búsqueda activa también actualiza resultadosBusqueda", async () => {
    mockearCargas([]);
    vi.mocked(confirmarReserva).mockResolvedValue({ error: null } as never);
    vi.mocked(buscarReservas).mockResolvedValueOnce({
      data: [crearReserva({ id: "b1", nombre: "Juan Buscado", confirmada: false })],
      error: null,
    } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre..."), { target: { value: "Juan" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    vi.useRealTimers();

    const proximas = screen.getByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByText(/Juan Buscado/)).toBeTruthy());

    const user = userEvent.setup();
    const detalle = await seleccionarFila(user, proximas, "Juan Buscado");
    await user.click(within(detalle).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(within(proximas).getByText("Confirmado")).toBeTruthy());
  });

  it("confirmar sin búsqueda activa sigue funcionando (actualizarLocal sobre búsqueda nula es no-op)", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "p1", nombre: "Juan Pendiente" })]);
    vi.mocked(confirmarReserva).mockResolvedValue({ error: null } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByText(/Juan Pendiente/)).toBeTruthy());

    const detalle = await seleccionarFila(user, proximas, "Juan Pendiente");
    await user.click(within(detalle).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(within(proximas).getByText("Confirmado")).toBeTruthy());
    expect(buscarReservas).not.toHaveBeenCalled();
  });
});

// Miércoles fijo a mediodía: cualquier reserva de "hoy" con horario matutino
// (08:00-09:00) ya es "pasado" sin importar cuándo corra realmente el test.
const HOY_FIJO = "2026-06-17";
const AHORA_FIJO = new Date("2026-06-17T12:00:00-03:00");

function crearJugadaHoy(overrides: Partial<ReservaRow> = {}): ReservaRow {
  return crearReserva({
    fecha: HOY_FIJO,
    hora_inicio: "08:00:00",
    hora_fin: "09:00:00",
    confirmada: true,
    precio: 20000,
    pago_efectivo: 0,
    pago_transferencia: 0,
    ...overrides,
  });
}

// R2 — "Caja semanal"/"Cierre de caja" ya no viven en ReservasView (se
// mudaron a CajaView, que comparte la misma instancia de `jugadas` — ver
// AdminShell.tsx). Los tests de esos números viven ahora en
// caja/CajaView.test.tsx: los 3 que ejercitaban "pagar en Reservas actualiza
// Caja en vivo, sin refetch" se movieron ahí con un harness que monta
// ReservasView+CajaView compartiendo una sola instancia real del hook
// (exactamente lo que AdminShell hace) — es la única forma honesta de seguir
// probando esa garantía cruzada entre las dos vistas. Acá solo queda lo que
// sigue siendo 100% responsabilidad de ReservasView: Horas jugadas/Ocupación
// hoy no se mueven con filtros locales ni con una búsqueda activa.
describe("ReservasView — KPIs (B4.5.3)", () => {
  it("KPIs iniciales: horas jugadas y ocupación hoy", async () => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    vi.mocked(obtenerReservasPorRango).mockResolvedValueOnce({
      data: [crearJugadaHoy({ id: "j1", nombre: "Turno Hoy" })],
      error: null,
    } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");

    const indicadores = screen.getByLabelText("Indicadores");
    await waitFor(() => expect(within(indicadores).getByText("1")).toBeTruthy()); // horas jugadas
    expect(within(indicadores).getByText("100%")).toBeTruthy(); // ocupación hoy
    expect(within(indicadores).getByText("1/1 jugados")).toBeTruthy();
  });

  it("un filtro rápido local (Hoy) no cambia los KPIs", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    vi.mocked(obtenerReservasPorRango).mockResolvedValueOnce({
      data: [crearJugadaHoy({ id: "j1", nombre: "Turno Hoy" })],
      error: null,
    } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");
    const indicadores = screen.getByLabelText("Indicadores");
    await waitFor(() => expect(within(indicadores).getByText("100%")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "Hoy" }));

    expect(within(indicadores).getByText("100%")).toBeTruthy();
  });

  it("una búsqueda server-side activa no cambia los KPIs", async () => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    vi.mocked(obtenerReservasPorRango).mockResolvedValueOnce({
      data: [crearJugadaHoy({ id: "j1", nombre: "Turno Hoy" })],
      error: null,
    } as never);
    vi.mocked(buscarReservas).mockResolvedValueOnce({
      data: [crearReserva({ id: "b1", nombre: "Otra Cosa Muy Distinta", precio: 999999 })],
      error: null,
    } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");
    const indicadores = screen.getByLabelText("Indicadores");
    await waitFor(() => expect(within(indicadores).getByText("100%")).toBeTruthy());

    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre..."), { target: { value: "Otra" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    vi.useRealTimers();

    await waitFor(() => expect(buscarReservas).toHaveBeenCalled());
    expect(within(indicadores).getByText("100%")).toBeTruthy();
    expect(within(indicadores).queryByText("$999.999")).toBeNull();
  });
});

function stubVisibilidad(estado: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: estado });
}

describe("ReservasView — refresco en vivo (B5)", () => {
  afterEach(() => {
    // Object.defineProperty deja una own-property que tapa el getter nativo
    // de jsdom — hay que sacarla para no filtrar estado entre tests.
    Reflect.deleteProperty(document, "visibilityState");
  });

  // R2 — el refresco de `jugadas` (antes también acá) se movió a AdminShell,
  // dueño único de esa instancia desde que Caja la comparte — ver
  // AdminShell.tsx. Este test queda escopado a lo que sigue siendo
  // responsabilidad de ReservasView: el polling de `proximas`.
  it("polling: refresca próximas cada 5 minutos sin mostrar el spinner de carga", async () => {
    mockearCargas([]);
    vi.useFakeTimers();
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);

    // vi.advanceTimersByTimeAsync(0) flushea la promesa ya resuelta del mount
    // (mockResolvedValue) sin depender de timers reales, a diferencia de
    // findBy/waitFor (que si se llaman acá, bajo fake timers, se cuelgan).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(obtenerReservasProximas).toHaveBeenCalledTimes(2);
    // silencioso: nunca debe aparecer el texto de carga.
    expect(screen.queryByText("Cargando próximas...")).toBeNull();
  });

  it("visibilitychange a 'visible' dispara un refresco silencioso; a 'hidden' no hace nada", async () => {
    mockearCargas([]);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    stubVisibilidad("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    stubVisibilidad("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(2);
  });

  it("cleanup: al desmontar deja de pollear y de escuchar visibilitychange", async () => {
    mockearCargas([]);
    vi.useFakeTimers();
    const { unmount } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    stubVisibilidad("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);
  });

  it("guard de secuencia: una recarga vieja que resuelve tarde no pisa la de una recarga más nueva", async () => {
    mockearCargas([]);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");

    const diferidoA = crearDiferido<{ data: ReservaRow[]; error: null }>();
    const diferidoB = crearDiferido<{ data: ReservaRow[]; error: null }>();
    vi.mocked(obtenerReservasProximas)
      .mockReturnValueOnce(diferidoA.promise as never)
      .mockReturnValueOnce(diferidoB.promise as never);

    stubVisibilidad("visible");
    // Dos triggers casi simultáneos (ej. visibilitychange dos veces seguidas,
    // o visibilitychange + Realtime): A arranca, y antes de que resuelva ya
    // arrancó B.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange")); // arranca A
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange")); // arranca B
    });

    // B (la más nueva) resuelve primero.
    await act(async () => {
      diferidoB.resolve({ data: [crearReserva({ id: "b1", nombre: "Reserva B" })], error: null });
    });
    // A (la más vieja) resuelve después — su respuesta debe descartarse.
    await act(async () => {
      diferidoA.resolve({ data: [crearReserva({ id: "a1", nombre: "Reserva A" })], error: null });
    });

    const proximas = screen.getByLabelText("Próximas");
    expect(within(proximas).getByText(/Reserva B/)).toBeTruthy();
    expect(within(proximas).queryByText(/Reserva A/)).toBeNull();
  });

  it("nuevaReservaSignal: recarga próximas", async () => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    const { rerender } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} nuevaReservaSignal={null} />);
    await screen.findByLabelText("Próximas");
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} nuevaReservaSignal={{ fecha: HOY_FIJO, token: 1 }} />);
    });

    expect(obtenerReservasProximas).toHaveBeenCalledTimes(2);
  });

  it("nuevaReservaSignal con fecha fuera de la semana actual: recarga próximas pero no jugadas", async () => {
    vi.setSystemTime(AHORA_FIJO);
    mockearCargas([]);
    const { rerender } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} nuevaReservaSignal={null} />);
    await screen.findByLabelText("Próximas");

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} nuevaReservaSignal={{ fecha: "2020-01-01", token: 1 }} />);
    });

    expect(obtenerReservasProximas).toHaveBeenCalledTimes(2);
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);
  });

  it("nuevaReservaSignal con el mismo token no dispara una recarga extra (ni el que ya traía al montar)", async () => {
    mockearCargas([]);
    const signal = { fecha: "2020-01-01", token: 1 };
    const { rerender } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} nuevaReservaSignal={signal} />);
    await screen.findByLabelText("Próximas");
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1); // solo el mount

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} nuevaReservaSignal={{ ...signal }} />);
    });

    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);
  });
});

describe("ReservasView — activo (B8)", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("activo=false: no arma polling ni escucha visibilitychange", async () => {
    mockearCargas([]);
    vi.useFakeTimers();
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1); // solo el mount

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1); // sin refresco por polling

    stubVisibilidad("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1); // sin refresco por visibilitychange
  });

  it("activo=false: nuevaReservaSignal no dispara ninguna recarga", async () => {
    mockearCargas([]);
    const { rerender } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} nuevaReservaSignal={null} />);
    await screen.findByLabelText("Próximas");
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} nuevaReservaSignal={{ fecha: HOY_FIJO, token: 1 }} />,
      );
    });

    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);
  });

  it("false→true: dispara un refresco silencioso inmediato de próximas (sin spinner)", async () => {
    mockearCargas([]);
    const { rerender } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} />);
    await screen.findByLabelText("Próximas");
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} activo />);
    });

    expect(obtenerReservasProximas).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Cargando próximas...")).toBeNull();
  });

  it("false→true: una señal vieja acumulada mientras estaba oculta no duplica el refresco de activación", async () => {
    mockearCargas([]);
    const { rerender } = render(
      <ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} nuevaReservaSignal={{ fecha: HOY_FIJO, token: 5 }} />,
    );
    await screen.findByLabelText("Próximas");
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} activo nuevaReservaSignal={{ fecha: HOY_FIJO, token: 5 }} />);
    });

    // Un único refresco (el de activación), no dos.
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(2);
  });

  it("modal de cancelar se cierra al desactivar la vista si no hay ninguna mutación en curso", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "c1", nombre: "Ana Confirmada", confirmada: true })]);
    const { rerender } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} activo />);

    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByRole("button", { name: "Ana Confirmada" })).toBeTruthy());
    const detalle = await seleccionarFila(user, proximas, "Ana Confirmada");
    await user.click(within(detalle).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} />);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("modal de cancelar NO se cierra al desactivar mientras la cancelación está en curso", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "c1", nombre: "Ana Confirmada", confirmada: true })]);
    const diferido = crearDiferido<{ error: null }>();
    vi.mocked(cancelarReserva).mockReturnValueOnce(diferido.promise as never);
    const { rerender } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} activo />);

    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByRole("button", { name: "Ana Confirmada" })).toBeTruthy());
    const detalle = await seleccionarFila(user, proximas, "Ana Confirmada");
    await user.click(within(detalle).getByRole("button", { name: "Cancelar" }));
    const modal = screen.getByRole("dialog");
    await user.click(within(modal).getByRole("button", { name: "Confirmar" }));
    // La cancelación quedó en vuelo (diferido sin resolver) -> procesandoCancelar=true.

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} />);
    });
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => {
      diferido.resolve({ error: null });
    });
    // Al resolver, el propio flujo de confirmarCancelacion cierra el modal.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("modal de pago se cierra al desactivar la vista si no hay ningún guardado en curso", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(obtenerReservasPorRango).mockResolvedValueOnce({
      data: [crearReserva({ id: "j1", nombre: "Pedro", fecha: "2020-01-01", confirmada: true, precio: 20000 })],
      error: null,
    } as never);
    const { rerender } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} activo />);

    const jugadas = await irAJugadas(user);
    await waitFor(() => expect(within(jugadas).getByText(/Pedro/)).toBeTruthy());
    const detalle = await seleccionarFila(user, jugadas, "Pedro");
    await user.click(within(detalle).getByRole("button", { name: "Cargar pago" }));
    expect(screen.getByRole("dialog", { name: "Pago del turno" })).toBeTruthy();

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} />);
    });

    expect(screen.queryByRole("dialog", { name: "Pago del turno" })).toBeNull();
  });
});

// C6 — signal dedicado de materializar_turnos_fijos_jugados (AdminShell, una
// vez por sesión). A diferencia de nuevaReservaSignal, no filtra por fecha:
// cualquier cambio de token, estando activa, refresca próximas y jugadas.
describe("ReservasView — materializacionSignal (C6)", () => {
  it("cambia el token estando activa: refresca próximas", async () => {
    mockearCargas([]);
    const { rerender } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} materializacionSignal={0} />);
    await screen.findByLabelText("Próximas");
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} materializacionSignal={1} />);
    });

    expect(obtenerReservasProximas).toHaveBeenCalledTimes(2);
  });

  it("mismo token no dispara una recarga extra", async () => {
    mockearCargas([]);
    const { rerender } = render(<ReservasViewConJugadas mostrarToast={vi.fn()} materializacionSignal={1} />);
    await screen.findByLabelText("Próximas");
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1); // solo el mount

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} materializacionSignal={1} />);
    });

    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);
  });

  it("activo=false: un cambio de token no dispara ninguna recarga", async () => {
    mockearCargas([]);
    const { rerender } = render(
      <ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} materializacionSignal={0} />,
    );
    await screen.findByLabelText("Próximas");
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} materializacionSignal={1} />);
    });

    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);
  });

  it("false→true: un token de materialización viejo acumulado mientras estaba oculta no duplica el refresco de activación", async () => {
    mockearCargas([]);
    const { rerender } = render(
      <ReservasViewConJugadas mostrarToast={vi.fn()} activo={false} materializacionSignal={1} />,
    );
    await screen.findByLabelText("Próximas");
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} activo materializacionSignal={1} />);
    });

    // Un único refresco (el de activación), no dos.
    expect(obtenerReservasProximas).toHaveBeenCalledTimes(2);
  });
});

// C3 — toggle "Mostrar turnos fijos" + render de ocurrencias virtuales en
// Próximas. `turnosFijos` se pasa como objeto plano (no el hook real: esta
// vista solo lee `.turnosFijos`/`.excepciones`, no ejercita ninguna de las
// funciones de patch local ni obtenerOCrearToken acá).
describe("ReservasView — toggle de turnos fijos (C3)", () => {
  // Miércoles fijo, mismo criterio que turnosFijos.logic.test.ts.
  const AHORA_FIJO_MIE = new Date("2026-01-07T12:00:00-03:00");

  function crearTurnoFijoConHorario(overrides: Partial<TurnoFijoConHorario> = {}): TurnoFijoConHorario {
    return {
      id: "tf1",
      titular_id: "titular-1",
      dia_semana: 3,
      nombre: "Fijo Martin",
      telefono: "3773333333",
      horaInicio: "18:00",
      horaFin: "18:30",
      ...overrides,
    };
  }

  function crearExcepcion(overrides: Partial<ExcepcionTurnoFijoRow> = {}): ExcepcionTurnoFijoRow {
    return { id: "e1", turno_fijo_id: "tf1", fecha: "2026-01-07", creado: null, ...overrides };
  }

  it("toggle apagado por defecto: no muestra ninguna ocurrencia virtual aunque haya turnos fijos", async () => {
    vi.setSystemTime(AHORA_FIJO_MIE);
    mockearCargas([]);
    const turnosFijos = { ...TURNOS_FIJOS_VACIO, turnosFijos: [crearTurnoFijoConHorario()] };

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} turnosFijos={turnosFijos} />);
    const proximas = await screen.findByLabelText("Próximas");

    expect(within(proximas).queryByText("Turno fijo")).toBeNull();
    expect(await within(proximas).findByText("No hay reservas para mostrar.")).toBeTruthy();
  });

  it("activar el toggle agrega la ocurrencia con badge, fecha, horario, nombre y teléfono, sin acciones", async () => {
    vi.setSystemTime(AHORA_FIJO_MIE);
    const user = userEvent.setup();
    mockearCargas([]);
    const turnosFijos = { ...TURNOS_FIJOS_VACIO, turnosFijos: [crearTurnoFijoConHorario()] };

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} turnosFijos={turnosFijos} />);
    const proximas = await screen.findByLabelText("Próximas");

    await user.click(screen.getByRole("switch", { name: "Mostrar turnos fijos" }));

    // Horizonte de 90 días -> se repiten ~13 ocurrencias semanales, todas con
    // el mismo horario/nombre — se acota a la fila de la primera ocurrencia
    // (fecha única) para no toparse con "Found multiple elements".
    const fechaBadge = await within(proximas).findByText(formatearBadgeFecha("2026-01-07"));
    const fila = fechaBadge.closest('[data-testid="fila-reserva"]') as HTMLElement;
    expect(within(fila).getByText("Turno fijo")).toBeTruthy();
    expect(within(fila).getByText("18:00-18:30")).toBeTruthy();
    expect(within(fila).getByText(/Fijo Martin · 3773333333/)).toBeTruthy();

    // La fila en sí es el único control clickeable (selecciona, no ejecuta
    // ninguna acción) — el panel de detalle de una ocurrencia virtual no
    // ofrece Confirmar/Cancelar (ver DetalleReservaContenido).
    await user.click(fila);
    const detalle = panelDetalle();
    expect(within(detalle).queryByRole("button", { name: "Confirmar" })).toBeNull();
    expect(within(detalle).queryByRole("button", { name: "Cancelar" })).toBeNull();
  });

  it("una ocurrencia ya excepcionada no aparece aunque el toggle esté activo", async () => {
    vi.setSystemTime(AHORA_FIJO_MIE);
    const user = userEvent.setup();
    mockearCargas([]);
    const turnosFijos = {
      ...TURNOS_FIJOS_VACIO,
      turnosFijos: [crearTurnoFijoConHorario()],
      excepciones: [crearExcepcion()],
    };

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} turnosFijos={turnosFijos} />);
    await screen.findByLabelText("Próximas");
    await user.click(screen.getByRole("switch", { name: "Mostrar turnos fijos" }));

    // La próxima ocurrencia no exceptuada es el miércoles siguiente.
    await waitFor(() => expect(screen.getByText(formatearBadgeFecha("2026-01-14"))).toBeTruthy());
    expect(screen.queryByText(formatearBadgeFecha("2026-01-07"))).toBeNull();
  });

  it("el toggle solo aparece en el tab Próximas, no en Jugadas", async () => {
    vi.setSystemTime(AHORA_FIJO_MIE);
    const user = userEvent.setup();
    mockearCargas([]);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");
    expect(screen.getByRole("switch", { name: "Mostrar turnos fijos" })).toBeTruthy();

    await irATab(user, /Jugadas/);
    await screen.findByLabelText("Jugadas");
    expect(screen.queryByRole("switch", { name: "Mostrar turnos fijos" })).toBeNull();
  });
});

// R5 — useEsDesktop (jsdom sin matchMedia) cae al fallback por
// window.innerWidth; seteándolo ANTES de renderizar, ReservasView monta
// directamente en la rama mobile (sin panel de detalle persistente, sino un
// bottom sheet al seleccionar una fila) — mismo criterio que
// AgendaView.test.tsx.
describe("ReservasView — mobile (R5)", () => {
  function usarAnchoMobile() {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
  }

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1366 });
  });

  it("no hay panel de detalle persistente; seleccionar una fila abre un bottom sheet que se puede cerrar", async () => {
    usarAnchoMobile();
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "p1", nombre: "Reserva Movil", confirmada: true })]);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    expect(screen.queryByTestId("detalle-reserva")).toBeNull();

    await user.click(within(proximas).getByRole("button", { name: "Reserva Movil" }));

    const sheet = await screen.findByRole("dialog", { name: "Detalle de la reserva" });
    expect(within(sheet).getByText("Reserva Movil")).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Cancelar" })).toBeTruthy();

    await user.click(within(sheet).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Detalle de la reserva" })).toBeNull());
  });

  it("las acciones (Confirmar/Cancelar/WhatsApp) siguen funcionando desde el bottom sheet", async () => {
    usarAnchoMobile();
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "p1", nombre: "Reserva Movil", confirmada: false })]);
    vi.mocked(confirmarReserva).mockResolvedValue({ error: null } as never);

    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const proximas = await screen.findByLabelText("Próximas");
    await user.click(within(proximas).getByRole("button", { name: "Reserva Movil" }));

    const sheet = await screen.findByRole("dialog", { name: "Detalle de la reserva" });
    await user.click(within(sheet).getByRole("button", { name: "Confirmar" }));

    expect(confirmarReserva).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(within(sheet).getByText("Confirmado")).toBeTruthy());
  });
});
it.each([390, 1280])("P7.1 Reservas: teclado y Escape a %s px", async (width) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  try {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ confirmada: true })]);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    const opener = await screen.findByRole("button", { name: "Juan" });
    opener.focus();
    await user.keyboard("{Enter}");
    const detail = screen.getByRole(width < 1200 ? "dialog" : "region", { name: "Detalle de la reserva" });
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

it("muestra error persistente en próximas, sin anunciar lista vacía, y recupera con retry", async () => {
  const user = userEvent.setup();
  mockearCargas([]);
  vi.mocked(obtenerReservasProximas).mockResolvedValueOnce({ data: [], error: { message: "offline" } } as never);
  render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
  await screen.findByRole("alert");
  expect(screen.queryByText("No hay reservas para mostrar.")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByText("No hay reservas para mostrar.");
  expect(screen.queryByRole("alert")).toBeNull();
});

// FINAL-F4 — M6 (0 filas = error) y M8 (borrado con dinero/ventas rechazado por
// el servidor). La UI nunca muestra éxito ni parchea estado local sobre una
// reserva que ya no existe o que el servidor se negó a borrar.
describe("ReservasView — FINAL-F4", () => {
  it("confirmar una reserva que ya no existe (purgada): toast específico, NO pasa a Confirmado", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "p1", nombre: "Juan Pendiente" })]);
    vi.mocked(confirmarReserva).mockResolvedValue({ error: { message: "reserva_inexistente" } } as never);
    const mostrarToast = vi.fn();

    render(<ReservasViewConJugadas mostrarToast={mostrarToast} />);

    await irATab(user, /Pendientes/);
    const pendientes = await screen.findByLabelText("Pendientes");
    const detalle = await seleccionarFila(user, pendientes, "Juan Pendiente");
    await user.click(within(detalle).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(mostrarToast).toHaveBeenCalledWith(expect.stringMatching(/ya no existe.*No se confirmó/), "error");
    });
    expect(mostrarToast).not.toHaveBeenCalledWith(expect.anything(), "ok");
    expect(within(pendientes).getByRole("button", { name: "Juan Pendiente" })).toBeTruthy();
    expect(within(detalle).getByText("Pendiente")).toBeTruthy();
  });

  it.each([
    ["ventas asociadas", "reserva_con_ventas", "Esta reserva tiene ventas asociadas y no puede eliminarse para preservar la trazabilidad."],
    ["dinero cobrado", "reserva_con_pagos", "Esta reserva tiene dinero cobrado. Registrá el reintegro desde Pago antes de cancelarla (el historial se conserva)."],
  ])("cancelar una reserva con %s: el servidor la rechaza, toast claro y la reserva se conserva", async (_label, codigo, texto) => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "c1", nombre: "Ana Confirmada", confirmada: true })]);
    vi.mocked(cancelarReserva).mockResolvedValue({ error: { message: codigo, code: "RD001" } } as never);
    const mostrarToast = vi.fn();

    render(<ReservasViewConJugadas mostrarToast={mostrarToast} />);

    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByRole("button", { name: "Ana Confirmada" })).toBeTruthy());
    const detalle = await seleccionarFila(user, proximas, "Ana Confirmada");
    await user.click(within(detalle).getByRole("button", { name: "Cancelar" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith(texto, "error"));
    expect(within(proximas).getByRole("button", { name: "Ana Confirmada" })).toBeTruthy(); // sin patch local
  });

  it("cancelar una reserva que ya no existe: error, sin éxito ni patch local", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "c1", nombre: "Ana Confirmada", confirmada: true })]);
    vi.mocked(cancelarReserva).mockResolvedValue({ error: { message: "reserva_inexistente" } } as never);
    const mostrarToast = vi.fn();

    render(<ReservasViewConJugadas mostrarToast={mostrarToast} />);

    const proximas = await screen.findByLabelText("Próximas");
    await waitFor(() => expect(within(proximas).getByRole("button", { name: "Ana Confirmada" })).toBeTruthy());
    const detalle = await seleccionarFila(user, proximas, "Ana Confirmada");
    await user.click(within(detalle).getByRole("button", { name: "Cancelar" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("Esa reserva ya no existe. Recargá la lista.", "error"));
    expect(within(proximas).getByRole("button", { name: "Ana Confirmada" })).toBeTruthy();
  });

  it("pago sobre una reserva que ya no existe: mensaje en el modal, sin patch local ni 'Movimiento registrado'", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(obtenerReservasPorRango).mockResolvedValueOnce({
      data: [crearReserva({ id: "j1", nombre: "Pedro", fecha: "2020-01-01", confirmada: true, precio: 20000 })],
      error: null,
    } as never);
    vi.mocked(registrarMovimientoPago).mockResolvedValue({ data: null, error: { message: "reserva_inexistente" } } as never);
    const mostrarToast = vi.fn();

    render(<ReservasViewConJugadas mostrarToast={mostrarToast} />);
    const jugadas = await irAJugadas(user);
    await waitFor(() => expect(within(jugadas).getByText(/Pedro/)).toBeTruthy());
    const detalle = await seleccionarFila(user, jugadas, "Pedro");
    await user.click(within(detalle).getByRole("button", { name: "Cargar pago" }));
    const modal = screen.getByRole("dialog", { name: "Pago del turno" });
    await user.click(within(modal).getByRole("button", { name: "Registrar cobro" }));

    await within(modal).findByText(/el pago no se guardó/);
    expect(mostrarToast).not.toHaveBeenCalledWith("Movimiento registrado.", "ok");
    expect(within(jugadas).getByText(/Pago sin registrar/)).toBeTruthy();
  });

  it("el cliente ya no borra pendientes vencidas: no se muestran y no hay ninguna llamada de borrado", async () => {
    mockearCargas([crearReserva({ id: "v1", nombre: "Vencida Vieja", confirmada: false, creado: new Date(Date.now() - 60 * 60 * 1000).toISOString() })]);
    render(<ReservasViewConJugadas mostrarToast={vi.fn()} />);
    await screen.findByLabelText("Próximas");
    await waitFor(() => expect(obtenerReservasProximas).toHaveBeenCalled());
    expect(screen.queryByText(/Vencida Vieja/)).toBeNull();
    expect(cancelarReserva).not.toHaveBeenCalled();
  });
});

describe("ReservasView — enfoque pedido por la campana", () => {
  it("un pedido nuevo abre la pestaña indicada y limpia los filtros; el heredado del montaje no hace nada", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReserva({ id: "a", nombre: "Reserva A", confirmada: true })]);
    const utils = render(<ReservasViewConJugadas mostrarToast={vi.fn()} enfoque={{ token: 1, tab: "jugadas" }} />);
    await screen.findByLabelText("Próximas");
    // token 1 ya estaba al montar: sigue en la pestaña por defecto.
    expect(screen.getByRole("tab", { name: /Próximas/ }).getAttribute("aria-selected")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Hoy" }));
    expect(screen.getByRole("button", { name: "Hoy" }).getAttribute("aria-pressed")).toBe("true");

    utils.rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} enfoque={{ token: 2, tab: "pendientes" }} />);

    await waitFor(() => expect(screen.getByRole("tab", { name: /Pendientes/ }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByRole("button", { name: "Hoy" }).getAttribute("aria-pressed")).toBe("false");

    utils.rerender(<ReservasViewConJugadas mostrarToast={vi.fn()} enfoque={{ token: 3, tab: "jugadas" }} />);
    await waitFor(() => expect(screen.getByRole("tab", { name: /Jugadas/ }).getAttribute("aria-selected")).toBe("true"));
  });
});
