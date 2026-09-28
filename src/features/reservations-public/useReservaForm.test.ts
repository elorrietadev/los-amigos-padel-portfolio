/** @vitest-environment jsdom */
// C2 — regresión de seguridad: aunque se manipule el frontend (o se llame al
// hook con cualquier estado), el payload real que sale hacia crear_reserva
// nunca puede incluir un precio. Antes de C2 esto dependía de que el
// servidor IGNORARA p_precio; ahora ni siquiera existe el campo, y este test
// confirma en runtime que useReservaForm no lo arma.
import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { ConfigReserva, ConfiguracionReservas, FranjaOperativa } from "./reservations.types";
import { useReservaForm } from "./useReservaForm";

const crearReservaMock = vi.hoisted(() => vi.fn());
vi.mock("./reservations.api", () => ({ crearReserva: crearReservaMock, cotizarReserva: vi.fn().mockResolvedValue({ data: 20000, error: null }) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

const config: ConfigReserva = {
  nombreCancha: "Cancha de test",
  precioHora: 20000,
  horaApertura: "08:00",
  horaCierre: "23:00",
  whatsappNumero: "5490000000000",
};

// C4 — franja_operativa ya resuelta para la fecha de estos tests: mismo
// horario que `config` tenía antes (ya no se lee de ahí), día abierto.
const franja: FranjaOperativa = { cerrado: false, horaApertura: "08:00", horaCierre: "23:00" };

// C5/C6 — configuracion_cancha ya resuelta: mismos 60/180/14/0/3 que las
// constantes hardcodeadas de antes (ya no se leen de ahí).
const configuracionReservas: ConfiguracionReservas = {
  duracionMinima: 60,
  duracionMaxima: 180,
  anticipacionMaximaDias: 14,
  anticipacionMinimaMinutos: 0,
  limiteReservasActivasTelefono: 3,
};

// FINAL-F5-B — verificación anti-bot ya resuelta (token de un solo uso + reiniciar()).
const turnstile = { token: "token-de-prueba" as string | null, reiniciar: vi.fn() };

function disponibilidadVacia() {
  return { reservasDelDia: [], refrescar: vi.fn() };
}

describe("useReservaForm — payload hacia crear_reserva (C2)", () => {
  it("el objeto enviado a crearReserva nunca incluye p_precio ni ningún otro campo de precio", async () => {
    crearReservaMock.mockResolvedValue({
      data: { precio: 20000 },
      error: null,
    });

    const { result } = renderHook(() =>
      useReservaForm("2026-01-01", disponibilidadVacia(), config, franja, configuracionReservas, turnstile),
    );

    act(() => result.current.seleccionarHoraInicio("10:00"));
    act(() => result.current.seleccionarHoraFin("11:00"));
    act(() => result.current.actualizarNombre("Juan Perez"));
    act(() => result.current.actualizarTelefono("3775000000"));
    await waitFor(() => expect(result.current.cotizacion.loading).toBe(false));

    await act(async () => {
      await result.current.confirmarReserva();
    });

    expect(crearReservaMock).toHaveBeenCalledTimes(1);
    const argsEnviados = crearReservaMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(argsEnviados).sort()).toEqual(
      ["p_fecha", "p_hora_fin", "p_hora_inicio", "p_nombre", "p_telefono"].sort(),
    );
    expect(argsEnviados).not.toHaveProperty("p_precio");
  });

  it("usa el precio autoritativo que devuelve el servidor, no el estimado local, para la pantalla de éxito", async () => {
    crearReservaMock.mockResolvedValue({
      data: { precio: 27000 }, // distinto del estimado local (20000) a propósito
      error: null,
    });

    const { result } = renderHook(() =>
      useReservaForm("2026-01-01", disponibilidadVacia(), config, franja, configuracionReservas, turnstile),
    );

    act(() => result.current.seleccionarHoraInicio("10:00"));
    act(() => result.current.seleccionarHoraFin("11:00"));
    act(() => result.current.actualizarNombre("Juan Perez"));
    act(() => result.current.actualizarTelefono("3775000000"));
    await waitFor(() => expect(result.current.cotizacion.loading).toBe(false));

    await act(async () => {
      await result.current.confirmarReserva();
    });

    expect(result.current.exito?.precio).toBe(27000);
  });
});

// PUBLIC-R7 — guard de reentrada explícito (mismo patrón que confirmarBaja):
// llamar confirmarReserva mientras la primera llamada sigue en vuelo no debe
// disparar una segunda RPC. El botón de la UI ya deshabilita con `guardando`,
// pero eso depende de un re-render que llega DESPUÉS del primer click —
// esto prueba la protección real, a nivel del hook, sin pasar por React DOM.
describe("useReservaForm — guard de reentrada en confirmarReserva", () => {
  it("llamar confirmarReserva dos veces mientras la primera sigue en vuelo solo dispara crearReserva una vez", async () => {
    let resolverPrimera: (v: unknown) => void = () => {};
    crearReservaMock.mockReturnValue(
      new Promise((resolve) => {
        resolverPrimera = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useReservaForm("2026-01-01", disponibilidadVacia(), config, franja, configuracionReservas, turnstile),
    );

    act(() => result.current.seleccionarHoraInicio("10:00"));
    act(() => result.current.seleccionarHoraFin("11:00"));
    act(() => result.current.actualizarNombre("Juan Perez"));
    act(() => result.current.actualizarTelefono("3775000000"));
    await waitFor(() => expect(result.current.cotizacion.loading).toBe(false));

    let primeraPromesa!: Promise<void>;
    act(() => {
      primeraPromesa = result.current.confirmarReserva();
    });
    // Segunda llamada mientras `guardando` ya es true pero antes de que la
    // primera resuelva — es exactamente la ventana que un doble click/Enter
    // muy rápido explota si no hay guard.
    await act(async () => {
      await result.current.confirmarReserva();
    });

    resolverPrimera({ data: { precio: 20000 }, error: null });
    await act(async () => {
      await primeraPromesa;
    });

    expect(crearReservaMock).toHaveBeenCalledTimes(1);
  });
});

// C4 — la franja operativa (no configCancha) es la fuente de horaApertura/
// horaCierre para la disponibilidad pública.
describe("useReservaForm — franja operativa (C4)", () => {
  it("día cerrado: expone cerrado=true y no ofrece ningún horario", () => {
    const franjaCerrada: FranjaOperativa = { cerrado: true, horaApertura: null, horaCierre: null };
    const { result } = renderHook(() =>
      useReservaForm("2026-01-01", disponibilidadVacia(), config, franjaCerrada, configuracionReservas, turnstile),
    );

    expect(result.current.cerrado).toBe(true);
    expect(result.current.horasInicioDisponibles).toEqual([]);
  });

  it("sin franja todavía (loading): no ofrece horarios ni explota", () => {
    const { result } = renderHook(() =>
      useReservaForm("2026-01-01", disponibilidadVacia(), config, null, configuracionReservas, turnstile),
    );

    expect(result.current.cerrado).toBe(false);
    expect(result.current.horasInicioDisponibles).toEqual([]);
  });
});

// C5/C6 — la configuración de reservas (no constantes hardcodeadas) es la
// fuente de duracionMinima/duracionMaxima/anticipación/límite para la
// disponibilidad pública.
describe("useReservaForm — configuración de reservas (C5/C6)", () => {
  it("sin configuración todavía (loading): no ofrece horarios ni explota", () => {
    const { result } = renderHook(() => useReservaForm("2026-01-01", disponibilidadVacia(), config, franja, null, turnstile));

    expect(result.current.horasInicioDisponibles).toEqual([]);
    expect(result.current.horasFinDisponibles).toEqual([]);
  });

  it("usa duracionMinima/duracionMaxima de la config, no 60/180 hardcodeados", () => {
    const configuracionCustom: ConfiguracionReservas = { ...configuracionReservas, duracionMinima: 90, duracionMaxima: 120 };
    const { result } = renderHook(() =>
      useReservaForm("2026-01-01", disponibilidadVacia(), config, franja, configuracionCustom, turnstile),
    );

    // Con apertura 08:00 y duración mínima 90, el primer horario de inicio
    // sigue siendo 08:00 (fin en 09:30 entra dentro del horario 08:00-23:00).
    expect(result.current.horasInicioDisponibles[0]).toBe("08:00");

    act(() => result.current.seleccionarHoraInicio("08:00"));
    // Con min=90/max=120, las únicas horas de fin ofrecidas son 09:30 (90min)
    // y 10:00 (120min) — nunca 09:00 (60min, ya no permitido) ni 10:30+ (150min).
    expect(result.current.horasFinDisponibles).toEqual(["09:30", "10:00"]);
  });

  // C6 — el mensaje de LIMITE_TELEFONO usa limiteReservasActivasTelefono de
  // la config real, no un "3" hardcodeado en el texto.
  it("LIMITE_TELEFONO: el mensaje usa el límite configurado, no un 3 hardcodeado", async () => {
    crearReservaMock.mockResolvedValue({ data: null, error: { message: "LIMITE_TELEFONO" } });
    const configuracionCustom: ConfiguracionReservas = { ...configuracionReservas, limiteReservasActivasTelefono: 5 };
    const { result } = renderHook(() =>
      useReservaForm("2026-01-01", disponibilidadVacia(), config, franja, configuracionCustom, turnstile),
    );

    act(() => result.current.seleccionarHoraInicio("10:00"));
    act(() => result.current.seleccionarHoraFin("11:00"));
    act(() => result.current.actualizarNombre("Juan Perez"));
    act(() => result.current.actualizarTelefono("3775000000"));
    await waitFor(() => expect(result.current.cotizacion.loading).toBe(false));

    await act(async () => {
      await result.current.confirmarReserva();
    });

    expect(result.current.mensaje?.texto).toContain("Ya tenés 5 turnos activos");
  });
});

describe("useReservaForm — topes de nombre y teléfono (F5-A)", () => {
  function montar() {
    return renderHook(() => useReservaForm("2026-01-01", disponibilidadVacia(), config, franja, configuracionReservas, turnstile));
  }

  it("nombre: se corta a 80 caracteres", () => {
    const { result } = montar();
    act(() => result.current.actualizarNombre("a".repeat(500)));
    expect(result.current.nombre).toBe("a".repeat(80));
  });

  it("nombre: un nombre de exactamente 80 se conserva entero", () => {
    const { result } = montar();
    act(() => result.current.actualizarNombre("ñ".repeat(80)));
    expect(result.current.nombre).toBe("ñ".repeat(80));
  });

  it("nombre: tabs y saltos de línea pegados pasan a espacio (el servidor rechaza los caracteres de control); letras y acentos se conservan", () => {
    const { result } = montar();
    act(() => result.current.actualizarNombre("Ana" + String.fromCharCode(9) + "María" + String.fromCharCode(10) + "Pérez"));
    expect(result.current.nombre).toBe("Ana María Pérez");
  });

  it("nombre: el filtro previo de letras/espacios sigue igual (sin dígitos ni símbolos)", () => {
    const { result } = montar();
    act(() => result.current.actualizarNombre("Juan123 <b>Pérez</b>"));
    expect(result.current.nombre).toBe("Juan bPérezb");
  });

  it("teléfono: solo dígitos y se corta a 20", () => {
    const { result } = montar();
    act(() => result.current.actualizarTelefono("+54 9 11 5555-5555" + "1".repeat(50)));
    expect(result.current.telefono).toMatch(/^[0-9]{20}$/);
    expect(result.current.telefono.startsWith("5491155555555")).toBe(true);
  });

  it("NOMBRE_INVALIDO del servidor: se muestra el mensaje propio, no el genérico", async () => {
    crearReservaMock.mockResolvedValue({ data: null, error: { message: "NOMBRE_INVALIDO" } });
    const { result } = montar();
    act(() => result.current.seleccionarHoraInicio("10:00"));
    act(() => result.current.seleccionarHoraFin("11:00"));
    act(() => result.current.actualizarNombre("A"));
    act(() => result.current.actualizarTelefono("3775000000"));
    await waitFor(() => expect(result.current.cotizacion.loading).toBe(false));
    await act(async () => {
      await result.current.confirmarReserva();
    });
    expect(result.current.mensaje?.texto).toBe("El nombre ingresado no es válido. Usá entre 2 y 80 caracteres.");
  });
});

describe("useReservaForm — Turnstile (F5-B)", () => {
  function montar(t: { token: string | null; reiniciar: () => void } = turnstile) {
    return renderHook(() => useReservaForm("2026-01-01", disponibilidadVacia(), config, franja, configuracionReservas, t));
  }
  async function completarYConfirmar(result: ReturnType<typeof montar>["result"]) {
    act(() => result.current.seleccionarHoraInicio("10:00"));
    act(() => result.current.seleccionarHoraFin("11:00"));
    act(() => result.current.actualizarNombre("Juan Perez"));
    act(() => result.current.actualizarTelefono("3775000000"));
    await waitFor(() => expect(result.current.cotizacion.loading).toBe(false));
    await act(async () => {
      await result.current.confirmarReserva();
    });
  }

  it("el token viaja como 2º argumento y NO se mezcla con los 5 campos de la reserva", async () => {
    crearReservaMock.mockClear();
    crearReservaMock.mockResolvedValue({ data: { precio: 20000 }, error: null });
    const { result } = montar();
    await completarYConfirmar(result);
    expect(crearReservaMock.mock.calls[0]![1]).toBe("token-de-prueba");
    expect(Object.keys(crearReservaMock.mock.calls[0]![0] as object)).not.toContain("turnstileToken");
  });

  it("reinicia el widget (token single-use) después de un intento exitoso", async () => {
    crearReservaMock.mockResolvedValue({ data: { precio: 20000 }, error: null });
    const t = { token: "tok", reiniciar: vi.fn() };
    const { result } = montar(t);
    await completarYConfirmar(result);
    expect(t.reiniciar).toHaveBeenCalledTimes(1);
  });

  it("reinicia el widget también cuando el intento falla", async () => {
    crearReservaMock.mockResolvedValue({ data: null, error: { message: "HORARIO_OCUPADO" } });
    const t = { token: "tok", reiniciar: vi.fn() };
    const { result } = montar(t);
    await completarYConfirmar(result);
    expect(t.reiniciar).toHaveBeenCalledTimes(1);
    expect(result.current.mensaje?.texto).toContain("ya fue reservado");
  });

  it("sin token no envía nada, no reinicia y avisa", async () => {
    crearReservaMock.mockClear();
    const t = { token: null, reiniciar: vi.fn() };
    const { result } = montar(t);
    await completarYConfirmar(result);
    expect(crearReservaMock).not.toHaveBeenCalled();
    expect(t.reiniciar).not.toHaveBeenCalled();
    expect(result.current.mensaje?.texto).toContain("verificando");
  });

  it("doble submit con la 1ª en vuelo: una sola llamada y un solo reinicio", async () => {
    crearReservaMock.mockClear();
    let resolver: (v: unknown) => void = () => {};
    crearReservaMock.mockReturnValue(
      new Promise((r) => {
        resolver = r;
      }),
    );
    const t = { token: "tok", reiniciar: vi.fn() };
    const { result } = montar(t);
    act(() => result.current.seleccionarHoraInicio("10:00"));
    act(() => result.current.seleccionarHoraFin("11:00"));
    act(() => result.current.actualizarNombre("Juan Perez"));
    act(() => result.current.actualizarTelefono("3775000000"));
    await waitFor(() => expect(result.current.cotizacion.loading).toBe(false));
    let primera!: Promise<void>;
    act(() => {
      primera = result.current.confirmarReserva();
    });
    await act(async () => {
      await result.current.confirmarReserva();
    });
    resolver({ data: { precio: 20000 }, error: null });
    await act(async () => {
      await primera;
    });
    expect(crearReservaMock).toHaveBeenCalledTimes(1);
    expect(t.reiniciar).toHaveBeenCalledTimes(1);
  });

  it("TURNSTILE_FALLIDO / DEMASIADOS_INTENTOS / ERROR_TEMPORAL muestran su mensaje propio", async () => {
    for (const [message, retryAfter, esperado] of [
      ["TURNSTILE_FALLIDO", undefined, "verificar que sos una persona"],
      ["DEMASIADOS_INTENTOS", 240, "Esperá 4 minutos"],
      ["ERROR_TEMPORAL", undefined, "no está disponible por un momento"],
    ] as const) {
      crearReservaMock.mockResolvedValue({ data: null, error: { message, retryAfter } });
      const { result } = montar({ token: "tok", reiniciar: vi.fn() });
      await completarYConfirmar(result);
      expect(result.current.mensaje?.texto).toContain(esperado);
    }
  });
});

describe("flujo activo y guard inmediato", () => {
  async function preparado() {
    const t = { token: "nuevo-token", reiniciar: vi.fn() };
    const hook = renderHook(() => useReservaForm("2026-10-01", disponibilidadVacia(), config, franja, configuracionReservas, t));
    act(() => {
      hook.result.current.seleccionarHoraInicio("10:00");
      hook.result.current.actualizarNombre("Juan Perez");
      hook.result.current.actualizarTelefono("3775000000");
    });
    act(() => hook.result.current.seleccionarHoraFin("11:00"));
    await act(async () => {});
    expect(hook.result.current.cotizacion.precios["11:00"]).toBe(20000);
    return { ...hook, t };
  }
  it("dos invocaciones del MISMO handler en el mismo evento envian una vez", async () => {
    let resolver!: (v: unknown) => void;
    crearReservaMock.mockReturnValue(new Promise((r) => { resolver = r; }));
    const { result } = await preparado();
    const handler = result.current.confirmarReserva;
    let primera!: Promise<void>;
    act(() => { primera = handler(); void handler(); });
    expect(crearReservaMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolver({ data: null, error: { message: "HORARIO_OCUPADO" } }); await primera; });
    await act(async () => handler());
    expect(crearReservaMock).toHaveBeenCalledTimes(1); // tampoco reutiliza el token consumido
  });
  it("M7: otra reserva cancela el timer de WhatsApp", async () => {
    vi.useFakeTimers();
    crearReservaMock.mockResolvedValue({ data: { precio: 20000 }, error: null });
    const { result } = await preparado();
    await act(async () => result.current.confirmarReserva());
    expect(result.current.exito).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    act(() => result.current.cerrarExito());
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(result.current.exito).toBeNull();
  });
  it("M7/M8: POST resuelve desmontado sin resetear widget ni crear timers", async () => {
    vi.useFakeTimers();
    let resolver!: (v: unknown) => void;
    crearReservaMock.mockReturnValue(new Promise((r) => { resolver = r; }));
    const { result, unmount, t } = await preparado();
    let peticion!: Promise<void>;
    act(() => { peticion = result.current.confirmarReserva(); });
    unmount();
    await act(async () => { resolver({ data: { precio: 1 }, error: null }); await peticion; });
    expect(t.reiniciar).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("M8: incierta bloquea hasta verificar, exige token nuevo y retry manual", async () => {
    crearReservaMock.mockResolvedValue({ data: null, error: { message: "RESERVA_INCIERTA" } });
    const { result, t, rerender } = await preparado();
    await act(async () => result.current.confirmarReserva());
    expect(result.current.incierta).toBe(true);
    expect(result.current.mensaje?.texto).toContain("podr");
    t.token = "otro-token"; rerender();
    await act(async () => result.current.confirmarReserva());
    expect(crearReservaMock).toHaveBeenCalledTimes(1);
    act(() => result.current.habilitarReintento());
    crearReservaMock.mockResolvedValue({ data: { precio: 27000 }, error: null });
    await act(async () => result.current.confirmarReserva());
    expect(crearReservaMock).toHaveBeenCalledTimes(2);
    expect(result.current.exito?.precio).toBe(27000);
  });
  it("la consulta incierta conserva el intento enviado aunque se editen los campos", async () => {
    crearReservaMock.mockResolvedValue({ data: null, error: { message: "RESERVA_INCIERTA" } });
    const { result } = await preparado();
    await act(async () => result.current.confirmarReserva());
    act(() => {
      result.current.actualizarNombre("Otra Persona");
      result.current.seleccionarHoraInicio("12:00");
    });
    await act(async () => {});
    expect(result.current.reservaIncierta).toEqual({ fecha: "2026-10-01", horaInicio: "10:00", horaFin: "11:00", nombre: "Juan Perez" });
    expect(result.current.incierta).toBe(true);
    expect(crearReservaMock).toHaveBeenCalledTimes(1);
  });
});
