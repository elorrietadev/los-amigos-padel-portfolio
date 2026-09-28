/** @vitest-environment jsdom */
// Tests de B5 — lo que vive en AdminShell y no en ReservasView, precisamente
// porque debe sobrevivir a un cambio de tab: el canal Realtime, el aviso
// sonoro/banner, y la señal { fecha, token } empujada hacia ReservasView.
// ReservasView se mockea a un stub que solo expone las props que le llegan —
// su propio comportamiento (recargas, filtros, etc.) ya está cubierto en
// ReservasView.test.tsx.

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../lib/theme";
import { AdminShell } from "./AdminShell";
import type { ReservaRow } from "./reservas/reservas.types";
import { invalidarEconomia } from "./economiaEvents";
import { obtenerProductos } from "./productos/productos.api";
import { aplicarPago } from "./reservas/reservas.logic";
import { AHORA, crearPendiente, crearProducto, crearReserva } from "./notificaciones/notificaciones.fixtures";

// R2 — Sidebar (desktop) y BottomNav (mobile) se turnan por media query
// (`lg:`), que jsdom no evalúa sin la hoja de estilos real cargada: acá
// SIEMPRE están las dos en el DOM a la vez. Como ambas repiten labels como
// "Agenda"/"Reservas", las queries de navegación se escopan al nav de la
// Sidebar (aria-label="Navegación principal") para no toparse con "Found
// multiple elements".
function navPrincipal() {
  return within(screen.getByLabelText("Navegación principal"));
}

function renderShell(onLogout: () => void = vi.fn()) {
  return render(
    <ThemeProvider>
      <AdminShell onLogout={onLogout} />
    </ThemeProvider>,
  );
}

const canalMock = vi.hoisted(() => {
  const mock = {
    on: vi.fn(),
    subscribe: vi.fn(),
    handler: null as ((payload: { new: ReservaRow }) => void) | null,
  };
  mock.on.mockImplementation((_event: string, _filtro: unknown, cb: (payload: { new: ReservaRow }) => void) => {
    mock.handler = cb;
    return mock;
  });
  mock.subscribe.mockReturnValue(mock);
  return mock;
});

const supabaseMock = vi.hoisted(() => ({
  channel: vi.fn(() => canalMock),
  removeChannel: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({ supabase: supabaseMock }));

const audioMock = vi.hoisted(() => ({ reproducirAviso: vi.fn() }));
vi.mock("./audio", () => audioMock);

// B8 — AgendaView y ReservasView quedan siempre montadas (con `hidden`) en
// AdminShell, así que ya no alcanza con dejar sin mockear a la que no está en
// la tab activa (antes ni se montaba). Se mockean ambas a un stub que solo
// expone las props que le llegan (`nuevaReservaSignal`, `activo`) — su propio
// comportamiento ya está cubierto en AgendaView.test.tsx/ReservasView.test.tsx.
type StubProps = {
  nuevaReservaSignal?: { fecha: string; token: number } | null;
  activo?: boolean;
  materializacionSignal?: number;
};

// `function` (no arrow/const): las declaraciones de función se hoistean
// enteras al tope del módulo, así que ya está definida cuando corren los
// `vi.hoisted` de abajo (Vitest los sube por encima de este punto).
function textoStub(props: StubProps) {
  const { nuevaReservaSignal, activo, materializacionSignal } = props;
  return `señal: ${nuevaReservaSignal ? `${nuevaReservaSignal.fecha}|${nuevaReservaSignal.token}` : "null"} · activo: ${String(activo)} · materializacion: ${String(materializacionSignal)}`;
}

const reservasViewMock = vi.hoisted(() => ({
  ReservasView: vi.fn((props: StubProps) => <div data-testid="reservas-view-stub">{textoStub(props)}</div>),
}));
vi.mock("./reservas/ReservasView", () => reservasViewMock);

const agendaViewMock = vi.hoisted(() => ({
  AgendaView: vi.fn((props: StubProps) => <div data-testid="agenda-view-stub">{textoStub(props)}</div>),
}));
vi.mock("./agenda/AgendaView", () => agendaViewMock);

// TurnosFijosView/BloqueosView se mockean al componente entero, igual que
// Agenda/Reservas — su propio comportamiento se cubre en
// TurnosFijosView.test.tsx/BloqueosView.test.tsx.
const turnosFijosViewMock = vi.hoisted(() => ({
  TurnosFijosView: vi.fn(() => <div data-testid="turnos-fijos-view-stub" />),
}));
vi.mock("./turnos-fijos/TurnosFijosView", () => turnosFijosViewMock);

const bloqueosViewMock = vi.hoisted(() => ({
  BloqueosView: vi.fn(() => <div data-testid="bloqueos-view-stub" />),
}));
vi.mock("./bloqueos/BloqueosView", () => bloqueosViewMock);

// R2 — mismo criterio para los 5 destinos nuevos: se mockean al componente
// entero, su comportamiento propio ya se cubre en su propio archivo de test
// (VenderView.test.tsx, ProductosView.test.tsx, HistorialView.test.tsx,
// CajaView.test.tsx, y ReportesView/BackupView no tienen behavior propio
// digno de mock acá porque ni se testean sus internals en este archivo).
vi.mock("./ventas/VenderView", () => ({ VenderView: vi.fn(() => <div data-testid="vender-view-stub" />) }));
vi.mock("./productos/ProductosView", () => ({ ProductosView: vi.fn(() => <div data-testid="productos-view-stub" />) }));
vi.mock("./historial/HistorialView", () => ({ HistorialView: vi.fn(() => <div data-testid="historial-view-stub" />) }));
vi.mock("./caja/CajaView", () => ({ CajaView: vi.fn(() => <div data-testid="caja-view-stub" />) }));
vi.mock("./reportes/ReportesView", () => ({ ReportesView: vi.fn(() => <div data-testid="reportes-view-stub" />) }));
vi.mock("./backup/BackupView", () => ({ BackupView: vi.fn(() => <div data-testid="backup-view-stub" />) }));

// R2 — useProductos (lift a AdminShell, ver cabecera de AdminShell.tsx) hace
// fetch real de productos.api; se mockea a nivel de transporte, mismo
// criterio que turnosFijos.api más abajo.
vi.mock("./productos/productos.api", () => ({
  obtenerProductos: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

// C3 — AdminShell ahora crea la instancia ÚNICA de useTurnosFijos (hace fetch
// real: useTurnosFijos -> turnosFijos.api -> supabase.from), que este archivo
// no mockea a nivel de transporte (el supabaseMock de arriba solo stubea
// `channel`/`removeChannel` para Realtime) — se mockea turnosFijos.api acá
// para que ese fetch resuelva vacío en vez de pegarle a supabase.from de
// verdad. El propio comportamiento del hook se cubre indirectamente en
// AgendaView.test.tsx/TurnosFijosView.test.tsx (vía su harness con el hook
// real) — acá solo hace falta que no explote.
vi.mock("./turnos-fijos/turnosFijos.api", () => ({
  obtenerTurnosFijos: vi.fn().mockResolvedValue({ data: [], error: null }),
  obtenerExcepciones: vi.fn().mockResolvedValue({ data: [], error: null }),
  upsertTokenTurnoFijo: vi.fn(),
  obtenerTokenTurnoFijo: vi.fn(),
}));

// C6 — AdminShell llama a materializarTurnosFijosJugados directo (no vía
// hook), así que se mockea reservas.api a nivel de transporte, mismo criterio
// que turnosFijos.api arriba. Default: 0 filas materializadas (sin toast, sin
// impacto en los tests de B5/B8 que no le prestan atención a esto).
// R2 — obtenerReservasPorRango se agrega acá porque AdminShell ahora también
// levanta useReservasJugadas (compartida con Caja, ver cabecera de
// AdminShell.tsx) — antes esa fetch la hacía ReservasView (ya mockeada
// arriba a nivel de componente), así que nunca había hecho falta acá.
const reservasApiMock = vi.hoisted(() => {
  const obtenerReservasPorRango = vi.fn().mockResolvedValue({ data: [], error: null });
  return {
    materializarTurnosFijosJugados: vi.fn(),
    obtenerReservasPorRango,
    // La campana (useReservasSinPagoHistoricas) usa la variante paginada: acá
    // delega en el mismo mock, así cargarPorSemana distingue ambos rangos igual.
    obtenerReservasPorRangoCompleto: (inicio: string, fin: string) => obtenerReservasPorRango(inicio, fin),
    // Notificaciones — AdminShell levanta también useReservasProximas (la campana deriva de ahí).
    obtenerReservasProximas: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
});
vi.mock("./reservas/reservas.api", () => reservasApiMock);
reservasApiMock.materializarTurnosFijosJugados.mockResolvedValue({ data: 0, error: null });

function crearReservaInsertada(overrides: Partial<ReservaRow> = {}): ReservaRow {
  return {
    id: "n1",
    fecha: "2024-01-01",
    hora_inicio: "10:00:00",
    hora_fin: "11:00:00",
    nombre: "Nueva",
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  canalMock.handler = null;
  // P5 — la sección activa ahora persiste en sessionStorage (real en jsdom,
  // no mockeado): sin este reset, un test que navega a otra sección dejaría
  // ese valor para el siguiente test del archivo.
  window.sessionStorage.clear();
});

describe("AdminShell — Realtime (B5)", () => {
  it("se suscribe al canal reservas-nuevas al montar", () => {
    renderShell();

    expect(supabaseMock.channel).toHaveBeenCalledWith("reservas-nuevas");
    expect(canalMock.on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "reservas" },
      expect.any(Function),
    );
    expect(canalMock.subscribe).toHaveBeenCalled();
  });

  it("se desuscribe (removeChannel) al desmontar", () => {
    const { unmount } = renderShell();
    unmount();
    expect(supabaseMock.removeChannel).toHaveBeenCalledWith(canalMock);
  });

  it("no reabre el canal al re-renderizar (identidad estable del callback)", async () => {
    const user = userEvent.setup();
    renderShell();
    expect(supabaseMock.channel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Turnos fijos/ }));
    await user.click(navPrincipal().getByRole("button", { name: /Reservas/ }));

    expect(supabaseMock.channel).toHaveBeenCalledTimes(1);
  });

  it("INSERT no bloqueado: reproduce el aviso, muestra el banner y empuja la señal a ReservasView", async () => {
    renderShell();

    act(() => {
      canalMock.handler!({ new: crearReservaInsertada({ fecha: "2024-03-05" }) });
    });

    expect(audioMock.reproducirAviso).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Llegó un turno nuevo/)).toBeTruthy();
    expect(screen.getByTestId("reservas-view-stub").textContent).toContain("2024-03-05");
  });

  it("INSERT bloqueado: no dispara aviso ni banner ni señal", () => {
    renderShell();

    act(() => {
      canalMock.handler!({ new: crearReservaInsertada({ bloqueado: true }) });
    });

    expect(audioMock.reproducirAviso).not.toHaveBeenCalled();
    expect(screen.queryByText(/Llegó un turno nuevo/)).toBeNull();
    expect(screen.getByTestId("reservas-view-stub").textContent).toContain("null");
  });

  it("el banner se auto-oculta a los 6000ms", async () => {
    renderShell();
    vi.useFakeTimers();

    act(() => {
      canalMock.handler!({ new: crearReservaInsertada() });
    });
    expect(screen.getByText(/Llegó un turno nuevo/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5999);
    });
    expect(screen.getByText(/Llegó un turno nuevo/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByText(/Llegó un turno nuevo/)).toBeNull();
  });

  it("dos avisos seguidos extienden la ventana de 6000ms en vez de cortarla con el primero", async () => {
    renderShell();
    vi.useFakeTimers();

    act(() => {
      canalMock.handler!({ new: crearReservaInsertada({ id: "n1" }) });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    act(() => {
      canalMock.handler!({ new: crearReservaInsertada({ id: "n2" }) });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Pasaron 10s desde el primer aviso (> 6000ms) pero solo 5s desde el
    // segundo — el banner sigue visible porque cada evento reinicia el timer.
    expect(screen.getByText(/Llegó un turno nuevo/)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByText(/Llegó un turno nuevo/)).toBeNull();
  });

  it("click en el banner navega a Reservas y lo oculta", async () => {
    const user = userEvent.setup();
    renderShell();

    // B8 — ReservasView ya no se desmonta al salir de su tab, solo queda
    // `hidden` (ver describe de abajo para el detalle de ese contrato).
    await user.click(screen.getByRole("button", { name: /Turnos fijos/ }));
    expect(screen.getByTestId("reservas-view-stub").closest("[hidden]")).not.toBeNull();

    act(() => {
      canalMock.handler!({ new: crearReservaInsertada() });
    });
    await user.click(screen.getByText(/Llegó un turno nuevo/));

    expect(screen.queryByText(/Llegó un turno nuevo/)).toBeNull();
    expect(screen.getByTestId("reservas-view-stub").closest("[hidden]")).toBeNull();
  });
});

// B8 — contrato de lifetime que AdminShell le debe garantizar a Agenda y
// Reservas: quedan siempre montadas (nunca se van del DOM) y alternan
// visibilidad con `hidden`, con `activo` reflejando cuál es la tab actual.
// El resto del comportamiento (qué hace cada vista con `activo`: polling,
// refresco al reactivarse, etc.) se testea en AgendaView.test.tsx y
// ReservasView.test.tsx — acá solo se verifica el cableado de AdminShell.
describe("AdminShell — lifetime de Agenda/Reservas (B8)", () => {
  it("ambas vistas están montadas desde el inicio, con Reservas visible y Agenda oculta (default)", () => {
    renderShell();

    const reservas = screen.getByTestId("reservas-view-stub");
    const agenda = screen.getByTestId("agenda-view-stub");
    expect(reservas.closest("[hidden]")).toBeNull();
    expect(agenda.closest("[hidden]")).not.toBeNull();
    expect(reservas.textContent).toContain("activo: true");
    expect(agenda.textContent).toContain("activo: false");
  });

  it("cambiar a Agenda invierte hidden/activo entre ambas vistas, sin desmontar ninguna", async () => {
    const user = userEvent.setup();
    renderShell();

    const reservasAntes = screen.getByTestId("reservas-view-stub");
    const agendaAntes = screen.getByTestId("agenda-view-stub");

    await user.click(navPrincipal().getByRole("button", { name: /Agenda/ }));

    const reservasDespues = screen.getByTestId("reservas-view-stub");
    const agendaDespues = screen.getByTestId("agenda-view-stub");
    // Misma identidad de nodo del DOM: prueba que no hubo desmontaje/remontaje
    // (si React las hubiera vuelto a montar, serían nodos distintos).
    expect(reservasDespues).toBe(reservasAntes);
    expect(agendaDespues).toBe(agendaAntes);

    expect(reservasDespues.closest("[hidden]")).not.toBeNull();
    expect(agendaDespues.closest("[hidden]")).toBeNull();
    expect(reservasDespues.textContent).toContain("activo: false");
    expect(agendaDespues.textContent).toContain("activo: true");
  });

  it("una tab placeholder (Fijos) oculta ambas vistas reales sin desmontarlas", async () => {
    const user = userEvent.setup();
    renderShell();
    const reservasAntes = screen.getByTestId("reservas-view-stub");
    const agendaAntes = screen.getByTestId("agenda-view-stub");

    await user.click(screen.getByRole("button", { name: /Turnos fijos/ }));

    expect(screen.getByTestId("reservas-view-stub")).toBe(reservasAntes);
    expect(screen.getByTestId("agenda-view-stub")).toBe(agendaAntes);
    expect(screen.getByTestId("reservas-view-stub").closest("[hidden]")).not.toBeNull();
    expect(screen.getByTestId("agenda-view-stub").closest("[hidden]")).not.toBeNull();
    expect(screen.getByTestId("reservas-view-stub").textContent).toContain("activo: false");
    expect(screen.getByTestId("agenda-view-stub").textContent).toContain("activo: false");
  });
});

// C6 — admin.html:610-613 (materializarTurnosFijosJugados), portado como
// efecto propio de AdminShell (una sola vez por sesión, ver AdminShell.tsx).
// Reservas/Agenda vuelven a estar mockeadas al stub de arriba: su propia
// reacción al signal (recargar próximas/jugadas/agenda) se cubre en
// ReservasView.test.tsx/AgendaView.test.tsx — acá solo se verifica que
// AdminShell dispare la RPC correctamente y propague el token.
describe("AdminShell — materializar turnos fijos jugados (C6)", () => {
  it("llama a la RPC una sola vez al montar, sin argumentos", () => {
    renderShell();

    expect(reservasApiMock.materializarTurnosFijosJugados).toHaveBeenCalledTimes(1);
    expect(reservasApiMock.materializarTurnosFijosJugados).toHaveBeenCalledWith();
  });

  it("cambiar de tab no vuelve a disparar la RPC", async () => {
    const user = userEvent.setup();
    renderShell();
    expect(reservasApiMock.materializarTurnosFijosJugados).toHaveBeenCalledTimes(1);

    await user.click(navPrincipal().getByRole("button", { name: /Agenda/ }));
    await user.click(screen.getByRole("button", { name: /Turnos fijos/ }));
    await user.click(screen.getByRole("button", { name: /Bloqueos/ }));
    await user.click(navPrincipal().getByRole("button", { name: /Reservas/ }));

    expect(reservasApiMock.materializarTurnosFijosJugados).toHaveBeenCalledTimes(1);
  });

  it("data=0: sin toast y sin incrementar materializacionSignal", async () => {
    reservasApiMock.materializarTurnosFijosJugados.mockResolvedValueOnce({ data: 0, error: null });
    renderShell();

    await waitFor(() => expect(reservasApiMock.materializarTurnosFijosJugados).toHaveBeenCalled());
    expect(screen.queryByText(/Se registraron/)).toBeNull();
    expect(screen.getByTestId("reservas-view-stub").textContent).toContain("materializacion: 0");
    expect(screen.getByTestId("agenda-view-stub").textContent).toContain("materializacion: 0");
  });

  it("data=1: toast en singular", async () => {
    reservasApiMock.materializarTurnosFijosJugados.mockResolvedValueOnce({ data: 1, error: null });
    renderShell();

    expect(await screen.findByText("Se registraron 1 turno fijo jugado, revisá su pago en Jugados.")).toBeTruthy();
  });

  it("data>1: toast en plural", async () => {
    reservasApiMock.materializarTurnosFijosJugados.mockResolvedValueOnce({ data: 3, error: null });
    renderShell();

    expect(
      await screen.findByText("Se registraron 3 turnos fijos jugados, revisá sus pagos en Jugados."),
    ).toBeTruthy();
  });

  it("error: console.warn, sin toast, el admin sigue operativo", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    reservasApiMock.materializarTurnosFijosJugados.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    renderShell();

    await waitFor(() => expect(warnSpy).toHaveBeenCalled());
    expect(screen.queryByText(/Se registraron/)).toBeNull();
    // R2 — el <h1> ahora es el título de la vista actual (PageHeader), no el
    // nombre de la cancha (que se mudó a la Sidebar, sin rol de heading) —
    // "sigue operativo" se verifica con el título por defecto ("Reservas").
    expect(screen.getByRole("heading", { name: "Reservas" })).toBeTruthy();

    warnSpy.mockRestore();
  });

  it("data>0: incrementa materializacionSignal y lo propaga a Reservas y Agenda", async () => {
    reservasApiMock.materializarTurnosFijosJugados.mockResolvedValueOnce({ data: 2, error: null });
    renderShell();

    await waitFor(() =>
      expect(screen.getByTestId("reservas-view-stub").textContent).toContain("materializacion: 1"),
    );
    expect(screen.getByTestId("agenda-view-stub").textContent).toContain("materializacion: 1");
  });
});

// R2 — cableado de la navegación nueva: los 10 destinos existen y muestran
// su vista correspondiente, Torneos no aparece, y el título de PageHeader
// sigue a la vista actual. El comportamiento propio de cada vista ya está
// cubierto en su propio archivo de test (todas mockeadas acá arriba).
describe("AdminShell — navegación (R2)", () => {
  it("Torneos no aparece en ningún lado de la navegación", () => {
    renderShell();
    expect(screen.queryByText("Torneos")).toBeNull();
  });

  const destinos: ReadonlyArray<[string, string]> = [
    ["Agenda", "agenda-view-stub"],
    ["Turnos fijos", "turnos-fijos-view-stub"],
    ["Bloqueos", "bloqueos-view-stub"],
    ["Vender", "vender-view-stub"],
    ["Productos", "productos-view-stub"],
    ["Historial", "historial-view-stub"],
    ["Caja", "caja-view-stub"],
    ["Reportes", "reportes-view-stub"],
    ["Backup", "backup-view-stub"],
  ];

  it.each(destinos)("navegar a %s muestra su vista y actualiza el título", async (label, testId) => {
    const user = userEvent.setup();
    renderShell();

    await user.click(navPrincipal().getByRole("button", { name: label }));

    expect(screen.getByTestId(testId)).toBeTruthy();
    expect(screen.getByRole("heading", { name: label })).toBeTruthy();
  });

  it("Reservas ya no incluye ningún indicio de Caja (se movió a su propio destino)", () => {
    renderShell();
    expect(screen.queryByLabelText("Cierre de caja")).toBeNull();
    expect(screen.queryByText("Caja semanal")).toBeNull();
  });
});

// P5 — bug real: al volver de otra pestaña del navegador, la sección activa
// a veces se reseteaba. Causa raíz (useAdminAuth.test.ts): un TOKEN_REFRESHED
// de la MISMA sesión reabría el gate completo y desmontaba AdminShell entero
// (main-admin.tsx solo renderiza <AdminShell> con fase "autenticado"). Ese
// fix evita el remount en el caso común; sessionStorage (acá) es el backstop
// para CUALQUIER otro remount real (F5, etc.) — estos tests simulan
// directamente "AdminShell se desmontó y se volvió a montar" con
// unmount()+render() en la misma pestaña (mismo sessionStorage), sin
// necesitar reproducir el evento de Supabase.
describe("AdminShell — P5 persistencia de navegación (sessionStorage)", () => {
  it("sin nada guardado, arranca en Reservas (default de siempre)", () => {
    renderShell();
    expect(screen.getByRole("heading", { name: "Reservas" })).toBeTruthy();
  });

  it.each([
    ["Vender", "vender-view-stub"],
    ["Caja", "caja-view-stub"],
    ["Productos", "productos-view-stub"],
    ["Agenda", "agenda-view-stub"],
  ])("navegar a %s y remontar AdminShell (mismo tab) restaura esa misma sección", async (label, testId) => {
    const user = userEvent.setup();
    const { unmount } = renderShell();
    await user.click(navPrincipal().getByRole("button", { name: label }));
    expect(screen.getByRole("heading", { name: label })).toBeTruthy();

    // Simula el remount real: se desmonta AdminShell y se vuelve a montar
    // (mismo sessionStorage de la pestaña, sin pasar por logout).
    unmount();
    renderShell();

    expect(screen.getByTestId(testId)).toBeTruthy();
    expect(screen.getByRole("heading", { name: label })).toBeTruthy();
  });

  it("un remount NO dispara refetch extra de lo que ya estaba cargado (solo restaura la sección, sin recargar todo desde cero de más)", async () => {
    const user = userEvent.setup();
    const { unmount } = renderShell();
    await user.click(navPrincipal().getByRole("button", { name: "Agenda" }));
    unmount();
    reservasApiMock.materializarTurnosFijosJugados.mockClear();

    renderShell();

    // El montaje SÍ dispara su propia carga inicial una vez (comportamiento
    // normal de un componente que se monta) — lo que se prueba es que
    // restaurar la sección no la duplica ni la llama dos veces de más.
    expect(reservasApiMock.materializarTurnosFijosJugados).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeTruthy();
  });

  it("un valor guardado inválido (corrupto o de una versión vieja del nav) cae al default 'Reservas', sin romper", () => {
    window.sessionStorage.setItem("lap-vista-activa", "esto-no-es-una-vista-real");

    renderShell();

    expect(screen.getByRole("heading", { name: "Reservas" })).toBeTruthy();
  });

  it("logout limpia la sección guardada: un login siguiente en la misma pestaña no restaura la sección de la sesión anterior", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    const { unmount } = renderShell(onLogout);
    await user.click(navPrincipal().getByRole("button", { name: "Vender" }));
    expect(screen.getByTestId("vender-view-stub")).toBeTruthy();

    await user.click(screen.getByLabelText("Cerrar sesión"));
    const modal = screen.getByRole("dialog", { name: "Confirmar cierre de sesión" });
    await user.click(within(modal).getByRole("button", { name: "Sí, cerrar sesión" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    unmount();

    // Simula el remount de AdminShell tras un login siguiente en la MISMA
    // pestaña (mismo AdminApp, nueva sesión) — no debería aparecer Vender.
    renderShell();

    expect(screen.getByRole("heading", { name: "Reservas" })).toBeTruthy();
  });
});

// Notificaciones — la campana deriva de las MISMAS instancias compartidas de
// AdminShell (jugadas, próximas, productos). Vistas mockeadas, hooks reales.
describe("AdminShell — campana de notificaciones", () => {
  function cargarDatos({ jugadas = [], proximas = [], productos = [] }: { jugadas?: ReservaRow[]; proximas?: ReservaRow[]; productos?: ReturnType<typeof crearProducto>[] } = {}) {
    reservasApiMock.obtenerReservasPorRango.mockResolvedValue({ data: jugadas, error: null });
    reservasApiMock.obtenerReservasProximas.mockResolvedValue({ data: proximas, error: null });
    vi.mocked(obtenerProductos).mockResolvedValue({ data: productos, error: null } as never);
  }

  function preparar() {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA);
    window.localStorage.clear();
  }

  afterEach(() => {
    reservasApiMock.obtenerReservasPorRango.mockResolvedValue({ data: [], error: null });
    reservasApiMock.obtenerReservasProximas.mockResolvedValue({ data: [], error: null });
    vi.mocked(obtenerProductos).mockResolvedValue({ data: [], error: null } as never);
    window.localStorage.clear();
  });

  const campana = (nombre: string | RegExp) => screen.findByRole("button", { name: nombre });

  it("suma pendientes de las tres fuentes sin recargar la app", async () => {
    preparar();
    cargarDatos({
      jugadas: [crearReserva({ id: "j1" }), crearReserva({ id: "j2" })],
      proximas: [crearPendiente()],
      productos: [crearProducto({ id: "p1", stock_actual: 0 })],
    });
    renderShell();
    expect(await campana("Notificaciones, 4 pendientes")).toBeTruthy();
  });

  it("registrar un pago (invalidación económica) baja el badge sin recargar", async () => {
    preparar();
    cargarDatos({ jugadas: [crearReserva({ id: "j1" }), crearReserva({ id: "j2" }), crearReserva({ id: "j3" })] });
    renderShell();
    expect(await campana("Notificaciones, 3 pendientes")).toBeTruthy();

    // Se paga j1 desde otra vista: llega el evento compartido y jugadas recarga.
    cargarDatos({ jugadas: [crearReserva({ id: "j1", pago_efectivo: 20000 }), crearReserva({ id: "j2" }), crearReserva({ id: "j3" })] });
    act(() => invalidarEconomia({ reservaId: "j1" }));

    expect(await campana("Notificaciones, 2 pendientes")).toBeTruthy();
  });

  it("una reserva nueva por Realtime aparece en la campana aunque Reservas no esté a la vista", async () => {
    preparar();
    cargarDatos();
    const user = userEvent.setup();
    renderShell();
    await campana("Notificaciones, 0 pendientes");
    await user.click(navPrincipal().getByRole("button", { name: "Vender" }));

    cargarDatos({ proximas: [crearPendiente()] });
    act(() => {
      canalMock.handler!({ new: crearReservaInsertada({ id: "p1", fecha: "2026-06-18", confirmada: false }) });
    });

    expect(await campana("Notificaciones, 1 pendiente")).toBeTruthy();
  });

  // Semana actual vs. semanas anteriores: useReservasJugadas pide la semana actual y
  // useReservasSinPagoHistoricas una ventana que termina el domingo previo. El mock
  // las distingue por el fin del rango, como haría la base.
  function cargarPorSemana({ semana = [], historicas = [], inicioSemanaActual = "2026-06-15" }: { semana?: ReservaRow[]; historicas?: ReservaRow[]; inicioSemanaActual?: string }) {
    reservasApiMock.obtenerReservasPorRango.mockImplementation(async (_inicio: string, fin: string) => ({
      data: fin < inicioSemanaActual ? historicas : semana,
      error: null,
    }));
  }

  it("un turno sin pago de una semana anterior sigue apareciendo, junto con los de esta semana", async () => {
    preparar();
    cargarPorSemana({
      semana: [crearReserva({ id: "s1", fecha: "2026-06-16" })],
      historicas: [crearReserva({ id: "h1", fecha: "2026-06-09" }), crearReserva({ id: "h2", fecha: "2026-05-28" })],
    });
    renderShell();
    expect(await campana("Notificaciones, 3 pendientes")).toBeTruthy();
  });

  it("registrar el pago de un turno de una semana anterior lo saca de la campana", async () => {
    preparar();
    cargarPorSemana({
      semana: [crearReserva({ id: "s1", fecha: "2026-06-16" })],
      historicas: [crearReserva({ id: "h1", fecha: "2026-06-09" }), crearReserva({ id: "h2", fecha: "2026-05-28" })],
    });
    renderShell();
    expect(await campana("Notificaciones, 3 pendientes")).toBeTruthy();

    // ReservasView paga con jugadas.actualizarLocal tras guardarPago.
    const { jugadas } = reservasViewMock.ReservasView.mock.calls.at(-1)![0] as unknown as {
      jugadas: { actualizarLocal: (fn: (prev: never[]) => never[]) => void };
    };
    act(() => jugadas.actualizarLocal(((prev: never[]) => aplicarPago(prev as never, "h1", { efectivo: 20000, transferencia: 0 })) as never));

    expect(await campana("Notificaciones, 2 pendientes")).toBeTruthy();
  });

  it("el cambio domingo → lunes no elimina un turno sin pago ya conocido", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-21T23:00:00")); // domingo 21/06, última hora de la semana
    window.localStorage.clear();
    cargarPorSemana({ semana: [crearReserva({ id: "del-martes", fecha: "2026-06-16" })], inicioSemanaActual: "2026-06-15" });
    renderShell();
    expect(await campana("Notificaciones, 1 pendiente")).toBeTruthy();

    // Pasa la medianoche: la semana actual pasa a ser 22/06 y su consulta ya no incluye el martes 16.
    vi.setSystemTime(new Date("2026-06-22T00:30:00"));
    cargarPorSemana({ semana: [], historicas: [crearReserva({ id: "del-martes", fecha: "2026-06-16" })], inicioSemanaActual: "2026-06-22" });
    act(() => invalidarEconomia({ reservaId: "cualquiera" })); // recarga jugadas: rearma la semana nueva

    // Esperar a que la recarga se resuelva y se recalcule con la fecha nueva.
    await waitFor(() => expect(reservasApiMock.obtenerReservasPorRango).toHaveBeenCalledTimes(3));
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    expect(await campana("Notificaciones, 1 pendiente")).toBeTruthy();
  });

  it("CTA de turnos sin pago: va a Reservas y le pide la pestaña Jugadas", async () => {
    preparar();
    cargarDatos({ jugadas: [crearReserva({ id: "j1" })] });
    const user = userEvent.setup();
    renderShell();
    await user.click(navPrincipal().getByRole("button", { name: "Vender" }));

    await user.click(await campana("Notificaciones, 1 pendiente"));
    await user.click(await screen.findByRole("button", { name: "Ver reservas: 1 turno sin pago" }));

    expect(screen.getByRole("heading", { name: "Reservas" })).toBeTruthy();
    const ultimo = reservasViewMock.ReservasView.mock.calls.at(-1)![0] as { activo?: boolean; enfoque?: { tab: string } | null };
    expect(ultimo.activo).toBe(true);
    expect(ultimo.enfoque?.tab).toBe("jugadas");
  });

  it("CTA de stock bajo: va a Productos", async () => {
    preparar();
    cargarDatos({ productos: [crearProducto({ id: "p1", stock_actual: 0 })] });
    const user = userEvent.setup();
    renderShell();

    await user.click(await campana("Notificaciones, 1 pendiente"));
    await user.click(await screen.findByRole("button", { name: "Ver productos: 1 producto con stock bajo" }));

    expect(screen.getByRole("heading", { name: "Productos" })).toBeTruthy();
  });
});
