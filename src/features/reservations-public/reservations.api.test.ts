// FINAL-F5-B — crearReserva ahora habla con POST /api/reservar (no con PostgREST).
// fetch está mockeado: sin red, sin Supabase.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrearReservaArgs } from "./reservations.types";

// reservations.api importa lib/supabase, que exige VITE_SUPABASE_*: se stubea el módulo.
vi.mock("../../lib/supabase", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
import { supabase } from "../../lib/supabase";
import { crearReserva, RESERVAR_TIMEOUT_MS } from "./reservations.api";

const ARGS: CrearReservaArgs = {
  p_fecha: "2026-10-05",
  p_hora_inicio: "20:00",
  p_hora_fin: "21:00",
  p_nombre: "Juan Perez",
  p_telefono: "1144441234",
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("crearReserva (transporte a /api/reservar)", () => {
  it("POST JSON a /api/reservar con los 5 campos + token, y NUNCA precio ni llamada directa a Supabase", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, precio: 10000 }));
    await crearReserva(ARGS, "tok-123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/reservar");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      fecha: "2026-10-05",
      horaInicio: "20:00",
      horaFin: "21:00",
      nombre: "Juan Perez",
      telefono: "1144441234",
      turnstileToken: "tok-123",
    });
    expect(JSON.stringify(body)).not.toMatch(/precio/i);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("éxito -> { data: { precio }, error: null } con el precio autoritativo del servidor", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, precio: 27000 }));
    expect(await crearReserva(ARGS, "t")).toEqual({ data: { precio: 27000 }, error: null });
  });

  it.each(["HORARIO_OCUPADO", "LIMITE_TELEFONO", "TURNSTILE_FALLIDO", "TELEFONO_BLOQUEADO", "ERROR_TEMPORAL"])(
    "error de servidor %s -> error.message es el código",
    async (codigo) => {
      fetchMock.mockResolvedValue(json({ ok: false, codigo }, 409));
      expect(await crearReserva(ARGS, "t")).toEqual({ data: null, error: { message: codigo } });
    },
  );

  it("DEMASIADOS_INTENTOS conserva retryAfter", async () => {
    fetchMock.mockResolvedValue(json({ ok: false, codigo: "DEMASIADOS_INTENTOS", retryAfter: 120 }, 429));
    expect(await crearReserva(ARGS, "t")).toEqual({
      data: null,
      error: { message: "DEMASIADOS_INTENTOS", retryAfter: 120 },
    });
  });

  it("red caída -> RESERVA_INCIERTA (no propaga la excepción)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await crearReserva(ARGS, "t")).toEqual({ data: null, error: { message: "RESERVA_INCIERTA" } });
  });

  it.each([
    ["404 HTML (dev sin Function)", () => new Response("<html>not found</html>", { status: 404 })],
    ["502 sin cuerpo", () => new Response(null, { status: 502 })],
    ["200 con cuerpo raro", () => json({ algo: 1 })],
    ["200 con precio no numérico", () => json({ ok: true, precio: "10000" })],
    ["200 con array", () => json([])],
  ])("%s -> RESERVA_INCIERTA", async (_n, respuesta) => {
    fetchMock.mockResolvedValue(respuesta());
    expect(await crearReserva(ARGS, "t")).toEqual({ data: null, error: { message: "RESERVA_INCIERTA" } });
  });

  it("nunca trata como éxito un ok:true con status de error", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, precio: 1 }, 500));
    const r = await crearReserva(ARGS, "t");
    expect(r.data).toBeNull();
  });
});

it.each(["fetch", "body"])("timeout %s: una sola peticion, descarta respuesta tardia", async (fase) => {
  vi.useFakeTimers();
  let resolver!: (value: any) => void;
  const pendiente = new Promise((r) => { resolver = r; });
  fetchMock.mockReturnValue(fase === "fetch" ? pendiente : Promise.resolve({ ok: true, json: () => pendiente }));
  const peticion = crearReserva(ARGS, "token");
  await vi.advanceTimersByTimeAsync(RESERVAR_TIMEOUT_MS);
  expect(await peticion).toEqual({ data: null, error: { message: "RESERVA_INCIERTA" } });
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  resolver(fase === "fetch" ? json({ ok: true, precio: 1 }) : { ok: true, precio: 1 });
  await vi.runAllTimersAsync();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((await peticion).data).toBeNull();
});
