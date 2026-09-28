/** @vitest-environment jsdom */
// Tests de C2 — TurnosFijosView: alta (validación, solape, choques con
// reservas, confirmación, atomicidad de cliente con rollback) y eliminación.
// C3 agrega: próximas ocurrencias (cancelar un día puntual) y link de baja
// por WhatsApp (token).
//
// TF-R3 — reescrito para la UI agrupada por titular: una tarjeta por titular
// con N horarios debajo, alta con "Nuevo titular"/"Titular existente"
// (SegmentedControl + TitularPicker), eliminar horario vs. eliminar titular
// completo, link de baja/copiar link por titular (no por horario), editar
// nombre/teléfono.
//
// TF-R3.1 — "Nuevo titular" pasa a cargar una LISTA de horarios (mínimo 1,
// "+ Agregar horario"/"Quitar" por fila) en una sola llamada atómica
// (crear_titular_turno_fijo, mockeada acá como crearTitularConHorarios) en
// vez de crearTurnoFijo (2 inserts + rollback best-effort, eliminado).
// "Titular existente" NO cambia — sigue siendo 1 solo horario por vez, así
// que esos tests quedan intactos.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "../../../types/database.types";
import { obtenerHorariosSemana } from "../configuracion/configuracion.api";
import { obtenerReservasProximas } from "../reservas/reservas.api";
import { formatearBadgeFecha } from "../reservas/reservas.logic";
import { TurnosFijosView, type TurnosFijosViewProps } from "./TurnosFijosView";
import type { TitularTurnoFijoCreado } from "./turnosFijos.types";
import {
  actualizarTitular,
  agregarHorarioATitular,
  crearExcepcionTurnoFijo,
  crearExcepcionesTurnoFijo,
  crearTitularConHorarios,
  eliminarTitular,
  eliminarTurnoFijo,
  obtenerConfiguracionDuracion,
  obtenerExcepciones,
  obtenerTokenTitular,
  obtenerTurnosFijos,
  upsertTokenTitular,
} from "./turnosFijos.api";
import { useTurnosFijos } from "./useTurnosFijos";

vi.mock("../reservas/reservas.api", () => ({
  obtenerReservasProximas: vi.fn(),
}));

// CFG-F2 — horario real por día de semana (useHorariosSemana), reemplaza el
// 08:00-01:00 hardcodeado de configCancha.
vi.mock("../configuracion/configuracion.api", () => ({
  obtenerHorariosSemana: vi.fn(),
}));

// Los 7 días abiertos 08:00-01:00 — mismo horario que antes tenía
// configCancha hardcodeado, preserva las opciones que ya esperan los tests
// de este archivo.
const HORARIOS_SEMANA_ABIERTOS: Tables<"horarios_semana_publica">[] = Array.from({ length: 7 }, (_, dia_semana) => ({
  dia_semana,
  abierto: true,
  hora_apertura: "08:00:00",
  hora_cierre: "01:00:00",
}));

vi.mock("./turnosFijos.api", () => ({
  obtenerTurnosFijos: vi.fn(),
  obtenerExcepciones: vi.fn(),
  crearTitularConHorarios: vi.fn(),
  agregarHorarioATitular: vi.fn(),
  eliminarTurnoFijo: vi.fn(),
  eliminarTitular: vi.fn(),
  actualizarTitular: vi.fn(),
  crearExcepcionTurnoFijo: vi.fn(),
  crearExcepcionesTurnoFijo: vi.fn(),
  upsertTokenTitular: vi.fn(),
  obtenerTokenTitular: vi.fn(),
  // C5.1 — TurnosFijosView ahora trae la duración real (configuracion_cancha_publica).
  obtenerConfiguracionDuracion: vi.fn(),
}));

// C3 — TurnosFijosView ya no crea su propia instancia de useTurnosFijos (ahora
// la recibe por props, compartida desde AdminShell). Mismo harness que
// AgendaView.test.tsx: instancia el hook real (contra el turnosFijos.api
// mockeado arriba) y se lo pasa a la vista, igual que AdminShell en producción.
function TurnosFijosViewConectada(props: Omit<TurnosFijosViewProps, "turnosFijos">) {
  const turnosFijos = useTurnosFijos();
  return <TurnosFijosView {...props} turnosFijos={turnosFijos} />;
}

// Miércoles fijo (dia_semana=3), mismo instante/convención que
// turnosFijos.logic.test.ts y reservas.logic.test.ts.
const AHORA_FIJO = new Date("2026-01-07T15:00:00-03:00");

beforeEach(() => {
  vi.setSystemTime(AHORA_FIJO);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

// TF-R3 — shape real del embed `select("*, titulares_turno_fijo(nombre,
// telefono)")` que usa obtenerTurnosFijos(). nombre/telefono se aceptan
// "planos" en el override por comodidad de los call sites (el helper los
// anida en titulares_turno_fijo internamente).
type TurnoFijoRowMock = Tables<"turnos_fijos"> & { titulares_turno_fijo: { nombre: string; telefono: string } | null };

function crearTurnoFijoRow(
  overrides: Partial<Omit<Tables<"turnos_fijos">, "creado">> & { nombre?: string; telefono?: string; creado?: string } = {},
): TurnoFijoRowMock {
  const { nombre = "Fijo Existente", telefono = "3770000000", ...resto } = overrides;
  return {
    id: "t1",
    titular_id: "tit1",
    dia_semana: 3,
    hora_inicio: "10:00:00",
    hora_fin: "12:00:00",
    // FINAL-F3 (M5): estos fixtures modelan turnos fijos YA existentes (creados
    // mucho antes del reloj simulado); `new Date()` sería "creado justo ahora"
    // y, por la regla instante_inicio_real >= creado, ocultaría sus ocurrencias
    // anteriores a este instante.
    creado: "2025-01-01T00:00:00.000Z",
    ...resto,
    titulares_turno_fijo: { nombre, telefono },
  };
}

// TF-R3.1 — shape real (Json parseado) que devuelve crear_titular_turno_fijo
// (titular nuevo + N horarios, cada uno con sus excepciones si las hubo).
function crearTitularCreado(overrides: Partial<TitularTurnoFijoCreado> = {}): TitularTurnoFijoCreado {
  return {
    titular_id: "tit-nuevo",
    nombre: "Juan Nuevo",
    telefono: "3771234567",
    turnos: [{ id: "nuevo", dia_semana: 3, hora_inicio: "10:00", hora_fin: "11:00", excepciones: [] }],
    ...overrides,
  };
}

// TF-R3 — shape crudo (sin nombre/telefono) que devuelve agregarHorarioATitular().
function crearHorarioAgregado(
  overrides: Partial<{ id: string; titular_id: string; dia_semana: number; hora_inicio: string; hora_fin: string; creado: string }> = {},
) {
  return {
    id: "nuevo-horario",
    titular_id: "tit1",
    dia_semana: 3,
    hora_inicio: "10:00:00",
    hora_fin: "11:00:00",
    creado: new Date().toISOString(),
    ...overrides,
  };
}

function crearReservaRow(overrides: Partial<Tables<"reservas">> = {}): Tables<"reservas"> {
  return {
    id: "r1",
    fecha: "2026-01-07",
    hora_inicio: "10:30:00",
    hora_fin: "11:30:00",
    nombre: "Reserva Existente",
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

function mockearCargas(
  turnosFijos: TurnoFijoRowMock[] = [],
  excepciones: Tables<"excepciones_turno_fijo">[] = [],
  reservasProximas: Tables<"reservas">[] = [],
) {
  vi.mocked(obtenerTurnosFijos).mockResolvedValue({ data: turnosFijos, error: null } as never);
  vi.mocked(obtenerExcepciones).mockResolvedValue({ data: excepciones, error: null } as never);
  vi.mocked(obtenerReservasProximas).mockResolvedValue({ data: reservasProximas, error: null } as never);
  vi.mocked(crearExcepcionesTurnoFijo).mockResolvedValue({ error: null } as never);
  vi.mocked(crearExcepcionTurnoFijo).mockResolvedValue({ error: null } as never);
  vi.mocked(eliminarTurnoFijo).mockResolvedValue({ error: null } as never);
  vi.mocked(eliminarTitular).mockResolvedValue({ error: null } as never);
  vi.mocked(upsertTokenTitular).mockResolvedValue({ data: null, error: null } as never);
  vi.mocked(obtenerTokenTitular).mockResolvedValue({ data: null, error: null } as never);
  // C5.1/C7 — mismo min/max/cancelacion que el seed real (60/180/4): los
  // tests existentes que arman turnos de 60-120min siguen cayendo dentro de
  // rango sin cambios, y "Link de baja" sigue armando su mensaje sin abortar.
  vi.mocked(obtenerConfiguracionDuracion).mockResolvedValue({
    data: { duracion_minima_minutos: 60, duracion_maxima_minutos: 180, cancelacion_horas_minimas: 4 },
    error: null,
  } as never);
  vi.mocked(obtenerHorariosSemana).mockResolvedValue({ data: HORARIOS_SEMANA_ABIERTOS, error: null } as never);
}

function seccionActivos() {
  return screen.getByTestId("turnos-fijos-activos");
}

function grupoTitular(nombre: string) {
  const titulos = screen.getAllByText(nombre, { exact: false });
  for (const el of titulos) {
    const grupo = el.closest('[data-testid="grupo-titular"]');
    if (grupo) return grupo as HTMLElement;
  }
  throw new Error(`No se encontró el grupo del titular "${nombre}"`);
}

// TF-R3.1 — abre el modal (por defecto en modo "Nuevo titular") y completa
// UNA fila de horario por índice ("Horario 1", "Horario 2", ...). No toca
// nombre/teléfono (eso es completarNombreTelefono) ni agrega filas — para
// eso está agregarFilaYCompletar más abajo.
async function abrirModalYCompletarHorario(
  user: ReturnType<typeof userEvent.setup>,
  {
    botonAbrir = "Nuevo turno fijo",
    indice = 1,
    dia = "3",
    horaInicio = "10:00",
    horaFin = "11:00",
  }: { botonAbrir?: string; indice?: number; dia?: string; horaInicio?: string; horaFin?: string } = {},
) {
  await user.click(screen.getByRole("button", { name: botonAbrir }));
  const dialog = screen.getByRole("dialog");
  await user.selectOptions(within(dialog).getByLabelText(`Día de la semana · Horario ${indice}`), dia);
  if (horaInicio) {
    await user.click(within(dialog).getByRole("button", { name: `Hora inicio · Horario ${indice}` }));
    await user.click(screen.getByRole("option", { name: horaInicio }));
  }
  if (horaFin) {
    await user.click(within(dialog).getByRole("button", { name: `Hora fin · Horario ${indice}` }));
    await user.click(screen.getByRole("option", { name: horaFin }));
  }
  return dialog;
}

// TF-R3.1 — click en "+ Agregar horario" (dentro del modal) y completa la
// fila recién agregada (índice = cantidad de filas resultante).
async function agregarFilaYCompletar(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  { indice, dia, horaInicio, horaFin }: { indice: number; dia: string; horaInicio: string; horaFin: string },
) {
  await user.click(within(dialog).getByRole("button", { name: "Agregar horario" }));
  await user.selectOptions(within(dialog).getByLabelText(`Día de la semana · Horario ${indice}`), dia);
  await user.click(within(dialog).getByRole("button", { name: `Hora inicio · Horario ${indice}` }));
  await user.click(screen.getByRole("option", { name: horaInicio }));
  await user.click(within(dialog).getByRole("button", { name: `Hora fin · Horario ${indice}` }));
  await user.click(screen.getByRole("option", { name: horaFin }));
}

async function completarNombreTelefono(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  { nombre = "Juan Nuevo", telefono = "3771234567" }: { nombre?: string; telefono?: string } = {},
) {
  if (nombre) await user.type(within(dialog).getByLabelText("Nombre y apellido"), nombre);
  if (telefono) await user.type(within(dialog).getByLabelText("Teléfono"), telefono);
}

// "Titular existente" sigue siendo el único Día/Hora de siempre (TF-R3.1 no
// le agrega multi-alta), así que usa las etiquetas planas de siempre — no
// pasa por abrirModalYCompletarHorario (esa es del modo "nuevo").
async function abrirModalExistenteYCompletarHorario(
  user: ReturnType<typeof userEvent.setup>,
  nombreTitular: string,
  { dia = "4", horaInicio = "10:00", horaFin = "11:00" }: { dia?: string; horaInicio?: string; horaFin?: string } = {},
) {
  await user.click(screen.getByRole("button", { name: "Nuevo turno fijo" }));
  await user.click(screen.getByRole("button", { name: "Titular existente" }));
  await user.click(screen.getByRole("button", { name: "Titular" }));
  await user.click(screen.getByRole("option", { name: new RegExp(nombreTitular) }));
  const dialog = screen.getByRole("dialog");
  await user.selectOptions(within(dialog).getByLabelText("Día de la semana"), dia);
  await user.click(within(dialog).getByRole("button", { name: "Hora inicio" }));
  await user.click(screen.getByRole("option", { name: horaInicio }));
  await user.click(within(dialog).getByRole("button", { name: "Hora fin" }));
  await user.click(screen.getByRole("option", { name: horaFin }));
  return dialog;
}

describe("TurnosFijosView — validación y solape", () => {
  it("campos incompletos: no llama a crearTitularConHorarios y muestra error", async () => {
    const user = userEvent.setup();
    mockearCargas();
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user, { horaInicio: "", horaFin: "" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    expect(screen.getByText("Completá todos los campos.")).toBeTruthy();
    expect(crearTitularConHorarios).not.toHaveBeenCalled();
  });

  it("solape con otro turno fijo del mismo día: error inline, no llama a la API", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ dia_semana: 3, hora_inicio: "10:00:00", hora_fin: "12:00:00" })]);
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await within(seccionActivos()).findByText(/Fijo Existente/);

    // 10:00-11:00 (miércoles) cae dentro del turno existente 10:00-12:00.
    const dialog = await abrirModalYCompletarHorario(user, { dia: "3", horaInicio: "10:00", horaFin: "11:00" });
    await completarNombreTelefono(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    expect(screen.getByText("Ya existe otro turno fijo que ocupa ese horario en este día.")).toBeTruthy();
    expect(crearTitularConHorarios).not.toHaveBeenCalled();
    expect(obtenerReservasProximas).not.toHaveBeenCalled();
  });
});

// PHONE-FIX — validación de teléfono en el alta/edición de titulares.
// normalizarTelefonoArgentino (lib/telefono.ts) tiene su propia batería de
// tests (formatos equivalentes/inválidos, ver lib/telefono.test.ts); acá solo
// se prueba que TurnosFijosView la use correctamente: bloquee el submit con
// el mensaje específico junto al campo, deje pasar formatos "raros" pero
// válidos, y no muestre el error genérico si el servidor identifica que fue
// el teléfono (fallback de 22023).
describe("TurnosFijosView — validación de teléfono (PHONE-FIX)", () => {
  it("nuevo titular con teléfono inválido: error específico junto al campo, no llama a la API", async () => {
    const user = userEvent.setup();
    mockearCargas();
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user);
    await completarNombreTelefono(user, dialog, { telefono: "12345" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    expect(screen.getByText("El número de teléfono no es válido.")).toBeTruthy();
    expect(screen.getByText(/Ejemplo: 3775550100/)).toBeTruthy();
    expect(crearTitularConHorarios).not.toHaveBeenCalled();
  });

  it("nuevo titular con prefijo móvil viejo '15' (sin 0 ni +54): pasa la validación de cliente y llama a la API", async () => {
    const user = userEvent.setup();
    mockearCargas();
    vi.mocked(crearTitularConHorarios).mockResolvedValue({
      data: crearTitularCreado({ telefono: "377515550100" }),
      error: null,
    } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user);
    await completarNombreTelefono(user, dialog, { telefono: "377515550100" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    expect(screen.queryByText("El número de teléfono no es válido.")).toBeNull();
    await waitFor(() =>
      expect(crearTitularConHorarios).toHaveBeenCalledWith("Juan Nuevo", "377515550100", [
        { dia_semana: 3, hora_inicio: "10:00", hora_fin: "11:00", excepciones: [] },
      ]),
    );
  });

  it("el servidor rechaza por teléfono inválido (22023): mensaje específico, no el genérico", async () => {
    const user = userEvent.setup();
    mockearCargas();
    vi.mocked(crearTitularConHorarios).mockResolvedValue({
      data: null,
      error: { code: "22023", message: "telefono_invalido" },
    } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user);
    await completarNombreTelefono(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    await waitFor(() => expect(screen.getByText("El número de teléfono no es válido.")).toBeTruthy());
    expect(screen.queryByText("No se pudo guardar el turno fijo.")).toBeNull();
  });

  it("editar titular con teléfono inválido: error específico junto al campo, no llama a la API", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez" })]);
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    const grupo = await screen.findByTestId("grupo-titular");

    await user.click(within(grupo).getByRole("button", { name: "Editar Juan Pérez" }));
    const dialog = screen.getByRole("dialog", { name: "Editar titular" });
    const telefonoInput = within(dialog).getByLabelText("Teléfono");
    await user.clear(telefonoInput);
    await user.type(telefonoInput, "12345");
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("El número de teléfono no es válido.")).toBeTruthy();
    expect(actualizarTitular).not.toHaveBeenCalled();
  });

  it("editar titular: el servidor rechaza por 22023, mensaje específico junto al campo", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez" })]);
    vi.mocked(actualizarTitular).mockResolvedValue({
      data: null,
      error: { code: "22023", message: "telefono_invalido" },
    } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    const grupo = await screen.findByTestId("grupo-titular");
    await user.click(within(grupo).getByRole("button", { name: "Editar Juan Pérez" }));
    const dialog = screen.getByRole("dialog", { name: "Editar titular" });
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.getByText("El número de teléfono no es válido.")).toBeTruthy());
    expect(screen.queryByText("No se pudo guardar. Probá de nuevo.")).toBeNull();
  });
});

describe("TurnosFijosView — alta: nuevo titular con 1 horario", () => {
  it("guarda directo, sin modal de confirmación, y patchea la lista local", async () => {
    const user = userEvent.setup();
    mockearCargas([], [], []); // sin turnos fijos existentes, sin reservas próximas
    vi.mocked(crearTitularConHorarios).mockResolvedValue({ data: crearTitularCreado(), error: null } as never);

    const mostrarToast = vi.fn();
    render(<TurnosFijosViewConectada mostrarToast={mostrarToast} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user);
    await completarNombreTelefono(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    await waitFor(() =>
      expect(crearTitularConHorarios).toHaveBeenCalledWith("Juan Nuevo", "3771234567", [
        { dia_semana: 3, hora_inicio: "10:00", hora_fin: "11:00", excepciones: [] },
      ]),
    );
    expect(crearExcepcionesTurnoFijo).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await within(seccionActivos()).findByText("Juan Nuevo")).toBeTruthy();
    expect(mostrarToast).toHaveBeenCalledWith("Turno fijo agregado.", "ok");
  });

  it("error del servidor: mensaje genérico, el modal sigue abierto", async () => {
    const user = userEvent.setup();
    mockearCargas();
    vi.mocked(crearTitularConHorarios).mockResolvedValue({ data: null, error: { message: "fallo" } } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");
    const dialog = await abrirModalYCompletarHorario(user);
    await completarNombreTelefono(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    await waitFor(() => expect(screen.getByText("No se pudo guardar el turno fijo.")).toBeTruthy());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("mismo teléfono en dos titulares distintos: quedan como grupos separados, sin fusionarse", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "t1", titular_id: "juan", nombre: "Juan Pérez", telefono: "3771234567", dia_semana: 2 })]);
    vi.mocked(crearTitularConHorarios).mockResolvedValue({
      data: crearTitularCreado({
        titular_id: "pedro",
        nombre: "Pedro Gómez",
        telefono: "3771234567",
        turnos: [{ id: "t2", dia_semana: 5, hora_inicio: "10:00", hora_fin: "11:00", excepciones: [] }],
      }),
      error: null,
    } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await within(seccionActivos()).findByText("Juan Pérez");

    const dialog = await abrirModalYCompletarHorario(user, { dia: "5", horaInicio: "10:00", horaFin: "11:00" });
    await completarNombreTelefono(user, dialog, { nombre: "Pedro Gómez", telefono: "3771234567" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(seccionActivos()).getByText("Juan Pérez")).toBeTruthy();
    expect(within(seccionActivos()).getByText("Pedro Gómez")).toBeTruthy();
    expect(screen.getByText("2 titulares cargados")).toBeTruthy();
  });
});

describe("TurnosFijosView — alta: nuevo titular con varios horarios (TF-R3.1)", () => {
  it("2 horarios en el mismo modal: un solo llamado atómico con los 2, un solo grupo con 2 horarios", async () => {
    const user = userEvent.setup();
    mockearCargas();
    vi.mocked(crearTitularConHorarios).mockResolvedValue({
      data: crearTitularCreado({
        turnos: [
          { id: "h1", dia_semana: 2, hora_inicio: "20:00", hora_fin: "21:30", excepciones: [] },
          { id: "h2", dia_semana: 4, hora_inicio: "22:00", hora_fin: "23:30", excepciones: [] },
        ],
      }),
      error: null,
    } as never);

    const mostrarToast = vi.fn();
    render(<TurnosFijosViewConectada mostrarToast={mostrarToast} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user, { dia: "2", horaInicio: "20:00", horaFin: "21:30" });
    await completarNombreTelefono(user, dialog);
    await agregarFilaYCompletar(user, dialog, { indice: 2, dia: "4", horaInicio: "22:00", horaFin: "23:30" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar 2 horarios" }));

    await waitFor(() =>
      expect(crearTitularConHorarios).toHaveBeenCalledWith("Juan Nuevo", "3771234567", [
        { dia_semana: 2, hora_inicio: "20:00", hora_fin: "21:30", excepciones: [] },
        { dia_semana: 4, hora_inicio: "22:00", hora_fin: "23:30", excepciones: [] },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mostrarToast).toHaveBeenCalledWith("2 turnos fijos agregados.", "ok");

    const grupo = grupoTitular("Juan Nuevo");
    expect(within(grupo).getByText(/2 horarios/)).toBeTruthy();
    expect(within(grupo).getByText("20:00-21:30")).toBeTruthy();
    expect(within(grupo).getByText("22:00-23:30")).toBeTruthy();
  });

  it("3 horarios: los 3 viajan juntos en un solo llamado", async () => {
    const user = userEvent.setup();
    mockearCargas();
    vi.mocked(crearTitularConHorarios).mockResolvedValue({
      data: crearTitularCreado({
        turnos: [
          { id: "h1", dia_semana: 2, hora_inicio: "20:00", hora_fin: "21:30", excepciones: [] },
          { id: "h2", dia_semana: 4, hora_inicio: "22:00", hora_fin: "23:30", excepciones: [] },
          { id: "h3", dia_semana: 6, hora_inicio: "18:30", hora_fin: "20:00", excepciones: [] },
        ],
      }),
      error: null,
    } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user, { dia: "2", horaInicio: "20:00", horaFin: "21:30" });
    await completarNombreTelefono(user, dialog);
    await agregarFilaYCompletar(user, dialog, { indice: 2, dia: "4", horaInicio: "22:00", horaFin: "23:30" });
    await agregarFilaYCompletar(user, dialog, { indice: 3, dia: "6", horaInicio: "18:30", horaFin: "20:00" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar 3 horarios" }));

    await waitFor(() =>
      expect(crearTitularConHorarios).toHaveBeenCalledWith("Juan Nuevo", "3771234567", [
        { dia_semana: 2, hora_inicio: "20:00", hora_fin: "21:30", excepciones: [] },
        { dia_semana: 4, hora_inicio: "22:00", hora_fin: "23:30", excepciones: [] },
        { dia_semana: 6, hora_inicio: "18:30", hora_fin: "20:00", excepciones: [] },
      ]),
    );
  });

  it("horarios idénticos (mismo día+horario) en dos filas: error inline, no llama a la API", async () => {
    const user = userEvent.setup();
    mockearCargas();
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user, { dia: "2", horaInicio: "20:00", horaFin: "21:30" });
    await completarNombreTelefono(user, dialog);
    await agregarFilaYCompletar(user, dialog, { indice: 2, dia: "2", horaInicio: "20:00", horaFin: "21:30" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar 2 horarios" }));

    expect(screen.getByText("Hay horarios repetidos en la lista.")).toBeTruthy();
    expect(crearTitularConHorarios).not.toHaveBeenCalled();
  });

  it("horarios que se superponen entre sí (sin ser idénticos): error inline, no llama a la API", async () => {
    const user = userEvent.setup();
    mockearCargas();
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user, { dia: "2", horaInicio: "20:00", horaFin: "21:30" });
    await completarNombreTelefono(user, dialog);
    await agregarFilaYCompletar(user, dialog, { indice: 2, dia: "2", horaInicio: "21:00", horaFin: "22:00" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar 2 horarios" }));

    expect(screen.getByText("Hay horarios que se superponen entre sí en la lista.")).toBeTruthy();
    expect(crearTitularConHorarios).not.toHaveBeenCalled();
  });

  it("una fila solapa contra un turno fijo YA existente: error inline, no llama a la API", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ dia_semana: 4, hora_inicio: "22:00:00", hora_fin: "23:30:00" })]);
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await within(seccionActivos()).findByText(/Fijo Existente/);

    const dialog = await abrirModalYCompletarHorario(user, { dia: "2", horaInicio: "20:00", horaFin: "21:30" });
    await completarNombreTelefono(user, dialog);
    await agregarFilaYCompletar(user, dialog, { indice: 2, dia: "4", horaInicio: "22:00", horaFin: "23:30" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar 2 horarios" }));

    expect(screen.getByText("Ya existe otro turno fijo que ocupa ese horario en este día.")).toBeTruthy();
    expect(crearTitularConHorarios).not.toHaveBeenCalled();
  });

  it("fallo del servidor con varios horarios: mensaje genérico, nada queda creado localmente (no hay patch parcial)", async () => {
    const user = userEvent.setup();
    mockearCargas();
    vi.mocked(crearTitularConHorarios).mockResolvedValue({ data: null, error: { message: "fallo" } } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user, { dia: "2", horaInicio: "20:00", horaFin: "21:30" });
    await completarNombreTelefono(user, dialog);
    await agregarFilaYCompletar(user, dialog, { indice: 2, dia: "4", horaInicio: "22:00", horaFin: "23:30" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar 2 horarios" }));

    await waitFor(() => expect(screen.getByText("No se pudo guardar el turno fijo.")).toBeTruthy());
    // No se llama a ningún patch local ni queda nada en la sección de activos
    // (la RPC es atómica: si falla, el servidor no crea nada — no hay ningún
    // rollback de cliente que disparar acá, a diferencia del flujo viejo).
    expect(screen.getByText("No hay turnos fijos cargados.")).toBeTruthy();
    expect(screen.queryByText("Juan Nuevo")).toBeNull();
  });

  it("quitar una fila: vuelve a quedar 1 horario y el botón de quitar desaparece", async () => {
    const user = userEvent.setup();
    mockearCargas();
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user, { dia: "2", horaInicio: "20:00", horaFin: "21:30" });
    await agregarFilaYCompletar(user, dialog, { indice: 2, dia: "4", horaInicio: "22:00", horaFin: "23:30" });
    expect(within(dialog).getByRole("button", { name: "Agregar 2 horarios" })).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Quitar horario 2" }));

    expect(within(dialog).queryByRole("button", { name: /Quitar horario/ })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Agregar turno fijo" })).toBeTruthy();
  });
});

describe("TurnosFijosView — alta: titular existente", () => {
  it("elige un titular ya cargado desde el picker y le agrega un horario nuevo", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "t1", titular_id: "juan", nombre: "Juan Pérez", telefono: "3771234567", dia_semana: 2 })]);
    vi.mocked(agregarHorarioATitular).mockResolvedValue({
      data: crearHorarioAgregado({ id: "t2", titular_id: "juan", dia_semana: 4, hora_inicio: "10:00:00", hora_fin: "11:00:00" }),
      error: null,
    } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await within(seccionActivos()).findByText("Juan Pérez");

    const dialog = await abrirModalExistenteYCompletarHorario(user, "Juan Pérez", { dia: "4", horaInicio: "10:00", horaFin: "11:00" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    await waitFor(() => expect(agregarHorarioATitular).toHaveBeenCalledWith("juan", 4, "10:00", "11:00"));
    expect(crearTitularConHorarios).not.toHaveBeenCalled();
    const grupo = grupoTitular("Juan Pérez");
    expect(within(grupo).getByText(/2 horarios/)).toBeTruthy();
  });

  it("sin elegir titular: error inline, no llama a la API", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "t1", titular_id: "juan", nombre: "Juan Pérez" })]);
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await within(seccionActivos()).findByText("Juan Pérez");

    await user.click(screen.getByRole("button", { name: "Nuevo turno fijo" }));
    const dialog = screen.getByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Titular existente" }));
    // Día/Hora completos (con esto solo falta elegir titular) — sin esto,
    // el primer error inline sería "Completá todos los campos.".
    await user.selectOptions(within(dialog).getByLabelText("Día de la semana"), "4");
    await user.click(within(dialog).getByRole("button", { name: "Hora inicio" }));
    await user.click(screen.getByRole("option", { name: "10:00" }));
    await user.click(within(dialog).getByRole("button", { name: "Hora fin" }));
    await user.click(screen.getByRole("option", { name: "11:00" }));
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    expect(screen.getByText("Elegí un titular.")).toBeTruthy();
    expect(agregarHorarioATitular).not.toHaveBeenCalled();
  });
});

describe("TurnosFijosView — alta con choques", () => {
  it("pide confirmación con el mensaje correcto y, al confirmar, crea el titular con la excepción incluida", async () => {
    const user = userEvent.setup();
    // Reserva vigente el mismo miércoles (hoy), cruzando el horario propuesto
    // (20:30-21:30 se cruza con el 20:00-21:00 elegido). FINAL-F3 (M5): tiene que
    // ser un horario de hoy que TODAVÍA NO empezó (ahora = 15:00): una ocurrencia
    // ya empezada no va a existir, así que no puede chocar (ver el test siguiente).
    mockearCargas([], [], [crearReservaRow({ hora_inicio: "20:30:00", hora_fin: "21:30:00" })]);
    vi.mocked(crearTitularConHorarios).mockResolvedValue({
      data: crearTitularCreado({ turnos: [{ id: "nuevo2", dia_semana: 3, hora_inicio: "20:00", hora_fin: "21:00", excepciones: ["2026-01-07"] }] }),
      error: null,
    } as never);

    const mostrarToast = vi.fn();
    render(<TurnosFijosViewConectada mostrarToast={mostrarToast} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user, { horaInicio: "20:00", horaFin: "21:00" });
    await completarNombreTelefono(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    // La confirmación de choques se apila SOBRE el modal "Nuevo turno fijo"
    // (que sigue abierto detrás) — mismo criterio que AgendaDetalleSheet con
    // su propio ConfirmModal anidado.
    const confirmDialog = await screen.findByRole("dialog", { name: "Confirmar turno fijo" });
    const mensajeEsperado = `Miércoles 20:00-21:00: el día ${formatearBadgeFecha("2026-01-07")} (Reserva Existente) ya hay algo cargado en ese horario, así que esa fecha se excluye automáticamente del turno fijo. Recién va a arrancar el ${formatearBadgeFecha("2026-01-14")} — de ahí en más se repite cada semana con normalidad.`;
    expect(within(confirmDialog).getByText(mensajeEsperado)).toBeTruthy();

    expect(crearTitularConHorarios).not.toHaveBeenCalled(); // todavía no se confirmó

    await user.click(within(confirmDialog).getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(crearTitularConHorarios).toHaveBeenCalledWith("Juan Nuevo", "3771234567", [
        { dia_semana: 3, hora_inicio: "20:00", hora_fin: "21:00", excepciones: ["2026-01-07"] },
      ]),
    );
    // Las excepciones ahora viajan DENTRO de la misma llamada atómica — ya no
    // hay un segundo paso client-side (crearExcepcionesTurnoFijo) para "nuevo".
    expect(crearExcepcionesTurnoFijo).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await within(seccionActivos()).findByText("Juan Nuevo")).toBeTruthy();
    expect(mostrarToast).toHaveBeenCalledWith("Turno fijo agregado.", "ok");
  });

  // FINAL-F3 (M5) — el turno fijo nuevo tiene `creado` ≈ ahora (15:00): su
  // ocurrencia de HOY a las 10:00 ya empezó, no existe, y por lo tanto NO choca
  // con la reserva de hoy 10:30 ni hay que excluir esa fecha (ni pedir confirmación).
  it("M5: una reserva de HOY dentro de un horario que ya empezó no cuenta como choque (no hay confirmación ni excepción)", async () => {
    const user = userEvent.setup();
    mockearCargas([], [], [crearReservaRow()]); // hoy 10:30-11:30, ahora = 15:00
    vi.mocked(crearTitularConHorarios).mockResolvedValue({ data: crearTitularCreado(), error: null } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user); // miércoles 10:00-11:00
    await completarNombreTelefono(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));

    await waitFor(() =>
      expect(crearTitularConHorarios).toHaveBeenCalledWith("Juan Nuevo", "3771234567", [
        { dia_semana: 3, hora_inicio: "10:00", hora_fin: "11:00", excepciones: [] },
      ]),
    );
    expect(screen.queryByRole("dialog", { name: "Confirmar turno fijo" })).toBeNull();
  });

  it("con 2 horarios y choques solo en uno de ellos: el mensaje solo menciona el que choca", async () => {
    const user = userEvent.setup();
    // 2026-01-13 es martes (dia_semana=2) — la reserva tiene que caer en una
    // fecha del MISMO día de semana que el horario 1 para que el choque se
    // detecte (buscarChoquesTurnoFijoConReservas compara fecha por fecha).
    mockearCargas([], [], [crearReservaRow({ fecha: "2026-01-13", hora_inicio: "20:30:00", hora_fin: "21:00:00" })]);
    vi.mocked(crearTitularConHorarios).mockResolvedValue({
      data: crearTitularCreado({
        turnos: [
          { id: "h1", dia_semana: 2, hora_inicio: "20:00", hora_fin: "21:30", excepciones: [] },
          { id: "h2", dia_semana: 4, hora_inicio: "22:00", hora_fin: "23:30", excepciones: [] },
        ],
      }),
      error: null,
    } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");

    const dialog = await abrirModalYCompletarHorario(user, { dia: "2", horaInicio: "20:00", horaFin: "21:30" });
    await completarNombreTelefono(user, dialog);
    await agregarFilaYCompletar(user, dialog, { indice: 2, dia: "4", horaInicio: "22:00", horaFin: "23:30" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar 2 horarios" }));

    const confirmDialog = await screen.findByRole("dialog", { name: "Confirmar turno fijo" });
    expect(within(confirmDialog).getByText(/^Martes 20:00-21:30:/)).toBeTruthy();
    expect(within(confirmDialog).queryByText(/Jueves 22:00-23:30:/)).toBeNull();
  });

  it("error al confirmar: mensaje genérico, el modal de alta sigue abierto para no perder lo tipeado", async () => {
    const user = userEvent.setup();
    // FINAL-F3 (M5): choque con un horario de hoy que todavía no empezó (ahora = 15:00).
    mockearCargas([], [], [crearReservaRow({ fecha: "2026-01-07", hora_inicio: "20:30:00", hora_fin: "21:30:00" })]);
    vi.mocked(crearTitularConHorarios).mockResolvedValue({ data: null, error: { message: "fallo" } } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");
    const dialog = await abrirModalYCompletarHorario(user, { horaInicio: "20:00", horaFin: "21:00" });
    await completarNombreTelefono(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Confirmar turno fijo" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(screen.getByText("No se pudo guardar el turno fijo.")).toBeTruthy());
    expect(screen.queryByText("Juan Nuevo")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("TurnosFijosView — alta con choques (titular existente, sin cambios de TF-R3)", () => {
  it("sigue usando el rollback de cliente de siempre si crearExcepcionesTurnoFijo falla", async () => {
    const user = userEvent.setup();
    mockearCargas(
      [crearTurnoFijoRow({ id: "t1", titular_id: "juan", nombre: "Juan Pérez", dia_semana: 2 })],
      [],
      // FINAL-F3 (M5): choque con un horario de hoy que todavía no empezó (ahora = 15:00).
      [crearReservaRow({ fecha: "2026-01-07", hora_inicio: "20:30:00", hora_fin: "21:30:00" })],
    );
    vi.mocked(agregarHorarioATitular).mockResolvedValue({
      data: crearHorarioAgregado({ id: "nuevo3", titular_id: "juan", dia_semana: 3 }),
      error: null,
    } as never);
    vi.mocked(crearExcepcionesTurnoFijo).mockResolvedValue({ error: { message: "fallo" } } as never);
    vi.mocked(eliminarTurnoFijo).mockResolvedValue({ error: null } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await within(seccionActivos()).findByText("Juan Pérez");

    const dialog = await abrirModalExistenteYCompletarHorario(user, "Juan Pérez", { dia: "3", horaInicio: "20:00", horaFin: "21:00" });
    await user.click(within(dialog).getByRole("button", { name: "Agregar turno fijo" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Confirmar turno fijo" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(eliminarTurnoFijo).toHaveBeenCalledWith("nuevo3"));
    expect(screen.getByText("No se pudo completar el alta del turno fijo. Probá de nuevo.")).toBeTruthy();
    // "existente" nunca crea un titular nuevo, así que no hay titular
    // huérfano que limpiar acá (a diferencia del viejo flujo "nuevo").
    expect(eliminarTitular).not.toHaveBeenCalled();
  });
});

describe("TurnosFijosView — eliminar horario", () => {
  it("titular con 2 horarios: eliminar uno lo saca de la lista, el titular y el otro horario quedan", async () => {
    const user = userEvent.setup();
    mockearCargas([
      crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez", dia_semana: 2, hora_inicio: "20:00:00", hora_fin: "21:30:00" }),
      crearTurnoFijoRow({ id: "h2", titular_id: "juan", nombre: "Juan Pérez", dia_semana: 4, hora_inicio: "22:00:00", hora_fin: "23:30:00" }),
    ]);
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    const grupo = await screen.findByTestId("grupo-titular");
    expect(within(grupo).getByText(/2 horarios/)).toBeTruthy();

    await user.click(within(grupo).getByRole("button", { name: /Eliminar horario Martes/ }));
    const dialog = screen.getByRole("dialog", { name: "Eliminar horario" });
    expect(within(dialog).getByText(/no se puede deshacer|por completo/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    expect(eliminarTurnoFijo).toHaveBeenCalledWith("h1");
    expect(eliminarTitular).not.toHaveBeenCalled();
    await waitFor(() => expect(within(screen.getByTestId("grupo-titular")).getByText(/1 horario/)).toBeTruthy());
    expect(within(seccionActivos()).getByText("Juan Pérez")).toBeTruthy();
  });

  it("único horario del titular: al eliminarlo también se elimina el titular completo", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez" })]);
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await within(seccionActivos()).findByText("Juan Pérez");

    await user.click(screen.getByRole("button", { name: /Eliminar horario/ }));
    const dialog = screen.getByRole("dialog", { name: "Eliminar horario" });
    expect(within(dialog).getByText(/también se va a eliminar el titular y su link de baja/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    expect(eliminarTurnoFijo).toHaveBeenCalledWith("h1");
    await waitFor(() => expect(eliminarTitular).toHaveBeenCalledWith("juan"));
    await waitFor(() => expect(screen.getByText("No hay turnos fijos cargados.")).toBeTruthy());
  });

  it("error al eliminar: toast de error, el horario sigue en la lista", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez" })]);
    vi.mocked(eliminarTurnoFijo).mockResolvedValue({ error: { message: "fallo" } } as never);
    const mostrarToast = vi.fn();

    render(<TurnosFijosViewConectada mostrarToast={mostrarToast} />);
    await within(seccionActivos()).findByText("Juan Pérez");
    await user.click(screen.getByRole("button", { name: /Eliminar horario/ }));
    const dialog = screen.getByRole("dialog", { name: "Eliminar horario" });
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("No se pudo eliminar. Probá de nuevo.", "error"));
    expect(within(seccionActivos()).getByText("Juan Pérez")).toBeTruthy();
  });
});

describe("TurnosFijosView — eliminar titular completo", () => {
  it("confirma, llama eliminarTitular y el grupo entero desaparece", async () => {
    const user = userEvent.setup();
    mockearCargas([
      crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez", dia_semana: 2 }),
      crearTurnoFijoRow({ id: "h2", titular_id: "juan", nombre: "Juan Pérez", dia_semana: 4 }),
    ]);
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    const grupo = await screen.findByTestId("grupo-titular");

    await user.click(within(grupo).getByRole("button", { name: "Eliminar titular" }));
    const dialog = screen.getByRole("dialog", { name: "Eliminar titular" });
    expect(within(dialog).getByText(/Juan Pérez.*2 horarios fijos/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Eliminar titular" }));

    expect(eliminarTitular).toHaveBeenCalledWith("juan");
    await waitFor(() => expect(screen.getByText("No hay turnos fijos cargados.")).toBeTruthy());
  });

  it("error al eliminar: toast de error, el titular sigue en la lista", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez" })]);
    vi.mocked(eliminarTitular).mockResolvedValue({ error: { message: "fallo" } } as never);
    const mostrarToast = vi.fn();

    render(<TurnosFijosViewConectada mostrarToast={mostrarToast} />);
    const grupo = await screen.findByTestId("grupo-titular");
    await user.click(within(grupo).getByRole("button", { name: "Eliminar titular" }));
    const dialog = screen.getByRole("dialog", { name: "Eliminar titular" });
    await user.click(within(dialog).getByRole("button", { name: "Eliminar titular" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("No se pudo eliminar. Probá de nuevo.", "error"));
    expect(within(seccionActivos()).getByText("Juan Pérez")).toBeTruthy();
  });
});

describe("TurnosFijosView — editar titular", () => {
  it("edita nombre/teléfono y patchea todas las filas del titular en el estado", async () => {
    const user = userEvent.setup();
    mockearCargas([
      crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez", telefono: "3770000000", dia_semana: 2 }),
      crearTurnoFijoRow({ id: "h2", titular_id: "juan", nombre: "Juan Pérez", telefono: "3770000000", dia_semana: 4 }),
    ]);
    vi.mocked(actualizarTitular).mockResolvedValue({
      data: { id: "juan", nombre: "Juan Pérez López", telefono: "3779999999" },
      error: null,
    } as never);
    const mostrarToast = vi.fn();

    render(<TurnosFijosViewConectada mostrarToast={mostrarToast} />);
    const grupo = await screen.findByTestId("grupo-titular");

    await user.click(within(grupo).getByRole("button", { name: "Editar Juan Pérez" }));
    const dialog = screen.getByRole("dialog", { name: "Editar titular" });
    const nombreInput = within(dialog).getByLabelText("Nombre y apellido");
    await user.clear(nombreInput);
    await user.type(nombreInput, "Juan Pérez López");
    const telefonoInput = within(dialog).getByLabelText("Teléfono");
    await user.clear(telefonoInput);
    await user.type(telefonoInput, "3779999999");
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(actualizarTitular).toHaveBeenCalledWith("juan", "Juan Pérez López", "3779999999"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mostrarToast).toHaveBeenCalledWith("Titular actualizado.", "ok");
    const grupoActualizado = screen.getByTestId("grupo-titular");
    expect(within(grupoActualizado).getByText(/Juan Pérez López/)).toBeTruthy();
    expect(within(grupoActualizado).getByText(/3779999999/)).toBeTruthy();
  });

  it("error al guardar: mensaje inline, el modal sigue abierto", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez" })]);
    vi.mocked(actualizarTitular).mockResolvedValue({ data: null, error: { message: "fallo" } } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    const grupo = await screen.findByTestId("grupo-titular");
    await user.click(within(grupo).getByRole("button", { name: "Editar Juan Pérez" }));
    const dialog = screen.getByRole("dialog", { name: "Editar titular" });
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.getByText("No se pudo guardar. Probá de nuevo.")).toBeTruthy());
    expect(screen.getByRole("dialog", { name: "Editar titular" })).toBeTruthy();
  });
});

describe("TurnosFijosView — link de baja único por titular (TF-R3)", () => {
  beforeEach(() => {
    window.open = vi.fn();
  });

  // userEvent.setup() instala su propio stub de navigator.clipboard (para
  // soportar user.paste()) — si se define el mock ANTES de llamar a
  // userEvent.setup(), éste lo pisa. Por eso este helper se llama DESPUÉS,
  // en cada test que necesite verificar el copiado.
  function mockClipboard() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    return writeText;
  }

  it("'Link de baja' abre WhatsApp con el link /baja/?t=<token>, sin importar cuál horario resolvió el token", async () => {
    const user = userEvent.setup();
    mockearCargas([
      crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez", telefono: "3770000000", dia_semana: 2 }),
      crearTurnoFijoRow({ id: "h2", titular_id: "juan", nombre: "Juan Pérez", telefono: "3770000000", dia_semana: 4 }),
    ]);
    vi.mocked(upsertTokenTitular).mockResolvedValue({ data: { titular_id: "juan", token: "abc123" }, error: null } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    const grupo = await screen.findByTestId("grupo-titular");
    await user.click(within(grupo).getByRole("button", { name: /Link de baja/ }));

    await waitFor(() => expect(window.open).toHaveBeenCalledTimes(1));
    expect(upsertTokenTitular).toHaveBeenCalledWith("juan");
    const [url, target] = vi.mocked(window.open).mock.calls[0] as [string, string];
    expect(target).toBe("_blank");
    expect(url).toContain("https://api.whatsapp.com/send?phone=5493770000000");
    expect(url).toContain(encodeURIComponent("/baja/?t=abc123"));
    // El mensaje ya no menciona un horario puntual (el titular puede tener varios).
    expect(decodeURIComponent(url)).toContain("link de tus turnos fijos");
  });

  it("'Copiar link' copia el mismo link al portapapeles", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez" })]);
    vi.mocked(upsertTokenTitular).mockResolvedValue({ data: { titular_id: "juan", token: "abc123" }, error: null } as never);
    const mostrarToast = vi.fn();
    const writeText = mockClipboard();

    render(<TurnosFijosViewConectada mostrarToast={mostrarToast} />);
    const grupo = await screen.findByTestId("grupo-titular");
    await user.click(within(grupo).getByRole("button", { name: "Copiar link de baja" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("Link copiado.", "ok"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/baja/?t=abc123"));
  });

  it("un segundo click reusa el token cacheado: no vuelve a llamar upsert", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez" })]);
    vi.mocked(upsertTokenTitular).mockResolvedValue({ data: { titular_id: "juan", token: "abc123" }, error: null } as never);

    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    const grupo = await screen.findByTestId("grupo-titular");
    const boton = within(grupo).getByRole("button", { name: /Link de baja/ });

    await user.click(boton);
    await waitFor(() => expect(upsertTokenTitular).toHaveBeenCalledTimes(1));

    await user.click(boton);
    await waitFor(() => expect(window.open).toHaveBeenCalledTimes(2));
    expect(upsertTokenTitular).toHaveBeenCalledTimes(1);
  });

  it("no se puede generar el token: toast de error, no abre WhatsApp", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow({ id: "h1", titular_id: "juan", nombre: "Juan Pérez" })]);
    vi.mocked(upsertTokenTitular).mockResolvedValue({ data: null, error: null } as never);
    vi.mocked(obtenerTokenTitular).mockResolvedValue({ data: null, error: null } as never);
    const mostrarToast = vi.fn();

    render(<TurnosFijosViewConectada mostrarToast={mostrarToast} />);
    const grupo = await screen.findByTestId("grupo-titular");
    await user.click(within(grupo).getByRole("button", { name: /Link de baja/ }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("No se pudo generar el link. Probá de nuevo.", "error"));
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe("TurnosFijosView — próximas ocurrencias (C3)", () => {
  it("lista las ocurrencias de los próximos 14 días; cancelar una pide confirmación, llama crearExcepcionTurnoFijo y la saca de la lista", async () => {
    const user = userEvent.setup();
    mockearCargas([crearTurnoFijoRow()]);
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await within(seccionActivos()).findByText(/Fijo Existente/);

    const seccion = screen.getByTestId("proximas-ocurrencias-fijas");
    expect(within(seccion).getByText(formatearBadgeFecha("2026-01-07"))).toBeTruthy();
    expect(within(seccion).getByText(formatearBadgeFecha("2026-01-14"))).toBeTruthy();

    const botones = within(seccion).getAllByRole("button", { name: "Cancelar este día" });
    await user.click(botones[0]);

    const dialog = screen.getByRole("dialog", { name: "Cancelar este día" });
    expect(
      within(dialog).getByText("¿Cancelar el turno fijo solo para el 2026-01-07? El horario queda libre ese día."),
    ).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Cancelar este día" }));

    expect(crearExcepcionTurnoFijo).toHaveBeenCalledWith("t1", "2026-01-07");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(seccion).queryByText(formatearBadgeFecha("2026-01-07"))).toBeNull();
    expect(within(seccion).getByText(formatearBadgeFecha("2026-01-14"))).toBeTruthy();
  });

  it("sin turnos fijos: muestra 'No hay ocurrencias próximas.'", async () => {
    mockearCargas([]);
    render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
    await screen.findByText("No hay turnos fijos cargados.");
    expect(screen.getByText("No hay ocurrencias próximas.")).toBeTruthy();
  });
});

it("al cambiar de tipo de alta conserva datos, foco y cierre por Escape", async () => {
  const user = userEvent.setup();
  mockearCargas([crearTurnoFijoRow()]);
  render(<TurnosFijosViewConectada mostrarToast={vi.fn()} />);
  await within(seccionActivos()).findByText("Fijo Existente");
  const opener = screen.getByRole("button", { name: "Nuevo turno fijo" });
  await user.click(opener);
  const dialog = screen.getByRole("dialog");
  expect(document.activeElement).toBe(dialog);
  await user.type(within(dialog).getByLabelText("Nombre y apellido"), "Ana Prueba");
  const existente = within(dialog).getByRole("button", { name: "Titular existente" });
  await user.click(existente);
  expect(document.activeElement).toBe(existente);
  await user.click(within(dialog).getByRole("button", { name: "Titular" }));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBe(dialog);
  await user.click(within(dialog).getByRole("button", { name: "Nuevo titular" }));
  expect((within(dialog).getByLabelText("Nombre y apellido") as HTMLInputElement).value).toBe("Ana Prueba");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});
