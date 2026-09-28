/** @vitest-environment jsdom */
// Tests de PublicReservarView (PUBLIC-R3). Mockea reservations.api (misma
// capa de transporte que usePublicHoy.test.ts / useReservaForm.test.ts) para
// controlar franja/configuración/reservas/crear_reserva sin Supabase real.
//
// "Ahora" se fija con vi.useFakeTimers({ toFake: ["Date"] }) — solo el reloj,
// nunca los timers: si se fakeara setTimeout/setInterval también, los
// waitFor() de este archivo (que dependen de efectos async reales) dejarían
// de resolver. Sin esto, los horarios "disponibles" dependerían de la hora
// real a la que corre el test (esHoy/corteMin en horasInicioDisponibles).
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReservaPublica } from "../reservations-public/reservations.types";
import { PublicReservarView } from "./PublicReservarView";

const obtenerFranjaOperativaMock = vi.hoisted(() => vi.fn());
const obtenerConfiguracionReservasMock = vi.hoisted(() => vi.fn());
const obtenerTurnosFijosPublicosMock = vi.hoisted(() => vi.fn());
const obtenerExcepcionesTurnoFijoMock = vi.hoisted(() => vi.fn());
const obtenerReservasPublicasPorFechaMock = vi.hoisted(() => vi.fn());
const crearReservaMock = vi.hoisted(() => vi.fn());
const cotizarReservaMock = vi.hoisted(() => vi.fn());
// CFG-F1.1 — nombre/WhatsApp reales de la cancha (useDatosPublicosCancha).
const obtenerDatosPublicosCanchaMock = vi.hoisted(() => vi.fn());

// FINAL-F5-B — en jsdom api.js de Turnstile nunca carga: se mockea el hook entero.
const turnstileMock = vi.hoisted(() => ({
  token: "token-de-prueba" as string | null,
  estado: "listo" as "cargando" | "listo" | "error",
  reiniciar: vi.fn(),
}));
vi.mock("../reservations-public/useTurnstile", () => ({
  useTurnstile: () => ({ contenedorRef: () => {}, ...turnstileMock }),
}));

vi.mock("../reservations-public/reservations.api", () => ({
  obtenerFranjaOperativa: obtenerFranjaOperativaMock,
  obtenerConfiguracionReservas: obtenerConfiguracionReservasMock,
  obtenerTurnosFijosPublicos: obtenerTurnosFijosPublicosMock,
  obtenerExcepcionesTurnoFijo: obtenerExcepcionesTurnoFijoMock,
  obtenerReservasPublicasPorFecha: obtenerReservasPublicasPorFechaMock,
  crearReserva: crearReservaMock,
  cotizarReserva: cotizarReservaMock,
  obtenerDatosPublicosCancha: obtenerDatosPublicosCanchaMock,
}));

const CONFIG_ROW = {
  duracion_minima_minutos: 60,
  duracion_maxima_minutos: 180,
  anticipacion_maxima_dias: 14,
  anticipacion_minima_minutos: 0,
  limite_reservas_activas_telefono: 3,
  cancelacion_horas_minimas: 4,
};

function mockearBase(opts: { franjaRow: unknown; reservas?: ReservaPublica[] }) {
  obtenerFranjaOperativaMock.mockResolvedValue({ data: opts.franjaRow, error: null });
  obtenerConfiguracionReservasMock.mockResolvedValue({ data: CONFIG_ROW, error: null });
  obtenerTurnosFijosPublicosMock.mockResolvedValue({ data: [], error: null });
  obtenerExcepcionesTurnoFijoMock.mockResolvedValue({ data: [], error: null });
  obtenerReservasPublicasPorFechaMock.mockResolvedValue({ data: opts.reservas ?? [], error: null });
}

async function renderYEsperarCarga(onNavegar = vi.fn()) {
  render(<PublicReservarView onNavegar={onNavegar} />);
  await waitFor(() => expect(screen.getAllByRole("button", { name: /^\d{2}:\d{2}$/ }).length).toBeGreaterThan(0));
  return onNavegar;
}

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
  turnstileMock.token = "token-de-prueba";
  turnstileMock.estado = "listo";
  turnstileMock.reiniciar.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T06:00:00"));
  // Default neutro: ningún test de "duración dinámica"/"pasos" verifica precio,
  // así que alcanza con que la RPC resuelva algo. Los tests de precio pisan
  // este mock con lo que necesiten.
  cotizarReservaMock.mockResolvedValue({ data: 20000, error: null });
  // Default neutro: ningún test de este archivo verifica el nombre/WhatsApp
  // de la cancha, solo que el flujo de reserva no se bloquee esperándolos.
  obtenerDatosPublicosCanchaMock.mockResolvedValue({
    data: {
      nombre_cancha: "Los amigos padel",
      whatsapp_numero: "5493775550100",
      instagram_url: null,
      direccion: "Monte Caseros, Corrientes",
      mapa_lat: -30.242812,
      mapa_lng: -57.655903,
    },
    error: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  cleanup();
});

describe("PublicReservarView — duración dinámica (nunca hardcodeada)", () => {
  it("genera opciones cada 30 min entre la duración mínima y máxima reales", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));

    expect(screen.getByText("1 hora")).toBeTruthy();
    expect(screen.getByText("1h 30")).toBeTruthy();
    expect(screen.getByText("2 horas")).toBeTruthy();
    expect(screen.getByText("2h 30")).toBeTruthy();
    expect(screen.getByText("3 horas")).toBeTruthy();
  });

  it("usa duracionMinima/duracionMaxima de la configuración, no 60/90/120 fijos", async () => {
    obtenerFranjaOperativaMock.mockResolvedValue({
      data: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }],
      error: null,
    });
    obtenerConfiguracionReservasMock.mockResolvedValue({
      data: { ...CONFIG_ROW, duracion_minima_minutos: 90, duracion_maxima_minutos: 120 },
      error: null,
    });
    obtenerTurnosFijosPublicosMock.mockResolvedValue({ data: [], error: null });
    obtenerExcepcionesTurnoFijoMock.mockResolvedValue({ data: [], error: null });
    obtenerReservasPublicasPorFechaMock.mockResolvedValue({ data: [], error: null });
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));

    expect(screen.getByText("1h 30")).toBeTruthy();
    expect(screen.getByText("2 horas")).toBeTruthy();
    expect(screen.queryByText("1 hora")).toBeNull();
    expect(screen.queryByText("2h 30")).toBeNull();
  });

  it("una reserva ya ocupada recorta las duraciones (respeta la ocupación real)", async () => {
    mockearBase({
      franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }],
      reservas: [
        {
          id: "x",
          fecha: "2026-01-01",
          hora_inicio: "11:00:00",
          hora_fin: "12:00:00",
          confirmada: true,
          bloqueado: false,
          creado: new Date().toISOString(),
        } as ReservaPublica,
      ],
    });
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));

    // El próximo turno ocupado empieza a las 11:00 -> el único fin posible
    // desde las 10:00 es 11:00 (60 min); 90/120/150/180 ya no caben.
    expect(screen.getByText("1 hora")).toBeTruthy();
    expect(screen.queryByText("1h 30")).toBeNull();
  });

  it("respeta el cruce de medianoche al calcular las duraciones", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "20:00:00", hora_cierre: "02:00:00" }] });
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "23:00" }));

    // 23:00 + 3 horas cruza medianoche -> 02:00 del día siguiente, dentro del
    // horario extendido (cierre 02:00) — debe seguir ofreciéndose.
    expect(screen.getByText("3 horas")).toBeTruthy();
  });
});

describe("PublicReservarView — precio (cotización real, nunca inventada)", () => {
  // Todos estos tests mockean cotizar_reserva con valores que NUNCA coinciden
  // con horas * configCancha.precioHora (20000/hora): si el componente
  // volviera a usar calcularPrecioEstimado (u otro cálculo local) en algún
  // punto, estas aserciones lo detectarían.

  it("precio base: el precio mostrado es el que devuelve cotizar_reserva, no horas * precioHora local", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    cotizarReservaMock.mockResolvedValue({ data: 17500, error: null }); // != 20000 (60min * precioHora)
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));

    await waitFor(() => expect(screen.getAllByText("$17.500").length).toBeGreaterThan(0));
    expect(screen.queryByText("$20.000")).toBeNull();
    expect(cotizarReservaMock).toHaveBeenCalledWith("2026-01-01", "10:00", "11:00");
  });

  it("duración: cada chip refleja su propio precio de cotizar_reserva, sin repetir un múltiplo fijo", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    const precios: Record<string, number> = { "11:00": 17000, "12:00": 32500, "13:00": 42000 };
    cotizarReservaMock.mockImplementation((_fecha: string, _horaInicio: string, horaFin: string) =>
      Promise.resolve({ data: precios[horaFin] ?? 0, error: null }),
    );
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));

    await waitFor(() => expect(screen.getByText("$17.000")).toBeTruthy());
    expect(screen.getByText("$32.500")).toBeTruthy(); // no es 2x el de 60min
    expect(screen.getByText("$42.000")).toBeTruthy(); // no es 3x el de 60min
  });

  it("franja horaria: un descuento de franja aplicado server-side se muestra tal cual, sin corregirlo en el cliente", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    cotizarReservaMock.mockResolvedValue({ data: 15000, error: null }); // < 20000: descuento de franja simulado
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));

    await waitFor(() => expect(screen.getAllByText("$15.000").length).toBeGreaterThan(0));
    expect(screen.queryByText("$20.000")).toBeNull();
  });

  it("fecha especial: una tarifa fija/especial server-side se muestra tal cual, sin recalcularla contra precioHora", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    cotizarReservaMock.mockResolvedValue({ data: 50000, error: null }); // > 20000: tarifa especial simulada
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));

    await waitFor(() => expect(screen.getAllByText("$50.000").length).toBeGreaterThan(0));
    expect(screen.queryByText("$20.000")).toBeNull();
  });

  it("prioridad: el valor que devuelve el servidor se respeta tal cual, aunque no sea múltiplo del precioHora local", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    cotizarReservaMock.mockResolvedValue({ data: 13333, error: null }); // valor "raro", imposible de derivar de 20000/hora
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));

    await waitFor(() => expect(screen.getAllByText("$13.333").length).toBeGreaterThan(0));
  });

  it("cambio rápido entre horarios: nunca queda mostrado el precio de una tanda vieja (anti-carrera)", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    const resolvers: Array<() => void> = [];
    cotizarReservaMock.mockImplementation((_fecha: string, horaInicio: string) => {
      if (horaInicio === "10:00") {
        // Tanda vieja: queda pendiente a propósito, se resuelve recién al final.
        return new Promise((resolve) => {
          resolvers.push(() => resolve({ data: 999, error: null }));
        });
      }
      return Promise.resolve({ data: 24000, error: null });
    });
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" })); // dispara tanda lenta, no resuelve
    await userEvent.click(screen.getByRole("button", { name: "11:00" })); // cambia de horaInicio antes de que resuelva

    await waitFor(() => expect(screen.getAllByText("$24.000").length).toBeGreaterThan(0));

    // La tanda vieja (10:00) resuelve tarde: no debe pisar el precio vigente.
    resolvers.forEach((resolver) => resolver());
    await waitFor(() => expect(screen.getAllByText("$24.000").length).toBeGreaterThan(0));
    expect(screen.queryByText("$999")).toBeNull();
  });

  it("cotización pendiente: no muestra 'Calculando…' como texto protagonista ni un precio viejo", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    const resolvers: Array<() => void> = [];
    cotizarReservaMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(() => resolve({ data: 20000, error: null }));
        }),
    );
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));

    // Mientras la cotización está en vuelo: el precio se reemplaza por un
    // estado visual sutil (skeleton), nunca por un precio viejo/inventado ni
    // por un texto "Calculando…" visible (el único rastro es un anuncio
    // sr-only para lectores de pantalla).
    expect(document.querySelector(".skeleton-shimmer")).toBeTruthy();
    expect(screen.queryByText(/^\$/)).toBeNull();

    resolvers.forEach((resolver) => resolver());
    await waitFor(() => expect(screen.getAllByText("$20.000").length).toBeGreaterThan(0));
  });

  it("error de cotización: avisa claramente y no aparenta un precio inventado", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    cotizarReservaMock.mockResolvedValue({ data: null, error: { message: "network error" } });
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));

    await waitFor(() => expect(screen.getByText(/No pudimos calcular el precio/)).toBeTruthy());
    expect(screen.getAllByText("No disponible").length).toBeGreaterThan(0);
    expect(screen.queryByText("$20.000")).toBeNull();
  });

  it("éxito sigue usando el precio devuelto por crear_reserva, no el estimado de cotizar_reserva", async () => {
    cotizarReservaMock.mockResolvedValue({ data: 17500, error: null });
    crearReservaMock.mockResolvedValue({ data: { precio: 27000 }, error: null });
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));
    await waitFor(() => expect(screen.getAllByText("$17.500").length).toBeGreaterThan(0));
    await userEvent.click(screen.getByText("1 hora"));
    await userEvent.type(screen.getByLabelText("Nombre y apellido"), "Juan Perez");
    await userEvent.type(screen.getByLabelText("Teléfono"), "3775000000");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));

    await waitFor(() => expect(screen.getByText("¡Turno reservado!")).toBeTruthy());
    expect(screen.getByText("$27.000")).toBeTruthy();
    expect(screen.queryByText("$17.500")).toBeNull();
  });
});

describe("PublicReservarView — pasos, volver y estados", () => {
  it("día cerrado: no ofrece horarios y avisa en vez de mostrar una grilla vacía", async () => {
    mockearBase({ franjaRow: [{ cerrado: true, hora_apertura: null, hora_cierre: null }] });
    render(<PublicReservarView onNavegar={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/cancha está cerrada este día/)).toBeTruthy());
    expect(screen.queryAllByRole("button", { name: /^\d{2}:\d{2}$/ }).length).toBe(0);
  });

  it("progressive disclosure: duración y datos solo aparecen tras elegir hora/duración", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    await renderYEsperarCarga();

    expect(screen.queryByText("1 hora")).toBeNull();
    expect(screen.queryByLabelText("Nombre y apellido")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));
    expect(screen.getByText("1 hora")).toBeTruthy();
    expect(screen.queryByLabelText("Nombre y apellido")).toBeNull();

    await userEvent.click(screen.getByText("1 hora"));
    expect(screen.getByLabelText("Nombre y apellido")).toBeTruthy();
  });

  it("volver deshace un paso por vez y recién al final sale a Inicio", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    const onNavegar = await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));
    await userEvent.click(screen.getByText("1 hora"));
    expect(screen.getByLabelText("Nombre y apellido")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.queryByLabelText("Nombre y apellido")).toBeNull();
    expect(screen.getByText("1 hora")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.queryByText("1 hora")).toBeNull();
    expect(onNavegar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(onNavegar).toHaveBeenCalledWith("home");
  });

  it("volver conserva las selecciones ya hechas: no las borra, solo oculta el paso siguiente", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));
    await userEvent.click(screen.getByText("1 hora"));
    await userEvent.type(screen.getByLabelText("Nombre y apellido"), "Juan Perez");

    // Paso 3 -> Paso 2: la duración elegida sigue marcada como activa.
    await userEvent.click(screen.getByRole("button", { name: "Volver" }));
    const chipDuracion = screen.getByText("1 hora").closest("button") as HTMLButtonElement;
    expect(chipDuracion.getAttribute("aria-pressed")).toBe("true");

    // Paso 2 -> Paso 1: el horario de inicio elegido sigue marcado como activo.
    await userEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByRole("button", { name: "10:00" }).getAttribute("aria-pressed")).toBe("true");

    // Re-clickear el mismo horario (no cambia nada) solo avanza la vista: la
    // duración ya elegida se conserva, no hace falta volver a elegirla.
    await userEvent.click(screen.getByRole("button", { name: "10:00" }));
    expect(screen.getByText("1 hora").closest("button")?.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByText("1 hora"));
    expect((screen.getByLabelText("Nombre y apellido") as HTMLInputElement).value).toBe("Juan Perez");
  });

  it("cambiar un horario de inicio ya elegido invalida la duración dependiente, sin perder nombre/teléfono", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));
    await userEvent.click(screen.getByText("1 hora"));
    await userEvent.type(screen.getByLabelText("Nombre y apellido"), "Juan Perez");
    await userEvent.type(screen.getByLabelText("Teléfono"), "3775000000");

    // Cambiar el horario de inicio directamente (sin pasar por Volver) es
    // "cambiar un dato anterior": invalida la duración y oculta Datos de nuevo.
    await userEvent.click(screen.getByRole("button", { name: "11:00" }));
    expect(screen.queryByLabelText("Nombre y apellido")).toBeNull();

    await userEvent.click(screen.getByText("1 hora"));
    expect((screen.getByLabelText("Nombre y apellido") as HTMLInputElement).value).toBe("Juan Perez");
    expect((screen.getByLabelText("Teléfono") as HTMLInputElement).value).toBe("3775000000");
  });

  it("evita doble submit: el botón de confirmar se deshabilita mientras guarda", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    let resolverCrear: (v: unknown) => void = () => {};
    crearReservaMock.mockReturnValue(
      new Promise((resolve) => {
        resolverCrear = resolve;
      }),
    );
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));
    await userEvent.click(screen.getByText("1 hora"));
    await userEvent.type(screen.getByLabelText("Nombre y apellido"), "Juan Perez");
    await userEvent.type(screen.getByLabelText("Teléfono"), "3775000000");

    const boton = screen.getByRole("button", { name: "Confirmar reserva" }) as HTMLButtonElement;
    await userEvent.click(boton);
    expect(boton.disabled).toBe(true);

    resolverCrear({ data: { precio: 20000 }, error: null });
    await waitFor(() => expect(screen.getByText("¡Turno reservado!")).toBeTruthy());
  });

  it("F5-A: los inputs de nombre y teléfono tienen maxLength (80 y 20)", async () => {
    cotizarReservaMock.mockResolvedValue({ data: 17500, error: null });
    crearReservaMock.mockResolvedValue({ data: { precio: 27000 }, error: null });
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
    await renderYEsperarCarga();

    await userEvent.click(screen.getByRole("button", { name: "10:00" }));
    await waitFor(() => expect(screen.getAllByText("$17.500").length).toBeGreaterThan(0));
    await userEvent.click(screen.getByText("1 hora"));
    expect((screen.getByLabelText("Nombre y apellido") as HTMLInputElement).maxLength).toBe(80);
    expect((screen.getByLabelText("Teléfono") as HTMLInputElement).maxLength).toBe(20);
  });
  describe("FINAL-F5-B — Turnstile", () => {
    async function llegarAlFormulario() {
      mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00:00", hora_cierre: "23:00:00" }] });
      await renderYEsperarCarga();
      await userEvent.click(screen.getByRole("button", { name: "10:00" }));
      await userEvent.click(screen.getByText("1 hora"));
      await userEvent.type(screen.getByLabelText("Nombre y apellido"), "Juan Perez");
      await userEvent.type(screen.getByLabelText("Teléfono"), "3775000000");
    }

    it("Confirmar queda bloqueado hasta tener una verificación válida y avisa que está verificando", async () => {
      turnstileMock.token = null;
      turnstileMock.estado = "cargando";
      await llegarAlFormulario();

      expect((screen.getByRole("button", { name: "Confirmar reserva" }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText("Verificando tu conexión…")).toBeTruthy();
      await userEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));
      expect(crearReservaMock).not.toHaveBeenCalled();
    });

    it("con verificación lista el botón se habilita y el token viaja como 2º argumento", async () => {
      crearReservaMock.mockResolvedValue({ data: { precio: 27000 }, error: null });
      await llegarAlFormulario();

      const boton = screen.getByRole("button", { name: "Confirmar reserva" }) as HTMLButtonElement;
      expect(boton.disabled).toBe(false);
      await userEvent.click(boton);
      await waitFor(() => expect(screen.getByText("¡Turno reservado!")).toBeTruthy());
      expect(crearReservaMock.mock.calls[0]![1]).toBe("token-de-prueba");
      expect(turnstileMock.reiniciar).toHaveBeenCalledTimes(1);
    });

    it("si el servidor rechaza la verificación: mensaje claro y el widget se reinicia", async () => {
      crearReservaMock.mockResolvedValue({ data: null, error: { message: "TURNSTILE_FALLIDO" } });
      await llegarAlFormulario();

      await userEvent.click(screen.getByRole("button", { name: "Confirmar reserva" }));
      await waitFor(() => expect(screen.getByText(/No pudimos verificar que sos una persona/)).toBeTruthy());
      expect(document.activeElement).toBe(screen.getByText(/No pudimos verificar que sos una persona/));
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "center" });
      expect(turnstileMock.reiniciar).toHaveBeenCalledTimes(1);
    });

    it("con error de verificación se ofrece Reintentar, que reinicia el widget", async () => {
      turnstileMock.token = null;
      turnstileMock.estado = "error";
      await llegarAlFormulario();

      expect(screen.getByText(/No pudimos completar la verificación de seguridad/)).toBeTruthy();
      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
      expect(turnstileMock.reiniciar).toHaveBeenCalledTimes(1);
    });
  });
});

describe("disponibilidad, precio y foco", () => {
  it.each(["fijos", "excepciones", "franja"])("%s falla: no ofrece horas, retry recupera", async (fuente) => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00", hora_cierre: "23:00" }] });
    const mock = fuente === "fijos" ? obtenerTurnosFijosPublicosMock : fuente === "excepciones" ? obtenerExcepcionesTurnoFijoMock : obtenerFranjaOperativaMock;
    mock.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    render(<PublicReservarView onNavegar={vi.fn()} />);
    await screen.findByRole("button", { name: "Reintentar disponibilidad" });
    expect(screen.queryByRole("button", { name: "10:00" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar disponibilidad" }));
    await screen.findByRole("button", { name: "10:00" });
  });
  it("cotizacion fallida bloquea duracion hasta retry; siguiente paso recibe foco", async () => {
    mockearBase({ franjaRow: [{ cerrado: false, hora_apertura: "08:00", hora_cierre: "23:00" }] });
    cotizarReservaMock.mockResolvedValue({ data: null, error: { message: "offline" } });
    await renderYEsperarCarga();
    await userEvent.click(screen.getByRole("button", { name: "10:00" }));
    expect(document.activeElement?.getAttribute("aria-labelledby")).toBe("duracion-titulo");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    await screen.findByRole("button", { name: "Reintentar precio" });
    expect((screen.getByRole("button", { name: /1 hora/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).toBeNull();
    cotizarReservaMock.mockResolvedValue({ data: 20000, error: null });
    await userEvent.click(screen.getByRole("button", { name: "Reintentar precio" }));
    await waitFor(() => expect((screen.getByRole("button", { name: /1 hora/ }) as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: /1 hora/ }));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Tus datos");
  });
});
