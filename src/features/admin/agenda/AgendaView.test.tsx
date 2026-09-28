/** @vitest-environment jsdom */
// Tests de B7 — AgendaView: grilla, navegación de semanas, sheet de detalle
// por celda (reserva/bloqueado/fijo/libre), cancelación/excepción, señal
// Realtime, polling/visibilitychange y guard anti-race. Reservas/turnos
// fijos/excepciones se mockean; la lógica de armado de celdas ya está
// cubierta en agenda.logic.test.ts — acá se testea la orquestación.

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "../../../types/database.types";
import { obtenerDatosPublicosCancha } from "../configuracion/configuracion.api";
import { registrarDevolucion } from "../devoluciones/devoluciones.api";
import type { ItemVentaCruda, VentaCruda } from "../historial/historial.types";
import { obtenerFranjaOperativa } from "../../reservations-public/reservations.api";
import { cancelarReserva, obtenerReservasPorRango } from "../reservas/reservas.api";
import { crearExcepcionTurnoFijo, obtenerExcepciones, obtenerTurnosFijos } from "../turnos-fijos/turnosFijos.api";
import { useTurnosFijos } from "../turnos-fijos/useTurnosFijos";
import { obtenerVentasPorReserva } from "../ventas/ventas.api";
import { AgendaView, type AgendaViewProps } from "./AgendaView";

vi.mock("../reservas/reservas.api", () => ({
  obtenerReservasPorRango: vi.fn(),
  cancelarReserva: vi.fn(),
}));

// CFG-F1.1 — nombre real de la cancha (AgendaDetalleSheet/AgendaView ->
// useNombreCancha), mismo criterio que el resto de este archivo.
vi.mock("../configuracion/configuracion.api", () => ({
  obtenerDatosPublicosCancha: vi.fn(),
}));

// CFG-F2 — rango real de la grilla (useFranjaSemana, una llamada por cada uno
// de los 7 días visibles), reemplaza el 08:00-01:00 hardcodeado de
// configCancha.
vi.mock("../../reservations-public/reservations.api", () => ({
  obtenerFranjaOperativa: vi.fn(),
}));

// P3 — productos/ventas asociados (AgendaDetalleSheet -> useVentasDeReserva):
// mock a nivel de transporte, mismo criterio que el resto de este archivo.
vi.mock("../ventas/ventas.api", () => ({
  obtenerVentasPorReserva: vi.fn(),
}));

// P4 — devolver un producto (mismo RPC/mock que HistorialView.test.tsx).
vi.mock("../devoluciones/devoluciones.api", () => ({
  registrarDevolucion: vi.fn(),
}));

// C2 — obtenerTurnosFijos/obtenerExcepciones/crearExcepcionTurnoFijo se
// mudaron de ./agenda.api a ../turnos-fijos/turnosFijos.api (dueño real del
// dominio); el mock apunta a la nueva ubicación, sin cambios de aserciones.
// C3 — se agrega upsertTokenTurnoFijo/obtenerTokenTurnoFijo (usadas por
// useTurnosFijos.obtenerOCrearToken) solo para que el módulo mockeado tenga
// todos los named exports que el hook real importa — ningún test de esta
// vista ejercita el link de baja (eso es TurnosFijosView.test.tsx).
vi.mock("../turnos-fijos/turnosFijos.api", () => ({
  obtenerTurnosFijos: vi.fn(),
  obtenerExcepciones: vi.fn(),
  crearExcepcionTurnoFijo: vi.fn(),
  upsertTokenTurnoFijo: vi.fn(),
  obtenerTokenTurnoFijo: vi.fn(),
}));

// C3 — AgendaView ya no crea su propia instancia de useTurnosFijos (ahora la
// recibe por props, compartida desde AdminShell). Este harness reproduce ese
// cableado para los tests: instancia el hook real (que sí pega contra el
// turnosFijos.api mockeado arriba) y se lo pasa a AgendaView, igual que hace
// AdminShell en producción — así el resto de las aserciones de este archivo
// (que dependen de esos mocks) no necesita cambiar.
function AgendaViewConectada(props: Omit<AgendaViewProps, "turnosFijos">) {
  const turnosFijos = useTurnosFijos();
  return <AgendaView {...props} turnosFijos={turnosFijos} />;
}

// Miércoles fijo dentro de la semana 2026-06-01 (lunes) a 2026-06-07 (domingo).
const AHORA_FIJO = new Date("2026-06-03T12:00:00");

beforeEach(() => {
  vi.setSystemTime(AHORA_FIJO);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
  // R3 — useEsDesktop cae al fallback por innerWidth en jsdom (sin
  // matchMedia); se resetea al ancho desktop de jsdom (1024) para no filtrar
  // el criterio "mobile" de un test al siguiente.
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
});

function crearReservaRow(overrides: Partial<Tables<"reservas">> = {}): Tables<"reservas"> {
  return {
    id: "r1",
    fecha: "2026-06-01",
    hora_inicio: "10:00:00",
    hora_fin: "10:30:00",
    nombre: "Juan Reserva",
    telefono: "3771111111",
    precio: 20000,
    creado: new Date().toISOString(),
    bloqueado: false,
    confirmada: true,
    pago_efectivo: 0,
    pago_transferencia: 0,
    turno_fijo_id: null,
    telefono_normalizado: null,
    hora_apertura_vigente: null,
    ...overrides,
  };
}

// TF-R2 — nombre/telefono ya no viven en la fila de turnos_fijos: el mock
// reproduce el shape real del embed `select("*, titulares_turno_fijo(nombre,
// telefono)")` que usa obtenerTurnosFijos(), no la fila cruda de la tabla.
type TurnoFijoRowMock = Tables<"turnos_fijos"> & { titulares_turno_fijo: { nombre: string; telefono: string } | null };

function crearTurnoFijoRow(overrides: Partial<TurnoFijoRowMock> = {}): TurnoFijoRowMock {
  return {
    id: "t1",
    titular_id: "tit1",
    dia_semana: 1, // lunes -> 2026-06-01 en la semana de prueba
    hora_inicio: "18:00:00",
    hora_fin: "18:30:00",
    // FINAL-F3 (M5): modela un turno fijo YA existente antes de la semana bajo
    // prueba. `new Date()` sería "creado justo ahora" (reloj simulado 03/06) y,
    // por instante_inicio_real >= creado, ocultaría su lunes 01/06.
    creado: "2025-01-01T00:00:00.000Z",
    titulares_turno_fijo: { nombre: "Fijo Martin", telefono: "3773333333" },
    ...overrides,
  };
}

function mockearCargas(
  reservas: Tables<"reservas">[],
  turnosFijos: Tables<"turnos_fijos">[] = [],
  excepciones: Tables<"excepciones_turno_fijo">[] = [],
) {
  vi.mocked(obtenerReservasPorRango).mockResolvedValue({ data: reservas, error: null } as never);
  vi.mocked(obtenerTurnosFijos).mockResolvedValue({ data: turnosFijos, error: null } as never);
  vi.mocked(obtenerExcepciones).mockResolvedValue({ data: excepciones, error: null } as never);
  vi.mocked(cancelarReserva).mockResolvedValue({ error: null } as never);
  vi.mocked(crearExcepcionTurnoFijo).mockResolvedValue({ error: null } as never);
  // P3 — default defensivo: los tests que no ejercitan productos/ventas
  // (la mayoría de este archivo) igual abren el sheet de una reserva real,
  // que dispara useVentasDeReserva — sin este default resolverían contra el
  // cliente real de Supabase.
  vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [], error: null } as never);
  // CFG-F1.1 — default defensivo: cualquier sheet de detalle abierto dispara
  // useNombreCancha; sin esto resolvería contra el cliente real de Supabase.
  vi.mocked(obtenerDatosPublicosCancha).mockResolvedValue({
    data: { nombre_cancha: "Los amigos padel" },
    error: null,
  } as never);
  // Mismo horario 08:00-01:00 que antes tenía configCancha hardcodeado,
  // igual todos los días — preserva el rango que ya esperan los tests de
  // este archivo (celdas/bloques calculados sobre esa misma grilla).
  vi.mocked(obtenerFranjaOperativa).mockResolvedValue({
    data: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "01:00:00" }],
    error: null,
  } as never);
}

function stubVisibilidad(estado: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: estado });
}

function crearDiferido<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("AgendaView — render inicial y navegación", () => {
  it("renderiza los días de la semana y las horas de la grilla", async () => {
    mockearCargas([]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    await screen.findByText("08:00");
    expect(screen.getByText("Lun")).toBeTruthy();
    expect(screen.getByText("Dom")).toBeTruthy();
    expect(screen.getByText("1 - 7 Jun")).toBeTruthy();
  });

  it("semana siguiente pide una nueva query; volver a la semana original usa caché (sin nueva query)", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("08:00");
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);
    expect(obtenerReservasPorRango).toHaveBeenCalledWith("2026-06-01", "2026-06-07");

    await user.click(screen.getByRole("button", { name: "Semana siguiente" }));
    await screen.findByText(/8 - 14 Jun/);
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2);
    expect(obtenerReservasPorRango).toHaveBeenCalledWith("2026-06-08", "2026-06-14");

    await user.click(screen.getByRole("button", { name: "Semana anterior" }));
    await screen.findByText("1 - 7 Jun"); // acá sí exacto: sin "· volver a hoy" al lado (offset 0)
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2); // sin llamada nueva, hit de caché
  });

  it("'volver a hoy' solo aparece con semanaOffset != 0 y resetea a la semana actual", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("08:00");
    expect(screen.queryByText("volver a hoy")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Semana siguiente" }));
    expect(await screen.findByText("volver a hoy")).toBeTruthy();

    await user.click(screen.getByText("volver a hoy"));
    await screen.findByText("1 - 7 Jun");
    expect(screen.queryByText("volver a hoy")).toBeNull();
  });
});

describe("AgendaView — interacción por celda", () => {
  it("celda libre: click en el fondo de un día no abre ningún sheet", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("08:00");

    // Sin reservas/turnos fijos, la columna del día entero es "libre": no
    // hay ningún bloque (botón) dentro, solo el fondo de la columna.
    await user.click(screen.getByTestId("agenda-dia-2026-06-01"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("celda reserva: abre el drawer con los datos correctos (incl. pago pendiente); Cancelar turno pide confirmación y llama cancelarReserva", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ confirmada: true })]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    // Pago sin registrar por default (pago_efectivo/pago_transferencia en 0)
    // -> el título del bloque suma la nota de "Pago pendiente" (indicador
    // discreto también como tooltip nativo).
    const celda = await screen.findByTitle("Juan Reserva · 3771111111 · 10:00-10:30 · Pago pendiente");
    await user.click(celda);

    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    expect(within(sheet).getByText("Juan Reserva")).toBeTruthy();
    expect(within(sheet).getByText("3771111111")).toBeTruthy();
    // P3 — "$20.000" ahora se repite en "Precio del turno"/Resumen: se
    // escopa a la fila puntual en vez de un getByText ambiguo.
    expect(within(sheet).getByText("Precio del turno").parentElement?.textContent).toContain("$20.000");
    expect(within(sheet).getByText("Confirmado")).toBeTruthy();
    expect(within(sheet).getByText("Pago sin registrar")).toBeTruthy();

    await user.click(within(sheet).getByRole("button", { name: "Cancelar turno" }));
    const primeraConfirmacion = screen.getByRole("dialog", { name: "¿Cancelar este turno?" });
    await user.click(within(primeraConfirmacion).getByRole("button", { name: "Volver" }));
    expect(screen.queryByRole("dialog", { name: "¿Cancelar este turno?" })).toBeNull();
    expect(cancelarReserva).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Turno reservado" })).toBeTruthy();

    await user.click(within(sheet).getByRole("button", { name: "Cancelar turno" }));
    const dialogs = screen.getAllByRole("dialog");
    const confirmDialog = dialogs[dialogs.length - 1];
    expect(within(confirmDialog).getByText("¿Cancelar este turno?")).toBeTruthy();

    // Teléfono real y válido -> el modal ofrece las dos variantes (P1); esta
    // rama es "sin avisar" (ver más abajo el caso "y avisar" con WhatsApp).
    await user.click(within(confirmDialog).getByRole("button", { name: "Cancelar sin avisar" }));

    expect(cancelarReserva).toHaveBeenCalledWith("r1");
    // El drawer anima su salida (Motion) — se espera a que termine de
    // desmontarse en vez de asumir que desaparece en el mismo tick.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByTitle(/Juan Reserva/)).toBeNull();
  });

  it("botón WhatsApp del detalle usa el teléfono real, abre wa.me y nunca se dispara solo (es un <a href>)", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow()]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    const boton = within(sheet).getByRole("link", { name: /WhatsApp/ });
    expect(boton.getAttribute("href")).toContain("https://wa.me/5493771111111?text=");
    expect(boton.getAttribute("target")).toBe("_blank");
  });

  it("teléfono inválido/faltante: ni el botón WhatsApp ni la opción 'Cancelar y avisar' aparecen", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ telefono: "" })]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    expect(within(sheet).queryByRole("link", { name: /WhatsApp/ })).toBeNull();

    await user.click(within(sheet).getByRole("button", { name: "Cancelar turno" }));
    const dialogs = screen.getAllByRole("dialog");
    const confirmDialog = dialogs[dialogs.length - 1];
    // Sin teléfono usable, el modal vuelve al único botón de siempre (sin
    // ofrecer "avisar" — no tiene sentido abrir un wa.me roto).
    expect(within(confirmDialog).queryByRole("button", { name: "Cancelar y avisar" })).toBeNull();
    expect(within(confirmDialog).getByRole("button", { name: "Cancelar turno" })).toBeTruthy();
  });

  it("'Cancelar y avisar': solo abre WhatsApp si la cancelación en el backend fue exitosa", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow()]);
    const abrirVentana = vi.spyOn(window, "open").mockReturnValue(null);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    await user.click(screen.getByRole("button", { name: "Cancelar turno" }));
    const dialogs = screen.getAllByRole("dialog");
    await user.click(within(dialogs[dialogs.length - 1]).getByRole("button", { name: "Cancelar y avisar" }));

    expect(cancelarReserva).toHaveBeenCalledWith("r1");
    await waitFor(() => expect(abrirVentana).toHaveBeenCalledTimes(1));
    const [link, target, rel] = abrirVentana.mock.calls[0];
    expect(link).toContain("https://wa.me/5493771111111?text=");
    expect(decodeURIComponent(String(link))).toContain("cancelado");
    expect(target).toBe("_blank");
    expect(rel).toBe("noopener,noreferrer");
    abrirVentana.mockRestore();
  });

  it("'Cancelar y avisar': si falla la cancelación NO abre WhatsApp", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow()]);
    vi.mocked(cancelarReserva).mockResolvedValue({ error: { message: "fallo" } } as never);
    const abrirVentana = vi.spyOn(window, "open").mockReturnValue(null);
    const mostrarToast = vi.fn();
    render(<AgendaViewConectada mostrarToast={mostrarToast} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    await user.click(screen.getByRole("button", { name: "Cancelar turno" }));
    const dialogs = screen.getAllByRole("dialog");
    await user.click(within(dialogs[dialogs.length - 1]).getByRole("button", { name: "Cancelar y avisar" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("No se pudo cancelar. Probá de nuevo.", "error"));
    expect(abrirVentana).not.toHaveBeenCalled();
    abrirVentana.mockRestore();
  });

  it("reserva con pago ya registrado: sin indicador de pago pendiente", async () => {
    mockearCargas([crearReservaRow({ pago_efectivo: 20000 })]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    expect(await screen.findByTitle("Juan Reserva · 3771111111 · 10:00-10:30")).toBeTruthy();
    expect(screen.queryByTitle(/Pago pendiente/)).toBeNull();
  });

  it("celda bloqueado: sheet sin datos de jugador, botón Desbloquear", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ bloqueado: true, confirmada: false })]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle("Bloqueado (10:00-10:30)");
    await user.click(celda);

    const sheet = screen.getByRole("dialog", { name: "Horario bloqueado" });
    expect(within(sheet).queryByText("Jugador")).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Desbloquear" })).toBeTruthy();
  });

  it("celda fijo: sheet correcto; Cancelar este día pide confirmación y llama crearExcepcionTurnoFijo", async () => {
    const user = userEvent.setup();
    mockearCargas([], [crearTurnoFijoRow()]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle("Turno fijo: Fijo Martin · 3773333333 · 18:00-18:30");
    await user.click(celda);

    const sheet = screen.getByRole("dialog", { name: "Turno fijo" });
    expect(within(sheet).getByText("Lunes")).toBeTruthy();
    expect(within(sheet).getByText("Fijo Martin")).toBeTruthy();

    await user.click(within(sheet).getByRole("button", { name: "Cancelar este día" }));
    const dialogs = screen.getAllByRole("dialog");
    const confirmDialog = dialogs[dialogs.length - 1];
    expect(
      within(confirmDialog).getByText("¿Cancelar el turno fijo solo para el 2026-06-01? El horario queda libre ese día."),
    ).toBeTruthy();

    await user.click(within(confirmDialog).getByRole("button", { name: "Cancelar este día" }));

    expect(crearExcepcionTurnoFijo).toHaveBeenCalledWith("t1", "2026-06-01");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByTitle(/Fijo Martin/)).toBeNull();
  });

  // FINAL-F3 (M5) — BUG DE AGENDA: al crear un turno fijo NO se proyectan sus
  // ocurrencias hacia atrás. Reloj simulado: miércoles 03/06 12:00; el fijo es de
  // lunes y se creó "ahora" -> el lunes 01/06 (esta semana) no existía; el
  // primero real es el lunes 08/06.
  it("M5: un turno fijo creado ahora no aparece en fechas anteriores a su creación, y sí desde la primera ocurrencia posterior", async () => {
    const user = userEvent.setup();
    mockearCargas([], [crearTurnoFijoRow({ creado: new Date(2026, 5, 3, 12, 0).toISOString() })]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    // Semana siguiente: el lunes 08/06 SÍ (además confirma que los datos ya cargaron).
    await user.click(await screen.findByRole("button", { name: "Semana siguiente" }));
    expect(await screen.findByTitle("Turno fijo: Fijo Martin · 3773333333 · 18:00-18:30")).toBeTruthy();

    // Semana actual: el lunes 01/06 es ANTERIOR a la creación -> no se proyecta.
    await user.click(screen.getByRole("button", { name: "Semana anterior" }));
    expect(screen.queryByTitle(/Fijo Martin/)).toBeNull();
  });

  it.each([
    ["ventas asociadas", "reserva_con_ventas", "Esta reserva tiene ventas asociadas y no puede eliminarse para preservar la trazabilidad."],
    ["dinero cobrado", "reserva_con_pagos", "Esta reserva tiene dinero cobrado. Registrá el reintegro desde Pago antes de cancelarla (el historial se conserva)."],
  ])("FINAL-F4: 'Cancelar y avisar' con %s: el servidor rechaza el borrado, toast claro, NO abre WhatsApp y la reserva se conserva", async (_l, codigo, texto) => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow()]);
    vi.mocked(cancelarReserva).mockResolvedValue({ error: { message: codigo, code: "RD001" } } as never);
    const abrirVentana = vi.spyOn(window, "open").mockReturnValue(null);
    const mostrarToast = vi.fn();
    render(<AgendaViewConectada mostrarToast={mostrarToast} />);

    await user.click(await screen.findByTitle(/Juan Reserva/));
    await user.click(screen.getByRole("button", { name: "Cancelar turno" }));
    const dialogs = screen.getAllByRole("dialog");
    await user.click(within(dialogs[dialogs.length - 1]).getByRole("button", { name: "Cancelar y avisar" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith(texto, "error"));
    expect(abrirVentana).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTitle(/Juan Reserva/)).toBeTruthy();
    abrirVentana.mockRestore();
  });

  it("FINAL-F4: cancelar una reserva que ya no existe: error, no abre WhatsApp ni parchea por éxito", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow()]);
    vi.mocked(cancelarReserva).mockResolvedValue({ error: { message: "reserva_inexistente" } } as never);
    const abrirVentana = vi.spyOn(window, "open").mockReturnValue(null);
    const mostrarToast = vi.fn();
    render(<AgendaViewConectada mostrarToast={mostrarToast} />);

    await user.click(await screen.findByTitle(/Juan Reserva/));
    await user.click(screen.getByRole("button", { name: "Cancelar turno" }));
    const dialogs = screen.getAllByRole("dialog");
    await user.click(within(dialogs[dialogs.length - 1]).getByRole("button", { name: "Cancelar y avisar" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("Esa reserva ya no existe. Recargá la lista.", "error"));
    expect(abrirVentana).not.toHaveBeenCalled();
    abrirVentana.mockRestore();
  });

  it("error al cancelar: muestra toast y el sheet se cierra igual (paridad con ReservasView)", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow()]);
    vi.mocked(cancelarReserva).mockResolvedValue({ error: { message: "fallo" } } as never);
    const mostrarToast = vi.fn();
    render(<AgendaViewConectada mostrarToast={mostrarToast} />);

    const celda = await screen.findByTitle("Juan Reserva · 3771111111 · 10:00-10:30 · Pago pendiente");
    await user.click(celda);
    await user.click(screen.getByRole("button", { name: "Cancelar turno" }));
    const dialogs = screen.getAllByRole("dialog");
    await user.click(within(dialogs[dialogs.length - 1]).getByRole("button", { name: "Cancelar sin avisar" }));

    expect(mostrarToast).toHaveBeenCalledWith("No se pudo cancelar. Probá de nuevo.", "error");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Con error, la reserva se conserva (sin patch local).
    expect(screen.getByTitle("Juan Reserva · 3771111111 · 10:00-10:30 · Pago pendiente")).toBeTruthy();
  });
});

// P3 — productos/ventas asociados en el detalle de Agenda. `crearItemCrudoP3`/
// `crearVentaCrudaP3` reproducen el shape crudo real de SELECT_VENTA_CON_DETALLE
// (historial.api.ts) — mismo criterio que historial.logic.test.ts/
// useVentasDeReserva.test.ts, cada archivo arma su propia fixture local.
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
    fecha: "2026-06-01",
    pago_efectivo: 8000,
    pago_transferencia: 0,
    total: 8000,
    creado: new Date().toISOString(),
    reservas: null,
    venta_items: [crearItemCrudoP3()],
    ...overrides,
  };
}

describe("AgendaView — P3 productos/ventas asociados", () => {
  it("sin ventas: la sección Productos muestra 'Sin productos asociados.'", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true })]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });

    expect(await within(sheet).findByText("Sin productos asociados.")).toBeTruthy();
  });

  it("una venta con un producto: aparece en Productos y suma en el Resumen (Productos netos/Total asociado)", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [crearVentaCrudaP3()], error: null } as never);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });

    expect(await within(sheet).findByText(/Pelotas × 2/)).toBeTruthy();
    expect(within(sheet).getByText("Productos netos").parentElement?.textContent).toContain("$8.000");
    expect(within(sheet).getByText("Total asociado").parentElement?.textContent).toContain("$28.000");
  });

  it("varias ventas asociadas a la misma reserva: se listan los productos de todas y se suman", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true, precio: 20000 })]);
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
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });

    expect(await within(sheet).findByText(/Pelotas × 2/)).toBeTruthy();
    expect(within(sheet).getByText(/Grips × 1/)).toBeTruthy();
    expect(within(sheet).getByText("Productos netos").parentElement?.textContent).toContain("$11.000");
  });

  it("devolución parcial: muestra la trazabilidad ('Devueltos X de Y') y el neto en Productos/Resumen", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true, precio: 20000 })]);
    // 2 unidades a $4.000, se devuelve 1 -> neto $4.000.
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({
      data: [
        crearVentaCrudaP3({
          venta_items: [crearItemCrudoP3({ devoluciones: [{ cantidad: 1, medio_reembolso: "efectivo" }] })],
        }),
      ],
      error: null,
    } as never);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });

    expect(await within(sheet).findByText("Devueltos 1 de 2")).toBeTruthy();
    expect(within(sheet).getByText("Productos netos").parentElement?.textContent).toContain("$4.000");
  });

  it("devolución total: el ítem sigue visible ('Totalmente devuelto'), pero no suma al Resumen", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({
      data: [
        crearVentaCrudaP3({
          venta_items: [crearItemCrudoP3({ devoluciones: [{ cantidad: 2, medio_reembolso: "efectivo" }] })],
        }),
      ],
      error: null,
    } as never);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });

    expect(await within(sheet).findByText("Totalmente devuelto (2)")).toBeTruthy();
    expect(within(sheet).getByText("Productos netos").parentElement?.textContent).toContain("$0");
  });

  it.each([
    { nombre: "SinPagar", pagoEfectivo: 0, esperado: "Pago pendiente" },
    { nombre: "PagoParcial", pagoEfectivo: 10000, esperado: "Pago parcial" },
    { nombre: "PagoCompleto", pagoEfectivo: 20000, esperado: "Pago completo" },
  ])("estado de pago del turno ($esperado)", async ({ nombre, pagoEfectivo, esperado }) => {
    const user = userEvent.setup();
    mockearCargas([
      crearReservaRow({ id: "r1", nombre, confirmada: true, precio: 20000, pago_efectivo: pagoEfectivo, pago_transferencia: 0 }),
    ]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    await user.click(await screen.findByTitle(new RegExp(nombre)));
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });

    expect(within(sheet).getByText(esperado)).toBeTruthy();
  });

  it("saldo pendiente NUNCA incluye productos: turno sin pagar + producto ya cobrado -> el saldo es solo el del turno", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true, precio: 20000, pago_efectivo: 0, pago_transferencia: 0 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [crearVentaCrudaP3()], error: null } as never);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    await within(sheet).findByText(/Pelotas × 2/);

    // Total asociado SÍ suma turno + productos ($28.000), pero el saldo
    // pendiente sigue siendo solo el del turno ($20.000) — el producto ya
    // está cobrado, no es deuda.
    expect(within(sheet).getByText("Total asociado").parentElement?.textContent).toContain("$28.000");
    expect(within(sheet).getByText("Saldo pendiente").parentElement?.textContent).toContain("$20.000");
  });

  it("error al cargar productos: mensaje + botón Reintentar; Reintentar dispara una nueva carga", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true })]);
    vi.mocked(obtenerVentasPorReserva)
      .mockResolvedValueOnce({ data: null, error: { message: "fallo" } } as never)
      .mockResolvedValueOnce({ data: [crearVentaCrudaP3()], error: null } as never);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    expect(await within(sheet).findByText("No se pudieron cargar los productos.")).toBeTruthy();

    await user.click(within(sheet).getByRole("button", { name: "Reintentar" }));

    expect(await within(sheet).findByText(/Pelotas × 2/)).toBeTruthy();
    expect(within(sheet).queryByText("No se pudieron cargar los productos.")).toBeNull();
  });
});

// P4 — devolver un producto desde el detalle de Agenda. Mismo RPC/modal que
// ya usa HistorialView.test.tsx (registrar_devolucion, DevolucionModal) —
// acá se confirma el cableado (patch local vía itemsConVentaId +
// patchearDevolucion), no se re-derivan los casos de negocio ya cubiertos ahí.
describe("AgendaView — P4 devolver productos desde el detalle", () => {
  it("devolución parcial: patchea cantidad/neto y el Resumen sin refetch", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [crearVentaCrudaP3()], error: null } as never);
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-1", error: null } as never);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    await within(sheet).findByText(/Pelotas × 2/);

    await user.click(within(sheet).getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledWith("i1", 1, null, "efectivo", expect.any(String)));
    expect(screen.queryByRole("dialog", { name: "Devolver · Pelotas" })).toBeNull();
    expect(within(sheet).getByText("Devueltos 1 de 2")).toBeTruthy();
    expect(within(sheet).getByText("Productos netos").parentElement?.textContent).toContain("$4.000");
    expect(within(sheet).getByText("Total asociado").parentElement?.textContent).toContain("$24.000");
    // Sin refetch: la carga inicial fue la única llamada, el cambio se ve por
    // patch local puro (patchearDevolucion, mismo criterio que Historial).
    expect(obtenerVentasPorReserva).toHaveBeenCalledTimes(1);
  });

  it("devolución total: cantidad vigente llega a 0, ya no queda botón Devolver para ese ítem", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [crearVentaCrudaP3()], error: null } as never);
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-1", error: null } as never);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    await within(sheet).findByText(/Pelotas × 2/);

    await user.click(within(sheet).getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "2");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledWith("i1", 2, null, "efectivo", expect.any(String)));
    expect(within(sheet).getByText("Totalmente devuelto (2)")).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Devolver" })).toBeNull();
    expect(within(sheet).getByText("Productos netos").parentElement?.textContent).toContain("$0");
    expect(within(sheet).getByText("Total asociado").parentElement?.textContent).toContain("$20.000");
  });

  it("devolución previa + nueva: el disponible ya refleja lo devuelto antes, y se acumula (no se reemplaza)", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({
      data: [crearVentaCrudaP3({ venta_items: [crearItemCrudoP3({ devoluciones: [{ cantidad: 1, medio_reembolso: "efectivo" }] })] })],
      error: null,
    } as never);
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: "dev-2", error: null } as never);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    await within(sheet).findByText("Devueltos 1 de 2");

    await user.click(within(sheet).getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    // El máximo ya descuenta la devolución previa (1 de 2 ya devuelto).
    expect(within(modal).getByText("Cantidad disponible para devolver: 1")).toBeTruthy();
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledWith("i1", 1, null, "efectivo", expect.any(String)));
    // Acumulado: 1 (previa) + 1 (nueva) = 2 de 2 -> totalmente devuelto.
    expect(within(sheet).getByText("Totalmente devuelto (2)")).toBeTruthy();
  });

  it("varias ventas asociadas: devolver un producto de una no afecta los ítems de la otra", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true, precio: 20000 })]);
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
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    await within(sheet).findByText(/Pelotas × 2/);
    expect(within(sheet).getByText("Productos netos").parentElement?.textContent).toContain("$11.000");

    // Devuelve 1 unidad de Pelotas (venta v1) — Grips (venta v2) no se toca.
    const botonesDevolver = within(sheet).getAllByRole("button", { name: "Devolver" });
    await user.click(botonesDevolver[0]);
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(registrarDevolucion).toHaveBeenCalledWith("i1", 1, null, "efectivo", expect.any(String)));
    expect(within(sheet).getByText("Devueltos 1 de 2")).toBeTruthy();
    expect(within(sheet).getByText(/Grips × 1/)).toBeTruthy();
    expect(within(sheet).queryByText(/Devueltos.*Grips/)).toBeNull();
    // Neto: Pelotas pasa de $8.000 a $4.000, Grips sigue en $3.000 -> $7.000.
    expect(within(sheet).getByText("Productos netos").parentElement?.textContent).toContain("$7.000");
  });

  it("error del RPC: no patchea la UI (deja cantidades/netos intactos) y muestra el toast de error", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ id: "r1", confirmada: true, precio: 20000 })]);
    vi.mocked(obtenerVentasPorReserva).mockResolvedValue({ data: [crearVentaCrudaP3()], error: null } as never);
    vi.mocked(registrarDevolucion).mockResolvedValue({ data: null, error: { message: "network" } } as never);
    const mostrarToast = vi.fn();
    render(<AgendaViewConectada mostrarToast={mostrarToast} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    await within(sheet).findByText(/Pelotas × 2/);

    await user.click(within(sheet).getByRole("button", { name: "Devolver" }));
    const modal = screen.getByRole("dialog", { name: "Devolver · Pelotas" });
    await user.clear(within(modal).getByLabelText("Cantidad"));
    await user.type(within(modal).getByLabelText("Cantidad"), "1");
    await user.click(within(modal).getByRole("button", { name: "Devolver" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("No se pudo registrar la devolución. Probá de nuevo.", "error"));
    // El modal NO se cierra solo (mismo criterio que HistorialView: un error
    // genérico deja todo tipeado, sin perder el formulario).
    expect(screen.getByRole("dialog", { name: "Devolver · Pelotas" })).toBeTruthy();
    // Sin patch: la cantidad/neto siguen intactos.
    expect(within(sheet).queryByText(/Devueltos/)).toBeNull();
    expect(within(sheet).getByText("Productos netos").parentElement?.textContent).toContain("$8.000");
  });
});

describe("AgendaView — refresco en vivo (B7)", () => {
  it("polling: refresca la semana visible cada 5 minutos", async () => {
    mockearCargas([]);
    vi.useFakeTimers();
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2);
  });

  it("visibilitychange a 'visible' fuerza un refresco (incluso si esa semana ya está en caché)", async () => {
    mockearCargas([]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("08:00");
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    stubVisibilidad("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2);
  });

  it("nuevaReservaSignal con fecha dentro de la semana visible fuerza una recarga", async () => {
    mockearCargas([]);
    const { rerender } = render(<AgendaViewConectada mostrarToast={vi.fn()} nuevaReservaSignal={null} />);
    await screen.findByText("08:00");
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<AgendaViewConectada mostrarToast={vi.fn()} nuevaReservaSignal={{ fecha: "2026-06-03", token: 1 }} />);
    });

    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2);
  });

  it("nuevaReservaSignal con fecha fuera de la semana visible no hace nada", async () => {
    mockearCargas([]);
    const { rerender } = render(<AgendaViewConectada mostrarToast={vi.fn()} nuevaReservaSignal={null} />);
    await screen.findByText("08:00");

    await act(async () => {
      rerender(<AgendaViewConectada mostrarToast={vi.fn()} nuevaReservaSignal={{ fecha: "2020-01-01", token: 1 }} />);
    });

    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);
  });

  it("activo=false: no arma polling ni escucha visibilitychange", async () => {
    mockearCargas([]);
    vi.useFakeTimers();
    render(<AgendaViewConectada mostrarToast={vi.fn()} activo={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1); // solo la carga inicial

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1); // sin refresco por polling

    stubVisibilidad("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1); // sin refresco por visibilitychange
  });

  it("activo=false: nuevaReservaSignal no dispara ninguna recarga", async () => {
    mockearCargas([]);
    const { rerender } = render(<AgendaViewConectada mostrarToast={vi.fn()} activo={false} nuevaReservaSignal={null} />);
    await screen.findByText("08:00");
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(
        <AgendaViewConectada mostrarToast={vi.fn()} activo={false} nuevaReservaSignal={{ fecha: "2026-06-03", token: 1 }} />,
      );
    });

    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);
  });

  it("false→true: dispara un refresco silencioso inmediato (sin mostrar el spinner de carga)", async () => {
    mockearCargas([]);
    const { rerender } = render(<AgendaViewConectada mostrarToast={vi.fn()} activo={false} />);
    await screen.findByText("08:00");
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<AgendaViewConectada mostrarToast={vi.fn()} activo />);
    });

    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Cargando agenda...")).toBeNull();
  });

  // C3 — con la instancia compartida de useTurnosFijos (ver AgendaViewConectada
  // arriba), Agenda ya NO recarga turnos fijos/excepciones al reactivarse: el
  // patch local que aplica TurnosFijosView sobre esa misma instancia es la
  // fuente actual. El test que exigía ese recargar (C2) se elimina — sin
  // reemplazo, no hay nada nuevo que verificar acá (la ausencia de la llamada
  // ya queda cubierta por el mock global de obtenerTurnosFijos/obtenerExcepciones
  // no creciendo entre renders en el resto de los tests de este describe).

  it("false→true: una señal vieja acumulada mientras estaba oculta no duplica el refresco de activación", async () => {
    mockearCargas([]);
    // Señal ya presente desde antes de reactivarse, con fecha dentro de la
    // semana visible (dispararía una recarga extra si no se la considerara
    // "vista" al activar).
    const { rerender } = render(
      <AgendaViewConectada mostrarToast={vi.fn()} activo={false} nuevaReservaSignal={{ fecha: "2026-06-03", token: 5 }} />,
    );
    await screen.findByText("08:00");
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<AgendaViewConectada mostrarToast={vi.fn()} activo nuevaReservaSignal={{ fecha: "2026-06-03", token: 5 }} />);
    });

    // Un único refresco (el de activación), no dos.
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2);
  });

  it("sheet de detalle se cierra al desactivar la vista si no hay ninguna mutación en curso", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow()]);
    const { rerender } = render(<AgendaViewConectada mostrarToast={vi.fn()} activo />);

    const celda = await screen.findByTitle("Juan Reserva · 3771111111 · 10:00-10:30 · Pago pendiente");
    await user.click(celda);
    expect(screen.getByRole("dialog", { name: "Turno reservado" })).toBeTruthy();

    await act(async () => {
      rerender(<AgendaViewConectada mostrarToast={vi.fn()} activo={false} />);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("sheet de detalle NO se cierra al desactivar mientras hay una cancelación en curso", async () => {
    const user = userEvent.setup();
    mockearCargas([crearReservaRow()]);
    const diferido = crearDiferido<{ error: null }>();
    vi.mocked(cancelarReserva).mockReturnValueOnce(diferido.promise as never);
    const { rerender } = render(<AgendaViewConectada mostrarToast={vi.fn()} activo />);

    const celda = await screen.findByTitle("Juan Reserva · 3771111111 · 10:00-10:30 · Pago pendiente");
    await user.click(celda);
    await user.click(screen.getByRole("button", { name: "Cancelar turno" }));
    const dialogs = screen.getAllByRole("dialog");
    await user.click(within(dialogs[dialogs.length - 1]).getByRole("button", { name: "Cancelar sin avisar" }));
    // La cancelación quedó en vuelo (diferido sin resolver) -> procesandoAccion=true.

    await act(async () => {
      rerender(<AgendaViewConectada mostrarToast={vi.fn()} activo={false} />);
    });
    expect(screen.getByRole("dialog", { name: "Turno reservado" })).toBeTruthy();

    await act(async () => {
      diferido.resolve({ error: null });
    });
    // Al resolver, el propio flujo de confirmarCancelarReserva cierra el sheet.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("guard de secuencia: una carga vieja de la MISMA semana que resuelve tarde no pisa una más nueva", async () => {
    mockearCargas([crearReservaRow({ id: "inicial", nombre: "Reserva Inicial" })]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);
    await screen.findByTitle(/Reserva Inicial/);

    const diferidoA = crearDiferido<{ data: Tables<"reservas">[]; error: null }>();
    const diferidoB = crearDiferido<{ data: Tables<"reservas">[]; error: null }>();
    vi.mocked(obtenerReservasPorRango)
      .mockReturnValueOnce(diferidoA.promise as never)
      .mockReturnValueOnce(diferidoB.promise as never);

    stubVisibilidad("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange")); // arranca A
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange")); // arranca B, antes de que A resuelva
    });

    // B (la más nueva) resuelve primero.
    await act(async () => {
      diferidoB.resolve({ data: [crearReservaRow({ id: "b1", nombre: "Reserva B" })], error: null });
    });
    // A (la más vieja) resuelve después — se descarta.
    await act(async () => {
      diferidoA.resolve({ data: [crearReservaRow({ id: "a1", nombre: "Reserva A" })], error: null });
    });

    expect(screen.getByTitle(/Reserva B/)).toBeTruthy();
    expect(screen.queryByTitle(/Reserva A/)).toBeNull();
  });
});

// C6 — signal dedicado de materializar_turnos_fijos_jugados (AdminShell, una
// vez por sesión). A diferencia de nuevaReservaSignal, no filtra por semana
// visible: cualquier cambio de token, estando activa, fuerza un refresco.
describe("AgendaView — materializacionSignal (C6)", () => {
  it("cambia el token estando activa: fuerza una recarga de la semana visible", async () => {
    mockearCargas([]);
    const { rerender } = render(<AgendaViewConectada mostrarToast={vi.fn()} materializacionSignal={0} />);
    await screen.findByText("08:00");
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<AgendaViewConectada mostrarToast={vi.fn()} materializacionSignal={1} />);
    });

    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2);
  });

  it("mismo token no dispara una recarga extra", async () => {
    mockearCargas([]);
    const { rerender } = render(<AgendaViewConectada mostrarToast={vi.fn()} materializacionSignal={1} />);
    await screen.findByText("08:00");
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<AgendaViewConectada mostrarToast={vi.fn()} materializacionSignal={1} />);
    });

    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);
  });

  it("activo=false: un cambio de token no dispara ninguna recarga", async () => {
    mockearCargas([]);
    const { rerender } = render(
      <AgendaViewConectada mostrarToast={vi.fn()} activo={false} materializacionSignal={0} />,
    );
    await screen.findByText("08:00");
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<AgendaViewConectada mostrarToast={vi.fn()} activo={false} materializacionSignal={1} />);
    });

    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);
  });

  it("false→true: un token de materialización viejo acumulado mientras estaba oculta no duplica el refresco de activación", async () => {
    mockearCargas([]);
    const { rerender } = render(
      <AgendaViewConectada mostrarToast={vi.fn()} activo={false} materializacionSignal={1} />,
    );
    await screen.findByText("08:00");
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender(<AgendaViewConectada mostrarToast={vi.fn()} activo materializacionSignal={1} />);
    });

    // Un único refresco (el de activación), no dos.
    expect(obtenerReservasPorRango).toHaveBeenCalledTimes(2);
  });
});

// R3 — useEsDesktop (jsdom sin matchMedia) cae al fallback por
// window.innerWidth; seteándolo ANTES de renderizar, AgendaView monta
// directamente en la rama mobile (sin necesidad de disparar un resize).
function usarAnchoMobile() {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
}

describe("AgendaView — mobile (R3): vista de un solo día", () => {
  it("por debajo de 1024px NO renderiza las 7 columnas: una sola columna de día + selector horizontal", async () => {
    usarAnchoMobile();
    mockearCargas([]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("08:00");

    expect(screen.getByRole("tablist", { name: "Elegir día" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    // Un solo día pintado a la vez (desktop pintaría 7 columnas con este
    // mismo data-testid, una por cada día de la semana).
    expect(screen.getAllByTestId(/^agenda-dia-/)).toHaveLength(1);
  });

  it("arranca mostrando 'hoy' (dentro de la semana visible) y cambia de día al tocar otro chip", async () => {
    usarAnchoMobile();
    const user = userEvent.setup();
    mockearCargas([
      crearReservaRow({ id: "hoy1", nombre: "Reserva Hoy", fecha: "2026-06-03", hora_inicio: "09:00:00", hora_fin: "09:30:00" }),
      crearReservaRow({ id: "mar1", nombre: "Reserva Martes", fecha: "2026-06-02", hora_inicio: "09:00:00", hora_fin: "09:30:00" }),
    ]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    // AHORA_FIJO es miércoles 2026-06-03 -> arranca mostrando ese día.
    expect(await screen.findByTitle(/Reserva Hoy/)).toBeTruthy();
    expect(screen.queryByTitle(/Reserva Martes/)).toBeNull();

    const tabs = screen.getAllByRole("tab");
    await user.click(tabs[1]); // Martes (índice 1: Lun, Mar, ...)

    expect(await screen.findByTitle(/Reserva Martes/)).toBeTruthy();
    expect(screen.queryByTitle(/Reserva Hoy/)).toBeNull();
  });

  it("celda reserva en mobile: abre el bottom sheet y Cancelar turno sigue llamando cancelarReserva", async () => {
    usarAnchoMobile();
    const user = userEvent.setup();
    mockearCargas([crearReservaRow({ fecha: "2026-06-03" })]);
    render(<AgendaViewConectada mostrarToast={vi.fn()} />);

    const celda = await screen.findByTitle(/Juan Reserva/);
    await user.click(celda);
    const sheet = screen.getByRole("dialog", { name: "Turno reservado" });
    await user.click(within(sheet).getByRole("button", { name: "Cancelar turno" }));
    const dialogs = screen.getAllByRole("dialog");
    await user.click(within(dialogs[dialogs.length - 1]).getByRole("button", { name: "Cancelar sin avisar" }));

    expect(cancelarReserva).toHaveBeenCalledWith("r1");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
it.each([390, 1280])("P7.1 Agenda: teclado, trap y restauración a %s px", async (width) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  const user = userEvent.setup();
  mockearCargas([crearReservaRow({ fecha: "2026-06-03" })]);
  render(<AgendaViewConectada mostrarToast={vi.fn()} />);
  const opener = await screen.findByTitle(/Juan Reserva/);
  opener.focus();
  await user.keyboard("{Enter}");
  const dialog = screen.getByRole("dialog", { name: "Turno reservado" });
  expect(document.activeElement).toBe(dialog);
  await user.tab({ shift: true });
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe("");
});


it("cancelar materializada de turno fijo deja la celda libre sin recargar", async () => {
  const user = userEvent.setup();
  mockearCargas([crearReservaRow({ turno_fijo_id: "t1", hora_inicio: "18:00:00", hora_fin: "18:30:00" })], [crearTurnoFijoRow()]);
  render(<AgendaViewConectada mostrarToast={vi.fn()} />);
  await user.click(await screen.findByTitle(/Juan Reserva/));
  await user.click(screen.getByRole("button", { name: "Cancelar turno" }));
  vi.mocked(obtenerExcepciones).mockResolvedValue({ data: [{ id: "ex1", turno_fijo_id: "t1", fecha: "2026-06-01", creado: null }], error: null } as never);
  await user.click(screen.getByRole("button", { name: "Cancelar sin avisar" }));
  await waitFor(() => expect(screen.queryByTitle(/Juan Reserva/)).toBeNull());
  expect(screen.queryByTitle(/Fijo Martin/)).toBeNull();
  expect(cancelarReserva).toHaveBeenCalledWith("r1");
});
