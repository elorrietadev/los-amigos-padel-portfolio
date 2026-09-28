/** @vitest-environment jsdom */
// TF-R4 — cubre la experiencia pública de /baja/ con varios horarios por
// titular: agrupación por turno_fijo, estados de cada ocurrencia (disponible/
// fuera de plazo/cancelada), confirmación + doble submit, y que cancelar una
// fecha de un horario no afecte a los demás. Mockea baja.api (no supabase
// directo) y useDatosPublicosCancha, mismo criterio que
// usePrecioBasePublico.test.ts / PublicHomeView.test.tsx: esta pantalla no
// debe saber de dónde sale el dato. Sin jest-dom (no está instalado en este
// repo): assertions con .toBeTruthy()/.toBeNull() y accesores del DOM nativo,
// mismo estilo que PublicHomeView.test.tsx/PublicReservarView.test.tsx.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../lib/theme";
import { BajaPage } from "./BajaPage";
import type { TurnoFijoPublicoValido } from "./baja.types";

const obtenerTurnosFijosTitularPublicoMock = vi.hoisted(() => vi.fn());
const darDeBajaTurnoFijoMock = vi.hoisted(() => vi.fn());
vi.mock("./baja.api", () => ({
  obtenerTurnosFijosTitularPublico: obtenerTurnosFijosTitularPublicoMock,
  darDeBajaTurnoFijo: darDeBajaTurnoFijoMock,
}));

const useDatosPublicosCanchaMock = vi.hoisted(() => vi.fn());
vi.mock("../public-shell/useDatosPublicosCancha", () => ({
  useDatosPublicosCancha: useDatosPublicosCanchaMock,
}));

const MARTES: TurnoFijoPublicoValido["turnos"][number] = {
  turno_fijo_id: "11111111-1111-1111-1111-111111111111",
  dia_semana: 2,
  hora_inicio: "20:00",
  hora_fin: "21:30",
  ocurrencias: [
    { fecha: "2026-09-22", cancelada: false, puede_cancelar: true },
    { fecha: "2026-09-29", cancelada: false, puede_cancelar: true },
  ],
};

const JUEVES: TurnoFijoPublicoValido["turnos"][number] = {
  turno_fijo_id: "22222222-2222-2222-2222-222222222222",
  dia_semana: 4,
  hora_inicio: "22:00",
  hora_fin: "23:30",
  ocurrencias: [
    { fecha: "2026-09-24", cancelada: false, puede_cancelar: true },
    { fecha: "2026-10-01", cancelada: false, puede_cancelar: true },
  ],
};

function datosValidos(overrides: Partial<TurnoFijoPublicoValido> = {}): TurnoFijoPublicoValido {
  return {
    valido: true,
    nombre: "Juan Pérez",
    cancelacion_horas_minimas: 4,
    turnos: [MARTES, JUEVES],
    ...overrides,
  };
}

function irA(token: string | null) {
  const search = token ? `?t=${token}` : "";
  window.history.pushState({}, "", `/baja/${search}`);
}

function renderBajaPage() {
  return render(
    <ThemeProvider>
      <BajaPage />
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.pushState({}, "", "/baja/");
});

describe("BajaPage — estados de carga", () => {
  it("sin token en la URL muestra el mensaje de link inválido sin llamar al servidor", async () => {
    irA(null);
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: true, error: false });
    renderBajaPage();
    expect(await screen.findByText("Este link no es válido.")).toBeTruthy();
    expect(obtenerTurnosFijosTitularPublicoMock).not.toHaveBeenCalled();
  });

  it("token inválido (valido:false) muestra el mensaje específico y, si hay whatsapp, el link de contacto", async () => {
    irA("token-vencido");
    obtenerTurnosFijosTitularPublicoMock.mockResolvedValue({ data: { valido: false }, error: null });
    useDatosPublicosCanchaMock.mockReturnValue({
      datos: {
        nombreCancha: "Los Amigos",
        whatsappNumero: "5493775550100",
        instagramUrl: null,
        direccion: "",
        mapaLat: 0,
        mapaLng: 0,
      },
      loading: false,
      error: false,
    });
    renderBajaPage();
    expect(await screen.findByText("Este link no es válido o el turno fijo ya no existe.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /escribinos por whatsapp/i }).getAttribute("href")).toBe(
      "https://wa.me/5493775550100",
    );
  });

  it("error de red al cargar muestra el mensaje de error_carga", async () => {
    irA("token-1");
    obtenerTurnosFijosTitularPublicoMock.mockResolvedValue({ data: null, error: { message: "network" } });
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: false, error: false });
    renderBajaPage();
    expect(
      await screen.findByText("No se pudo cargar la información de tu turno. Probá recargar la página."),
    ).toBeTruthy();
  });

  it("titular sin turnos fijos activos muestra el estado vacío", async () => {
    irA("token-1");
    obtenerTurnosFijosTitularPublicoMock.mockResolvedValue({ data: datosValidos({ turnos: [] }), error: null });
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: false, error: false });
    renderBajaPage();
    expect(await screen.findByText("No tenés turnos fijos activos en este momento.")).toBeTruthy();
  });

  it("un horario sin próximas ocurrencias lo indica sin romper el resto de la página", async () => {
    irA("token-1");
    obtenerTurnosFijosTitularPublicoMock.mockResolvedValue({
      data: datosValidos({ turnos: [{ ...MARTES, ocurrencias: [] }] }),
      error: null,
    });
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: false, error: false });
    renderBajaPage();
    expect(await screen.findByText("No hay próximas fechas para este horario.")).toBeTruthy();
  });
});

describe("BajaPage — agrupación por horario", () => {
  it("titular con un solo horario se ve bien: un único grupo con sus ocurrencias", async () => {
    irA("token-1");
    obtenerTurnosFijosTitularPublicoMock.mockResolvedValue({ data: datosValidos({ turnos: [MARTES] }), error: null });
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: false, error: false });
    renderBajaPage();

    expect(await screen.findByText("Hola, Juan Pérez 👋")).toBeTruthy();
    expect(screen.queryByText("¿Cuál de tus turnos querés gestionar?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Volver" })).toBeNull();
    const grupo = screen.getByRole("region", { name: /martes 20:00 a 21:30/i });
    expect(within(grupo).getAllByRole("button", { name: "No voy" })).toHaveLength(2);
  });

  it("varios horarios: primero solo cards; elegir muestra sus fechas y volver restaura la selección", async () => {
    const user = userEvent.setup();
    irA("token-1");
    obtenerTurnosFijosTitularPublicoMock.mockResolvedValue({ data: datosValidos(), error: null });
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: false, error: false });
    renderBajaPage();

    const martes = await screen.findByRole("button", { name: /martes 20:00 a 21:30/i });
    expect(screen.getByRole("button", { name: /jueves 22:00 a 23:30/i })).toBeTruthy();
    expect(screen.queryByText(/22\/09|29\/09|24\/09|01\/10/)).toBeNull();
    expect(screen.queryByRole("button", { name: "No voy" })).toBeNull();

    martes.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Martes 22/09")).toBeTruthy();
    expect(screen.getByText("Martes 29/09")).toBeTruthy();
    expect(screen.queryByText(/24\/09|01\/10/)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: /martes.*20:00/i }));

    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByRole("button", { name: /martes 20:00 a 21:30/i })).toBeTruthy();
    expect(screen.queryByText(/22\/09|29\/09|24\/09|01\/10/)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "¿Cuál de tus turnos querés gestionar?" }));

    await user.click(screen.getByRole("button", { name: /jueves 22:00 a 23:30/i }));
    expect(screen.getByText("Jueves 24/09")).toBeTruthy();
    expect(screen.getByText("Jueves 01/10")).toBeTruthy();
    expect(screen.queryByText(/22\/09|29\/09/)).toBeNull();
  });

  it("ocurrencia ya cancelada no muestra botón y ocurrencia fuera de plazo tampoco", async () => {
    irA("token-1");
    obtenerTurnosFijosTitularPublicoMock.mockResolvedValue({
      data: datosValidos({
        turnos: [
          {
            ...MARTES,
            ocurrencias: [
              { fecha: "2026-09-22", cancelada: true, puede_cancelar: false },
              { fecha: "2026-09-29", cancelada: false, puede_cancelar: false },
            ],
          },
        ],
      }),
      error: null,
    });
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: false, error: false });
    renderBajaPage();

    await screen.findByText("Martes 22/09");
    expect(screen.getByText("Ya diste de baja este día")).toBeTruthy();
    expect(screen.getByText("Faltan menos de 4 hs")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "No voy" })).toBeNull();
  });
});

describe("BajaPage — confirmar baja", () => {
  function datosConUnaOcurrenciaPorHorario() {
    return datosValidos({
      turnos: [
        { ...MARTES, ocurrencias: [{ fecha: "2026-09-22", cancelada: false, puede_cancelar: true }] },
        { ...JUEVES, ocurrencias: [{ fecha: "2026-09-24", cancelada: false, puede_cancelar: true }] },
      ],
    });
  }

  it("cancelar una fecha de un horario actualiza esa ocurrencia sin afectar el otro horario", async () => {
    const user = userEvent.setup();
    irA("token-1");
    const datosIniciales = datosConUnaOcurrenciaPorHorario();
    obtenerTurnosFijosTitularPublicoMock
      .mockResolvedValueOnce({ data: datosIniciales, error: null })
      .mockResolvedValueOnce({
        data: {
          ...datosIniciales,
          turnos: [
            { ...datosIniciales.turnos[0], ocurrencias: [{ fecha: "2026-09-22", cancelada: true, puede_cancelar: false }] },
            datosIniciales.turnos[1],
          ],
        },
        error: null,
      });
    darDeBajaTurnoFijoMock.mockResolvedValue({ data: { ok: true, ya_estaba: false }, error: null });
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: false, error: false });
    renderBajaPage();

    await user.click(await screen.findByRole("button", { name: /martes 20:00 a 21:30/i }));
    await screen.findByText("Martes 22/09");
    await user.click(screen.getAllByRole("button", { name: "No voy" })[0]);

    // La ocurrencia sigue visible detrás del overlay (Overlay no desmonta el
    // fondo), así que "Martes 22/09" existe dos veces en el documento acá:
    // se escopea al diálogo para verificar exactamente qué fecha/horario
    // se está por cancelar.
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("¿Seguro que no vas a asistir?")).toBeTruthy();
    expect(within(modal).getByText("Martes 22/09")).toBeTruthy();
    expect(within(modal).getByText("20:00 a 21:30")).toBeTruthy();
    expect(within(modal).getByText("Al confirmar, este turno puntual quedará liberado para que otra persona pueda reservarlo.")).toBeTruthy();

    await user.click(within(modal).getByRole("button", { name: "Sí, no voy" }));

    expect(darDeBajaTurnoFijoMock).toHaveBeenCalledWith({
      p_token: "token-1",
      p_turno_fijo_id: MARTES.turno_fijo_id,
      p_fecha: "2026-09-22",
    });
    expect(await screen.findByText("Listo, quedó avisado")).toBeTruthy();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.getByText("Ya diste de baja este día")).toBeTruthy());
    expect(obtenerTurnosFijosTitularPublicoMock).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await user.click(screen.getByRole("button", { name: /jueves 22:00 a 23:30/i }));
    const grupoJueves = screen.getByRole("region", { name: /jueves 22:00 a 23:30/i });
    expect(within(grupoJueves).getByRole("button", { name: "No voy" })).toBeTruthy();
  });

  it("fuera_de_plazo muestra el aviso específico con el plazo real y no queda marcada como cancelada", async () => {
    const user = userEvent.setup();
    irA("token-1");
    obtenerTurnosFijosTitularPublicoMock.mockResolvedValue({ data: datosConUnaOcurrenciaPorHorario(), error: null });
    darDeBajaTurnoFijoMock.mockResolvedValue({ data: { ok: false, error: "fuera_de_plazo" }, error: null });
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: false, error: false });
    renderBajaPage();

    await user.click(await screen.findByRole("button", { name: /martes 20:00 a 21:30/i }));
    await screen.findByText("Martes 22/09");
    await user.click(screen.getAllByRole("button", { name: "No voy" })[0]);
    await user.click(await screen.findByRole("button", { name: "Sí, no voy" }));

    expect(
      await screen.findByText("Ya no se puede dar de baja este día: falta menos de 4 horas para el turno."),
    ).toBeTruthy();
  });

  it("doble submit: el botón se deshabilita mientras envía y la RPC se llama una sola vez", async () => {
    const user = userEvent.setup();
    irA("token-1");
    obtenerTurnosFijosTitularPublicoMock.mockResolvedValue({ data: datosConUnaOcurrenciaPorHorario(), error: null });
    let resolverEnvio!: (v: { data: unknown; error: null }) => void;
    darDeBajaTurnoFijoMock.mockReturnValue(
      new Promise((resolve) => {
        resolverEnvio = resolve;
      }),
    );
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: false, error: false });
    renderBajaPage();

    await user.click(await screen.findByRole("button", { name: /martes 20:00 a 21:30/i }));
    await screen.findByText("Martes 22/09");
    await user.click(screen.getAllByRole("button", { name: "No voy" })[0]);
    const botonConfirmar = (await screen.findByRole("button", { name: "Sí, no voy" })) as HTMLButtonElement;

    await user.click(botonConfirmar);
    expect(botonConfirmar.disabled).toBe(true);
    // Un segundo click mientras está deshabilitado no debe disparar otra llamada.
    await user.click(botonConfirmar);
    expect(darDeBajaTurnoFijoMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolverEnvio({ data: { ok: true, ya_estaba: false }, error: null });
    });
    expect(await screen.findByText("Listo, quedó avisado")).toBeTruthy();
  });

  it("Escape cierra el modal de confirmación sin enviar la baja", async () => {
    const user = userEvent.setup();
    irA("token-1");
    obtenerTurnosFijosTitularPublicoMock.mockResolvedValue({ data: datosConUnaOcurrenciaPorHorario(), error: null });
    useDatosPublicosCanchaMock.mockReturnValue({ datos: null, loading: false, error: false });
    renderBajaPage();

    await user.click(await screen.findByRole("button", { name: /martes 20:00 a 21:30/i }));
    await screen.findByText("Martes 22/09");
    await user.click(screen.getAllByRole("button", { name: "No voy" })[0]);
    await screen.findByText("¿Seguro que no vas a asistir?");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByText("¿Seguro que no vas a asistir?")).toBeNull());
    expect(darDeBajaTurnoFijoMock).not.toHaveBeenCalled();
  });
});
