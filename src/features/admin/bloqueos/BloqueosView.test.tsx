/** @vitest-environment jsdom */
// Tests de C4 — BloqueosView: alta de horarios (validación, SIN chequeo de
// solape) y desbloqueo. Reusa reservas.api.ts/reservas.logic.ts (bloqueo =
// fila de `reservas` con bloqueado:true) — se mockea a ese nivel, no un
// dominio propio. C5 agrega la lista negra de teléfonos (dominio propio,
// telefonosBloqueados.api.ts).

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "../../../types/database.types";
import { cancelarReserva, crearBloqueo, obtenerReservasProximas } from "../reservas/reservas.api";
import { BloqueosView } from "./BloqueosView";
import { obtenerFranjaOperativa } from "../../reservations-public/reservations.api";
import { bloquearTelefono, desbloquearTelefono, obtenerTelefonosBloqueados } from "./telefonosBloqueados.api";

vi.mock("../reservas/reservas.api", () => ({
  obtenerReservasProximas: vi.fn(),
  crearBloqueo: vi.fn(),
  cancelarReserva: vi.fn(),
}));

vi.mock("./telefonosBloqueados.api", () => ({
  obtenerTelefonosBloqueados: vi.fn(),
  bloquearTelefono: vi.fn(),
  desbloquearTelefono: vi.fn(),
}));

// CFG-F2 — horario real del día elegido (useFranjaOperativa), reemplaza el
// 08:00-01:00 hardcodeado de configCancha.
vi.mock("../../reservations-public/reservations.api", () => ({
  obtenerFranjaOperativa: vi.fn(),
}));

// Miércoles fijo, dentro del horario de apertura (08:00-01:00 del día
// siguiente) — mismo criterio que el resto de los tests del módulo admin.
const AHORA_FIJO = new Date("2026-01-07T12:00:00-03:00");

beforeEach(() => {
  vi.setSystemTime(AHORA_FIJO);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function crearBloqueoRow(overrides: Partial<Tables<"reservas">> = {}): Tables<"reservas"> {
  return {
    id: "b1",
    fecha: "2026-01-07",
    hora_inicio: "10:00:00",
    hora_fin: "10:30:00",
    nombre: "Bloqueado",
    telefono: "-",
    precio: 0,
    creado: new Date().toISOString(),
    bloqueado: true,
    confirmada: true,
    pago_efectivo: 0,
    pago_transferencia: 0,
    turno_fijo_id: null,
    telefono_normalizado: null,
    hora_apertura_vigente: null,
    ...overrides,
  };
}

function crearTelefonoBloqueadoRow(
  overrides: Partial<Tables<"telefonos_bloqueados">> = {},
): Tables<"telefonos_bloqueados"> {
  return {
    telefono: "3775123456",
    telefono_normalizado: "3775123456",
    motivo: null,
    creado: new Date().toISOString(),
    ...overrides,
  };
}

function mockearCargas(
  bloqueosExistentes: Tables<"reservas">[] = [],
  telefonosExistentes: Tables<"telefonos_bloqueados">[] = [],
) {
  vi.mocked(obtenerReservasProximas).mockResolvedValue({ data: bloqueosExistentes, error: null } as never);
  vi.mocked(cancelarReserva).mockResolvedValue({ error: null } as never);
  vi.mocked(obtenerTelefonosBloqueados).mockResolvedValue({ data: telefonosExistentes, error: null } as never);
  vi.mocked(bloquearTelefono).mockResolvedValue({ data: null, error: null } as never);
  vi.mocked(desbloquearTelefono).mockResolvedValue({ error: null } as never);
  // Mismo horario 08:00-01:00 que antes tenía configCancha hardcodeado —
  // preserva las opciones que ya esperan los tests de este archivo.
  vi.mocked(obtenerFranjaOperativa).mockResolvedValue({
    data: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "01:00:00" }],
    error: null,
  } as never);
}

// R4 — Hora inicio/Hora fin pasaron de ChipSelector a Select; el form de
// horarios además ahora vive detrás del tab "Horarios" (activo por default).
async function completarForm(
  user: ReturnType<typeof userEvent.setup>,
  { horaInicio = "10:00", horaFin = "10:30" }: { horaInicio?: string; horaFin?: string } = {},
) {
  if (horaInicio) { await user.click(screen.getByRole("button", { name: "Hora inicio" })); await user.click(screen.getByRole("option", { name: horaInicio })); }
  if (horaFin) { await user.click(screen.getByRole("button", { name: "Hora fin" })); await user.click(screen.getByRole("option", { name: horaFin })); }
}

describe("BloqueosView — validación", () => {
  it("sin hora inicio/fin: no llama a crearBloqueo y muestra error", async () => {
    const user = userEvent.setup();
    mockearCargas();
    render(<BloqueosView mostrarToast={vi.fn()} />);
    await screen.findByText("No hay horarios bloqueados.");

    await user.click(screen.getByRole("button", { name: "Bloquear horario" }));

    expect(screen.getByText("Completá fecha, inicio y fin.")).toBeTruthy();
    expect(crearBloqueo).not.toHaveBeenCalled();
  });
});

// CFG-F2 — el horario ofrecido sale de franja_operativa (horarios_semana +
// fecha especial), nunca de un 08:00-01:00 hardcodeado: un día cerrado no
// debe ofrecer ningún horario para bloquear.
describe("BloqueosView — horario real del día (CFG-F2)", () => {
  it("día cerrado: no ofrece horarios y avisa en vez de caer a 08:00-01:00", async () => {
    mockearCargas();
    vi.mocked(obtenerFranjaOperativa).mockResolvedValue({
      data: [{ cerrado: true, hora_apertura: null, hora_cierre: null }],
      error: null,
    } as never);
    render(<BloqueosView mostrarToast={vi.fn()} />);
    await screen.findByText("No hay horarios bloqueados.");

    expect(await screen.findByText(/cancha está cerrada ese día/)).toBeTruthy();
    const selectHoraInicio = screen.getByLabelText("Hora inicio") as HTMLButtonElement;
    expect(selectHoraInicio.disabled).toBe(true);
  });
});

describe("BloqueosView — alta", () => {
  it("alta exitosa: llama crearBloqueo con fecha/inicio/fin, patchea la lista y resetea el form", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(crearBloqueo).mockResolvedValue({ data: crearBloqueoRow(), error: null } as never);

    render(<BloqueosView mostrarToast={vi.fn()} />);
    await screen.findByText("No hay horarios bloqueados.");

    await completarForm(user);
    await user.click(screen.getByRole("button", { name: "Bloquear horario" }));

    await waitFor(() => expect(crearBloqueo).toHaveBeenCalledWith("2026-01-07", "10:00", "10:30"));
    expect(screen.getByText("Horario bloqueado.")).toBeTruthy();
    expect(await screen.findByText("10:00-10:30")).toBeTruthy();
    expect(screen.queryByText("No hay horarios bloqueados.")).toBeNull();
    // Hora inicio/fin se resetean tras el alta (la fecha se mantiene,
    // admin.html:2083): sin horaInicio, opcionesFinDesde devuelve [] — el
    // Select de "Hora fin" queda deshabilitado, sin más opción que el
    // placeholder.
    const selectHoraFin = screen.getByLabelText("Hora fin") as HTMLButtonElement;
    expect(selectHoraFin.disabled).toBe(true);
    expect(selectHoraFin.getAttribute("aria-expanded")).toBe("false");
  });

  it("dos bloqueos que se superponen se crean igual, sin ningún error (SIN chequeo de solape — paridad legacy)", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(crearBloqueo)
      .mockResolvedValueOnce({ data: crearBloqueoRow({ id: "b1" }), error: null } as never)
      .mockResolvedValueOnce({ data: crearBloqueoRow({ id: "b2" }), error: null } as never);

    render(<BloqueosView mostrarToast={vi.fn()} />);
    await screen.findByText("No hay horarios bloqueados.");

    // Primer bloqueo 10:00-10:30.
    await completarForm(user, { horaInicio: "10:00", horaFin: "10:30" });
    await user.click(screen.getByRole("button", { name: "Bloquear horario" }));
    await waitFor(() => expect(crearBloqueo).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("No se pudo bloquear el horario.")).toBeNull();

    // Segundo bloqueo, mismo horario exacto (10:00-10:30): se crea igual, sin
    // ningún mensaje de error de solape (no existe ese chequeo en esta vista).
    await completarForm(user, { horaInicio: "10:00", horaFin: "10:30" });
    await user.click(screen.getByRole("button", { name: "Bloquear horario" }));

    await waitFor(() => expect(crearBloqueo).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("No se pudo bloquear el horario.")).toBeNull();
    expect(screen.getAllByText("10:00-10:30")).toHaveLength(2);
  });

  it("error al crear: mensaje inline, sin patch local (no aparece en la lista)", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(crearBloqueo).mockResolvedValue({ data: null, error: { message: "fallo" } } as never);

    render(<BloqueosView mostrarToast={vi.fn()} />);
    await screen.findByText("No hay horarios bloqueados.");

    await completarForm(user);
    await user.click(screen.getByRole("button", { name: "Bloquear horario" }));

    await waitFor(() => expect(screen.getByText("No se pudo bloquear el horario.")).toBeTruthy());
    expect(screen.getByText("No hay horarios bloqueados.")).toBeTruthy();
  });

  it("error de solape (EXCLUDE constraint, 23P01): mensaje específico en vez del error crudo de Postgres (E4.3.3)", async () => {
    const user = userEvent.setup();
    mockearCargas([]);
    vi.mocked(crearBloqueo).mockResolvedValue({
      data: null,
      error: { code: "23P01", message: "conflicting key value violates exclusion constraint" },
    } as never);

    render(<BloqueosView mostrarToast={vi.fn()} />);
    await screen.findByText("No hay horarios bloqueados.");

    await completarForm(user);
    await user.click(screen.getByRole("button", { name: "Bloquear horario" }));

    await waitFor(() =>
      expect(screen.getByText("El horario se superpone con una reserva o bloqueo existente.")).toBeTruthy(),
    );
    expect(screen.getByText("No hay horarios bloqueados.")).toBeTruthy();
  });
});

describe("BloqueosView — listado y desbloqueo", () => {
  it("sin bloqueos: muestra 'No hay horarios bloqueados.'", async () => {
    mockearCargas([]);
    render(<BloqueosView mostrarToast={vi.fn()} />);
    await screen.findByText("No hay horarios bloqueados.");
  });

  it("lista los horarios bloqueados existentes (ignora filas no bloqueadas)", async () => {
    mockearCargas([
      crearBloqueoRow({ id: "b1", fecha: "2026-01-07", hora_inicio: "10:00:00", hora_fin: "10:30:00" }),
      { ...crearBloqueoRow({ id: "r1" }), bloqueado: false, nombre: "Juan", telefono: "3771111111" },
    ]);
    render(<BloqueosView mostrarToast={vi.fn()} />);

    expect(await screen.findByText("10:00-10:30")).toBeTruthy();
    expect(screen.queryByText(/Juan/)).toBeNull();
  });

  it("desbloquear con éxito: llama cancelarReserva con el id y la fila desaparece", async () => {
    const user = userEvent.setup();
    mockearCargas([crearBloqueoRow({ id: "b1" })]);
    render(<BloqueosView mostrarToast={vi.fn()} />);
    await screen.findByText("10:00-10:30");

    await user.click(screen.getByRole("button", { name: "Desbloquear" }));

    expect(cancelarReserva).toHaveBeenCalledWith("b1");
    await waitFor(() => expect(screen.queryByText("10:00-10:30")).toBeNull());
    expect(screen.getByText("No hay horarios bloqueados.")).toBeTruthy();
  });

  it("desbloquear con error: toast de error, la fila sigue en la lista", async () => {
    const user = userEvent.setup();
    mockearCargas([crearBloqueoRow({ id: "b1" })]);
    vi.mocked(cancelarReserva).mockResolvedValue({ error: { message: "fallo" } } as never);
    const mostrarToast = vi.fn();

    render(<BloqueosView mostrarToast={mostrarToast} />);
    await screen.findByText("10:00-10:30");

    await user.click(screen.getByRole("button", { name: "Desbloquear" }));

    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith("No se pudo desbloquear. Probá de nuevo.", "error"));
    expect(screen.getByText("10:00-10:30")).toBeTruthy();
  });
});

// R4 — "Teléfonos" ahora es un tab aparte (activo "Horarios" por default):
// cada test entra a ese tab antes de tocar su contenido.
async function irATabTelefonos(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Teléfonos" }));
}

describe("BloqueosView — teléfonos bloqueados (C5)", () => {
  it("sin teléfonos bloqueados: muestra 'No hay teléfonos bloqueados.'", async () => {
    const user = userEvent.setup();
    mockearCargas();
    render(<BloqueosView mostrarToast={vi.fn()} />);
    await irATabTelefonos(user);
    await screen.findByText("No hay teléfonos bloqueados.");
  });

  it("lista teléfonos bloqueados, con y sin motivo", async () => {
    const user = userEvent.setup();
    mockearCargas([], [
      crearTelefonoBloqueadoRow({ telefono: "3771111111", motivo: "no se presentó varias veces" }),
      crearTelefonoBloqueadoRow({ telefono: "3772222222", motivo: null }),
    ]);
    render(<BloqueosView mostrarToast={vi.fn()} />);
    await irATabTelefonos(user);

    expect(await screen.findByText("3771111111")).toBeTruthy();
    expect(screen.getByText("no se presentó varias veces")).toBeTruthy();
    expect(screen.getByText("3772222222")).toBeTruthy();
  });

  it("teléfono vacío: error inline, no llama a bloquearTelefono (mejora aprobada sobre el legacy)", async () => {
    const user = userEvent.setup();
    mockearCargas();
    render(<BloqueosView mostrarToast={vi.fn()} />);
    await irATabTelefonos(user);
    await screen.findByText("No hay teléfonos bloqueados.");

    await user.click(screen.getByRole("button", { name: "Bloquear teléfono" }));

    expect(screen.getByText("Ingresá un teléfono.")).toBeTruthy();
    expect(bloquearTelefono).not.toHaveBeenCalled();
  });

  it("alta exitosa con motivo: llama bloquearTelefono, resetea el form, toast ok y aparece en la lista", async () => {
    const user = userEvent.setup();
    mockearCargas();
    vi.mocked(bloquearTelefono).mockResolvedValue({
      data: crearTelefonoBloqueadoRow({ telefono: "3775123456", motivo: "reincidente" }),
      error: null,
    } as never);
    const mostrarToast = vi.fn();

    render(<BloqueosView mostrarToast={mostrarToast} />);
    await irATabTelefonos(user);
    await screen.findByText("No hay teléfonos bloqueados.");

    await user.type(screen.getByPlaceholderText("Ej: 3775123456"), "3775123456");
    await user.type(screen.getByPlaceholderText("Ej: no se presentó varias veces"), "reincidente");
    await user.click(screen.getByRole("button", { name: "Bloquear teléfono" }));

    await waitFor(() => expect(bloquearTelefono).toHaveBeenCalledWith("3775123456", "reincidente"));
    expect(mostrarToast).toHaveBeenCalledWith("Teléfono bloqueado.", "ok");
    expect(await screen.findByText("3775123456")).toBeTruthy();
    expect(screen.queryByText("No hay teléfonos bloqueados.")).toBeNull();
    expect((screen.getByPlaceholderText("Ej: 3775123456") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("Ej: no se presentó varias veces") as HTMLInputElement).value).toBe("");
  });

  it("motivo vacío: se llama a bloquearTelefono con null, no con cadena vacía", async () => {
    const user = userEvent.setup();
    mockearCargas();
    vi.mocked(bloquearTelefono).mockResolvedValue({
      data: crearTelefonoBloqueadoRow({ telefono: "3775123456" }),
      error: null,
    } as never);

    render(<BloqueosView mostrarToast={vi.fn()} />);
    await irATabTelefonos(user);
    await screen.findByText("No hay teléfonos bloqueados.");

    await user.type(screen.getByPlaceholderText("Ej: 3775123456"), "3775123456");
    await user.click(screen.getByRole("button", { name: "Bloquear teléfono" }));

    await waitFor(() => expect(bloquearTelefono).toHaveBeenCalledWith("3775123456", null));
  });

  it("el input de teléfono filtra caracteres no numéricos", async () => {
    const user = userEvent.setup();
    mockearCargas();
    render(<BloqueosView mostrarToast={vi.fn()} />);
    await irATabTelefonos(user);
    await screen.findByText("No hay teléfonos bloqueados.");

    await user.type(screen.getByPlaceholderText("Ej: 3775123456"), "37a7-5123456");

    expect((screen.getByPlaceholderText("Ej: 3775123456") as HTMLInputElement).value).toBe("3775123456");
  });

  it("teléfono duplicado (PK): toast con el mensaje genérico del legacy, sin patch local", async () => {
    const user = userEvent.setup();
    mockearCargas();
    vi.mocked(bloquearTelefono).mockResolvedValue({ data: null, error: { message: "duplicate key" } } as never);
    const mostrarToast = vi.fn();

    render(<BloqueosView mostrarToast={mostrarToast} />);
    await irATabTelefonos(user);
    await screen.findByText("No hay teléfonos bloqueados.");

    await user.type(screen.getByPlaceholderText("Ej: 3775123456"), "3775123456");
    await user.click(screen.getByRole("button", { name: "Bloquear teléfono" }));

    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith("No se pudo bloquear (¿ya estaba bloqueado?).", "error"),
    );
    expect(screen.getByText("No hay teléfonos bloqueados.")).toBeTruthy();
    // Sin éxito, el input no se resetea (paridad legacy).
    expect((screen.getByPlaceholderText("Ej: 3775123456") as HTMLInputElement).value).toBe("3775123456");
  });

  it("desbloquear con éxito: llama desbloquearTelefono y la fila desaparece", async () => {
    const user = userEvent.setup();
    mockearCargas([], [crearTelefonoBloqueadoRow({ telefono: "3775123456" })]);
    render(<BloqueosView mostrarToast={vi.fn()} />);
    await irATabTelefonos(user);
    await screen.findByText("3775123456");

    await user.click(screen.getByRole("button", { name: "Desbloquear" }));

    expect(desbloquearTelefono).toHaveBeenCalledWith("3775123456");
    await waitFor(() => expect(screen.queryByText("3775123456")).toBeNull());
    expect(screen.getByText("No hay teléfonos bloqueados.")).toBeTruthy();
  });

  it("desbloquear con error: toast 'No se pudo desbloquear el teléfono.', la fila sigue (mejora aprobada sobre el legacy)", async () => {
    const user = userEvent.setup();
    mockearCargas([], [crearTelefonoBloqueadoRow({ telefono: "3775123456" })]);
    vi.mocked(desbloquearTelefono).mockResolvedValue({ error: { message: "fallo" } } as never);
    const mostrarToast = vi.fn();

    render(<BloqueosView mostrarToast={mostrarToast} />);
    await irATabTelefonos(user);
    await screen.findByText("3775123456");

    await user.click(screen.getByRole("button", { name: "Desbloquear" }));

    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith("No se pudo desbloquear el teléfono.", "error"),
    );
    expect(screen.getByText("3775123456")).toBeTruthy();
  });
});

// R2 — "Descargar último backup" (E7) se mudó a BackupView (destino de
// navegación propio): sus tests viven ahora en backup/BackupView.test.tsx.
