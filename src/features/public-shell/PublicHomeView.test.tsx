/** @vitest-environment jsdom */
// Mockea usePublicHoy (no reservations.api): esta vista no debe saber de
// dónde sale el dato, solo cómo degradar según loading/error/cerrado/vacío —
// eso ya lo prueba usePublicHoy.test.ts contra los datos reales.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../lib/theme";
import { formatearMoneda } from "../../lib/format";
import type { UseCatalogoPublico } from "../catalogo-public/useCatalogoPublico";
import type { UsePrecioBasePublico } from "../reservations-public/usePrecioBasePublico";
import { PublicHomeView } from "./PublicHomeView";
import type { UseDatosPublicosCancha } from "./useDatosPublicosCancha";
import type { PublicHoy } from "./usePublicHoy";

const usePublicHoyMock = vi.hoisted(() => vi.fn());
vi.mock("./usePublicHoy", () => ({ usePublicHoy: usePublicHoyMock }));

// CFG-F1 — UbicacionContacto ahora usa useDatosPublicosCancha (backend real).
const useDatosPublicosCanchaMock = vi.hoisted(() => vi.fn());
vi.mock("./useDatosPublicosCancha", () => ({ useDatosPublicosCancha: useDatosPublicosCanchaMock }));

// PUBLIC-R4 — CatalogoPreview ahora llama a useCatalogoPublico (productos
// reales). Se mockea igual que usePublicHoy: esta vista no debe saber de
// dónde sale el dato, eso ya lo prueba useCatalogoPublico contra la API real
// (mockeada a su vez en catalogo.api.test.ts / PublicCatalogoView.test.tsx).
const useCatalogoPublicoMock = vi.hoisted(() => vi.fn());
vi.mock("../catalogo-public/useCatalogoPublico", () => ({ useCatalogoPublico: useCatalogoPublicoMock }));

// PUBLIC-R7 — "Por hora" ahora sale de usePrecioBasePublico (precio_base_vigente
// real), no de configCancha.precioHora. Mismo criterio: esta vista no debe
// saber de dónde sale el dato.
const usePrecioBasePublicoMock = vi.hoisted(() => vi.fn());
vi.mock("../reservations-public/usePrecioBasePublico", () => ({ usePrecioBasePublico: usePrecioBasePublicoMock }));

function hoyBase(overrides: Partial<PublicHoy> = {}): PublicHoy {
  return {
    loading: false,
    error: false,
    cerrado: false,
    abierta: true,
    horarios: [],
    franja: { cerrado: false, horaApertura: "08:00", horaCierre: "23:00" },
    configuracion: {
      duracionMinima: 60,
      duracionMaxima: 180,
      anticipacionMaximaDias: 14,
      anticipacionMinimaMinutos: 0,
      limiteReservasActivasTelefono: 3,
    },
    ...overrides,
  };
}

function catalogoBase(overrides: Partial<UseCatalogoPublico> = {}): UseCatalogoPublico {
  return { productos: [], loading: false, error: false, ...overrides };
}

function datosPublicosBase(overrides: Partial<UseDatosPublicosCancha> = {}): UseDatosPublicosCancha {
  return {
    refrescar: vi.fn(),
    datos: {
      nombreCancha: "Los amigos padel",
      whatsappNumero: "5493775550100",
      instagramUrl: "https://www.instagram.com/losamigos_padel",
      direccion: "Monte Caseros, Corrientes",
      mapaLat: -30.242812,
      mapaLng: -57.655903,
    },
    loading: false,
    error: false,
    ...overrides,
  };
}

function precioBaseBase(overrides: Partial<UsePrecioBasePublico> = {}): UsePrecioBasePublico {
  return { precio: 20000, loading: false, error: false, ...overrides };
}

function renderHome(
  hoy: PublicHoy,
  onNavegar = vi.fn(),
  catalogo: UseCatalogoPublico = catalogoBase(),
  datosPublicos = datosPublicosBase(),
  precioBase: UsePrecioBasePublico = precioBaseBase(),
) {
  usePublicHoyMock.mockReturnValue(hoy);
  useCatalogoPublicoMock.mockReturnValue(catalogo);
  useDatosPublicosCanchaMock.mockReturnValue(datosPublicos);
  usePrecioBasePublicoMock.mockReturnValue(precioBase);
  render(
    <ThemeProvider>
      <PublicHomeView onNavegar={onNavegar} />
    </ThemeProvider>,
  );
  return onNavegar;
}

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // no-op
  }
  document.documentElement.removeAttribute("data-theme");
});

describe("PublicHomeView — datos reales", () => {
  // PUBLIC-R7 — precio_base_vigente real (no configCancha.precioHora, que
  // podía divergir del precio configurado desde Configuración).
  it("usa el precio real de precio_base_vigente, nunca un hardcode fijo", () => {
    renderHome(hoyBase(), vi.fn(), catalogoBase(), datosPublicosBase(), precioBaseBase({ precio: 17500 }));
    expect(screen.getByText(`Desde ${formatearMoneda(17500)}`)).toBeTruthy();
  });

  it("precio aún cargando: no muestra la celda 'Por hora' (nada de fallback silencioso)", () => {
    renderHome(hoyBase(), vi.fn(), catalogoBase(), datosPublicosBase(), precioBaseBase({ loading: true, precio: null }));
    expect(screen.queryByText("Por hora")).toBeNull();
    expect(screen.queryByText(/^Desde \$/)).toBeNull();
  });

  it("error al cargar el precio: no muestra la celda 'Por hora', nunca inventa un precio", () => {
    renderHome(hoyBase(), vi.fn(), catalogoBase(), datosPublicosBase(), precioBaseBase({ error: true, precio: null }));
    expect(screen.queryByText("Por hora")).toBeNull();
    expect(screen.queryByText(/^Desde \$/)).toBeNull();
  });

  it("usa la duración real de useConfiguracionReservas", () => {
    renderHome(hoyBase());
    expect(screen.getByText("60–180 min")).toBeTruthy();
  });

  it("muestra el horario de HOY real (franja), no un horario fijo inventado", () => {
    renderHome(hoyBase({ franja: { cerrado: false, horaApertura: "09:00", horaCierre: "22:00" } }));
    expect(screen.getByText("Hoy 09:00–22:00")).toBeTruthy();
  });

  it("abierta=true muestra el badge con la hora real de cierre", () => {
    renderHome(hoyBase({ abierta: true, franja: { cerrado: false, horaApertura: "08:00", horaCierre: "23:00" } }));
    expect(screen.getByText("Abierto ahora · cierra 23:00")).toBeTruthy();
  });

  it("muestra hasta 3 horarios reales cuando hay disponibilidad hoy", async () => {
    const onNavegar = renderHome(hoyBase({ horarios: ["14:00", "15:30", "18:00"] }));
    expect(screen.getByText("14:00")).toBeTruthy();
    expect(screen.getByText("15:30")).toBeTruthy();
    expect(screen.getByText("18:00")).toBeTruthy();
    await userEvent.click(screen.getByText("14:00"));
    expect(onNavegar).toHaveBeenCalledWith("reservar");
  });
});

describe("PublicHomeView — degradación elegante (nunca inventa datos)", () => {
  it("día cerrado: CTA en vez de horarios ficticios", () => {
    renderHome(
      hoyBase({ cerrado: true, abierta: false, horarios: [], franja: { cerrado: true, horaApertura: null, horaCierre: null } }),
    );
    expect(screen.getByText("Ver otros días disponibles")).toBeTruthy();
    // "Cerrado hoy" aparece tanto en el badge como en datos rápidos — dos
    // nodos reales, no un error de render duplicado.
    expect(screen.getAllByText("Cerrado hoy").length).toBe(2);
  });

  it("error de red: no afirma abierto/cerrado, ofrece reservar igual", () => {
    renderHome(hoyBase({ error: true, abierta: false, horarios: [], franja: null }));
    expect(screen.getByText("Te confirmamos el horario al reservar")).toBeTruthy();
    expect(screen.getByText("Ver horarios disponibles")).toBeTruthy();
  });

  it("loading: no muestra ningún horario todavía (skeleton, no placeholder falso)", () => {
    renderHome(hoyBase({ loading: true, horarios: [] }));
    expect(screen.queryByText("14:00")).toBeNull();
  });

  it("sin horarios libres hoy (pero abierto): degrada a CTA en vez de mostrar vacío", () => {
    renderHome(hoyBase({ horarios: [] }));
    expect(screen.getByText("Ver horarios disponibles")).toBeTruthy();
  });
});

describe("PublicHomeView — navegación", () => {
  it("el CTA principal navega a reservar", async () => {
    const onNavegar = renderHome(hoyBase());
    await userEvent.click(screen.getByRole("button", { name: "Reservar ahora" }));
    expect(onNavegar).toHaveBeenCalledWith("reservar");
  });

  it("la preview de catálogo navega a catálogo", async () => {
    const onNavegar = renderHome(hoyBase());
    await userEvent.click(screen.getByRole("button", { name: /En la cancha/ }));
    expect(onNavegar).toHaveBeenCalledWith("catalogo");
  });

  it("el acceso a baja de turno fijo apunta a /baja/", () => {
    renderHome(hoyBase());
    expect(screen.getByRole("link", { name: /Tenés un turno fijo/ }).getAttribute("href")).toBe("/baja/");
  });
});

describe("PublicHomeView — ubicación y contacto (CFG-F1, datos reales)", () => {
  it("muestra dirección y link de WhatsApp con los datos reales del backend", () => {
    renderHome(hoyBase());
    expect(screen.getByText("Monte Caseros, Corrientes")).toBeTruthy();
    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toBe(
      "https://wa.me/5493775550100",
    );
  });

  it("mientras carga: skeleton, no datos viejos ni inventados", () => {
    renderHome(hoyBase(), vi.fn(), catalogoBase(), datosPublicosBase({ loading: true, datos: null }));
    expect(screen.queryByText("Monte Caseros, Corrientes")).toBeNull();
    expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
  });

  it("error: mensaje honesto, nunca inventa dirección/WhatsApp", () => {
    renderHome(hoyBase(), vi.fn(), catalogoBase(), datosPublicosBase({ error: true, datos: null }));
    expect(screen.getByText("No pudimos cargar estos datos. Probá de nuevo más tarde.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
  });
});

describe("PublicHomeView — preview de catálogo (PUBLIC-R4, productos reales)", () => {
  function producto(overrides: Partial<import("../catalogo-public/catalogo.types").ProductoPublico> = {}) {
    return {
      id: "p1",
      nombre: "Agua mineral",
      precioVenta: 1500,
      categoriaPublica: "Bebidas",
      descripcionPublica: null,
      imagenPath: null,
      destacado: false,
      ordenPublico: null,
      enStock: true,
      ...overrides,
    };
  }

  it("sin productos visibles: mensaje genérico, nunca placeholders de categorías inventadas", () => {
    renderHome(hoyBase(), vi.fn(), catalogoBase({ productos: [] }));
    expect(screen.getByText("Muy pronto vas a poder ver acá todo lo que tenemos disponible.")).toBeTruthy();
    expect(screen.queryByText("Bebidas")).toBeNull();
    expect(screen.queryByText("Pelotas")).toBeNull();
  });

  it("con productos reales: muestra sus nombres, no categorías genéricas fijas", () => {
    renderHome(
      hoyBase(),
      vi.fn(),
      catalogoBase({ productos: [producto({ id: "a", nombre: "Agua mineral" }), producto({ id: "b", nombre: "Grip" })] }),
    );
    expect(screen.getByText("Agua mineral")).toBeTruthy();
    expect(screen.getByText("Grip")).toBeTruthy();
  });

  it("prioriza destacados sobre el resto cuando hay más de 3 productos visibles", () => {
    renderHome(
      hoyBase(),
      vi.fn(),
      catalogoBase({
        productos: [
          producto({ id: "a", nombre: "Sin destacar A" }),
          producto({ id: "b", nombre: "Sin destacar B" }),
          producto({ id: "c", nombre: "Destacado único", destacado: true }),
        ],
      }),
    );
    expect(screen.getByText("Destacado único")).toBeTruthy();
    expect(screen.queryByText("Sin destacar A")).toBeNull();
    expect(screen.queryByText("Sin destacar B")).toBeNull();
  });

  it("mientras carga: skeleton, no productos viejos ni inventados", () => {
    renderHome(hoyBase(), vi.fn(), catalogoBase({ loading: true, productos: [] }));
    expect(screen.queryByText("Muy pronto vas a poder ver acá todo lo que tenemos disponible.")).toBeNull();
  });

  // PUBLIC-R7 — mismo fallback que ProductoPublicoCard en Catálogo: si
  // imagen_path ya no resuelve a un archivo real, cae al placeholder de "sin
  // imagen" en vez de dejar el ícono roto nativo del navegador.
  it("imagen rota (error de carga): cae al placeholder, no deja el ícono roto del navegador", () => {
    renderHome(hoyBase(), vi.fn(), catalogoBase({ productos: [producto({ imagenPath: "borrada.webp" })] }));
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
  });
});
