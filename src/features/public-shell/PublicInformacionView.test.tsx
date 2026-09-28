/** @vitest-environment jsdom */
// Mockea los hooks (useFranjaOperativa/useConfiguracionReservas/useHorariosSemana),
// no reservations.api: esta vista no debe saber de dónde sale el dato, solo
// cómo degradar según loading/error — el fetch/parseo real ya está probado
// en reservations.logic.test.ts / horariosSemana.logic.test.ts.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfiguracionReservas, FranjaOperativa, HorarioSemanaDia } from "../reservations-public/reservations.types";
import { PublicInformacionView } from "./PublicInformacionView";
import type { DatosPublicosCancha } from "./useDatosPublicosCancha";

const useFranjaOperativaMock = vi.hoisted(() => vi.fn());
vi.mock("../reservations-public/useFranjaOperativa", () => ({ useFranjaOperativa: useFranjaOperativaMock }));

const useConfiguracionReservasMock = vi.hoisted(() => vi.fn());
vi.mock("../reservations-public/useConfiguracionReservas", () => ({
  useConfiguracionReservas: useConfiguracionReservasMock,
}));

const useHorariosSemanaMock = vi.hoisted(() => vi.fn());
vi.mock("./useHorariosSemana", () => ({ useHorariosSemana: useHorariosSemanaMock }));

// PUBLIC-R7 — "Por hora" ahora sale de usePrecioBasePublico (precio_base_vigente
// real), no de configCancha.precioHora.
const usePrecioBasePublicoMock = vi.hoisted(() => vi.fn());
vi.mock("../reservations-public/usePrecioBasePublico", () => ({ usePrecioBasePublico: usePrecioBasePublicoMock }));

// CFG-F1 — Ubicación/Contacto ahora usan useDatosPublicosCancha (backend real).
const useDatosPublicosCanchaMock = vi.hoisted(() => vi.fn());
vi.mock("./useDatosPublicosCancha", () => ({ useDatosPublicosCancha: useDatosPublicosCanchaMock }));

const CONFIG_BASE: ConfiguracionReservas = {
  duracionMinima: 60,
  duracionMaxima: 180,
  anticipacionMaximaDias: 14,
  anticipacionMinimaMinutos: 0,
  limiteReservasActivasTelefono: 3,
};

const DIAS_TODOS_IGUALES: HorarioSemanaDia[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  abierto: true,
  horaApertura: "08:00",
  horaCierre: "01:00",
}));

const DATOS_PUBLICOS_BASE: DatosPublicosCancha = {
  nombreCancha: "Los amigos padel",
  whatsappNumero: "5493775550100",
  instagramUrl: "https://www.instagram.com/losamigos_padel",
  direccion: "Monte Caseros, Corrientes",
  mapaLat: -30.242812,
  mapaLng: -57.655903,
};

function mockear(overrides: {
  franja?: FranjaOperativa | null;
  franjaLoading?: boolean;
  dias?: HorarioSemanaDia[];
  horariosLoading?: boolean;
  horariosError?: boolean;
  datosPublicos?: DatosPublicosCancha | null;
  datosPublicosLoading?: boolean;
  datosPublicosError?: boolean;
  precioBase?: number | null;
  precioBaseLoading?: boolean;
  precioBaseError?: boolean;
}) {
  useFranjaOperativaMock.mockReturnValue({
    franja: overrides.franja ?? { cerrado: false, horaApertura: "08:00", horaCierre: "01:00" },
    loading: overrides.franjaLoading ?? false,
    error: false,
  });
  useConfiguracionReservasMock.mockReturnValue({ configuracion: CONFIG_BASE, loading: false, error: false });
  useHorariosSemanaMock.mockReturnValue({
    dias: overrides.dias ?? DIAS_TODOS_IGUALES,
    loading: overrides.horariosLoading ?? false,
    error: overrides.horariosError ?? false,
  });
  useDatosPublicosCanchaMock.mockReturnValue({
    datos: overrides.datosPublicos ?? DATOS_PUBLICOS_BASE,
    loading: overrides.datosPublicosLoading ?? false,
    error: overrides.datosPublicosError ?? false,
  });
  usePrecioBasePublicoMock.mockReturnValue({
    precio: overrides.precioBase ?? 20000,
    loading: overrides.precioBaseLoading ?? false,
    error: overrides.precioBaseError ?? false,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PublicInformacionView", () => {
  it("agrupa la semana completa en una sola línea cuando todos los días comparten horario", () => {
    mockear({});
    render(<PublicInformacionView />);
    expect(screen.getByText("Lunes a Domingo")).toBeTruthy();
    expect(screen.getAllByText(/08:00 a 01:00 hs/).length).toBeGreaterThan(0);
  });

  it("NO muestra 'todos los días' cuando el horario semanal difiere entre días", () => {
    const dias: HorarioSemanaDia[] = DIAS_TODOS_IGUALES.map((d) =>
      d.diaSemana === 0 || d.diaSemana === 6 ? { ...d, horaApertura: "09:00", horaCierre: "23:00" } : d,
    );
    mockear({ dias });
    render(<PublicInformacionView />);
    expect(screen.queryByText("Lunes a Domingo")).toBeNull();
    expect(screen.getByText("Lunes a Viernes")).toBeTruthy();
    expect(screen.getByText("Sábado y Domingo")).toBeTruthy();
  });

  it("un día cerrado se muestra como 'Cerrado', no con un horario inventado", () => {
    const dias: HorarioSemanaDia[] = DIAS_TODOS_IGUALES.map((d) =>
      d.diaSemana === 1 ? { diaSemana: 1, abierto: false, horaApertura: null, horaCierre: null } : d,
    );
    mockear({ dias });
    render(<PublicInformacionView />);
    expect(screen.getByText("Lunes")).toBeTruthy();
    expect(screen.getAllByText("Cerrado").length).toBeGreaterThan(0);
  });

  it("error al cargar el horario semanal no rompe la vista y avisa con un mensaje honesto", () => {
    mockear({ dias: [], horariosError: true });
    render(<PublicInformacionView />);
    expect(screen.getByText(/No pudimos cargar el horario semanal completo/)).toBeTruthy();
  });

  it("muestra dirección, WhatsApp e Instagram reales del backend", () => {
    mockear({});
    render(<PublicInformacionView />);
    expect(screen.getByText("Monte Caseros, Corrientes")).toBeTruthy();
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toBe(
      "https://wa.me/5493775550100",
    );
    expect(screen.getByRole("link", { name: /Instagram/ }).getAttribute("href")).toBe(
      "https://www.instagram.com/losamigos_padel",
    );
  });

  it("sin Instagram configurado, no muestra el botón (nunca un link vacío)", () => {
    mockear({ datosPublicos: { ...DATOS_PUBLICOS_BASE, instagramUrl: null } });
    render(<PublicInformacionView />);
    expect(screen.queryByRole("link", { name: /Instagram/ })).toBeNull();
  });

  it("error al cargar datos públicos: mensajes honestos, nunca dirección/WhatsApp inventados", () => {
    mockear({ datosPublicos: null, datosPublicosError: true });
    render(<PublicInformacionView />);
    expect(screen.getByText("No pudimos cargar la dirección. Consultanos por WhatsApp.")).toBeTruthy();
    expect(screen.getByText("No pudimos cargar los datos de contacto.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).toBeNull();
  });
});

// PUBLIC-R7 — "Por hora" usa precio_base_vigente real (no configCancha.precioHora,
// que podía divergir del precio configurado desde Configuración).
describe("PublicInformacionView — precio por hora (PUBLIC-R7, precio_base_vigente real)", () => {
  it("muestra el precio real de precio_base_vigente, nunca un hardcode fijo", () => {
    mockear({ precioBase: 17500 });
    render(<PublicInformacionView />);
    expect(screen.getByText("$17.500")).toBeTruthy();
  });

  it("precio aún cargando: muestra '—', nunca un precio inventado mientras tanto", () => {
    mockear({ precioBase: null, precioBaseLoading: true });
    render(<PublicInformacionView />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("error al cargar el precio: muestra '—', nunca cae a un fallback silencioso", () => {
    mockear({ precioBase: null, precioBaseError: true });
    render(<PublicInformacionView />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
