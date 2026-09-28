/** @vitest-environment jsdom */
// FINAL-F5-B — useTurnstile: render explícito, single-use (reiniciar), vencimiento y fallos.
// api.js de Cloudflare está reemplazado por un fake en window.turnstile: sin Internet.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_ACTION, SCRIPT_TIMEOUT_MS, WIDGET_TIMEOUT_MS, useTurnstile } from "./useTurnstile";

type Opciones = Record<string, unknown> & {
  callback: (t: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": () => boolean | void;
};

let opciones: Opciones;
const fakeApi = {
  render: vi.fn((_el: HTMLElement, o: Opciones) => {
    opciones = o;
    return "widget-1";
  }),
  reset: vi.fn(),
  remove: vi.fn(),
};

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

function montar(siteKey: string | null = "1x00000000000000000000AA") {
  const hook = renderHook(() => useTurnstile(siteKey));
  // El contenedor real lo aporta la vista: acá se simula con un <div>.
  act(() => hook.result.current.contenedorRef(document.createElement("div")));
  return hook;
}

beforeEach(() => {
  fakeApi.render.mockClear();
  fakeApi.reset.mockReset();
  fakeApi.remove.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { turnstile?: unknown }).turnstile;
});

// OJO al orden: cargarTurnstile() cachea la promesa resuelta a nivel de módulo, así que el
// caso de fallo de carga va PRIMERO (mientras el módulo todavía no cargó nada).
describe("useTurnstile — carga del script", () => {
  it("script nunca carga: timeout, retira script y permite retry manual", async () => {
    vi.useFakeTimers();
    const { result, unmount } = montar();
    await flush();
    await act(async () => vi.advanceTimersByTimeAsync(SCRIPT_TIMEOUT_MS));
    expect(result.current.estado).toBe("error");
    expect(document.head.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
    act(() => result.current.reiniciar());
    await flush();
    expect(result.current.estado).toBe("cargando");
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]')!;
    act(() => script.onerror?.(new Event("error")));
    await flush();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si api.js no carga (bloqueador/red/CSP): estado 'error', y 'reiniciar' reintenta la carga", async () => {
    const { result } = montar();
    await flush();
    const scripts = () =>
      [...document.head.querySelectorAll<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]')];
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]!.src).toContain("render=explicit");

    act(() => scripts()[0]!.onerror?.(new Event("error")));
    await flush();
    expect(result.current.estado).toBe("error");
    expect(result.current.token).toBeNull();
    expect(scripts()).toHaveLength(0); // el <script> fallido se retira

    act(() => result.current.reiniciar());
    await flush();
    expect(scripts()).toHaveLength(1); // reintento real

    (window as unknown as { turnstile: unknown }).turnstile = fakeApi;
    act(() => scripts()[0]!.onload?.(new Event("load")));
    await flush();
    expect(fakeApi.render).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe("cargando");
  });
});

describe("useTurnstile — widget", () => {
  beforeEach(() => {
    (window as unknown as { turnstile: unknown }).turnstile = fakeApi;
  });

  it("renderiza en modo administrado 'interaction-only' con action y sitekey, y arranca sin token", async () => {
    const { result } = montar("mi-sitekey");
    await flush();
    expect(fakeApi.render).toHaveBeenCalledTimes(1);
    expect(opciones).toMatchObject({
      sitekey: "mi-sitekey",
      action: TURNSTILE_ACTION,
      appearance: "interaction-only",
      size: "compact",
    });
    expect(TURNSTILE_ACTION).toBe("reservar");
    expect(result.current.token).toBeNull();
    expect(result.current.estado).toBe("cargando");
  });

  it("al resolver el desafío entrega el token y pasa a 'listo'", async () => {
    const { result } = montar();
    await flush();
    act(() => opciones.callback("token-1"));
    expect(result.current.token).toBe("token-1");
    expect(result.current.estado).toBe("listo");
  });

  it("token vencido / timeout: se descarta y vuelve a 'cargando' hasta que llegue otro", async () => {
    const { result } = montar();
    await flush();
    act(() => opciones.callback("token-1"));
    act(() => opciones["expired-callback"]());
    expect(result.current.token).toBeNull();
    expect(result.current.estado).toBe("cargando");
    act(() => opciones.callback("token-2"));
    expect(result.current.token).toBe("token-2");
    act(() => opciones["timeout-callback"]());
    expect(result.current.token).toBeNull();
  });

  it("error del widget: estado 'error', sin token, y silencia la consola de Turnstile (devuelve true)", async () => {
    const { result } = montar();
    await flush();
    act(() => opciones.callback("token-1"));
    let devuelto: boolean | void = undefined;
    act(() => {
      devuelto = opciones["error-callback"]();
    });
    expect(devuelto).toBe(true);
    expect(result.current.estado).toBe("error");
    expect(result.current.token).toBeNull();
  });

  it("reiniciar(): descarta el token consumido y pide uno nuevo con widget.reset (single-use)", async () => {
    const { result } = montar();
    await flush();
    act(() => opciones.callback("token-1"));
    act(() => result.current.reiniciar());
    expect(result.current.token).toBeNull();
    expect(result.current.estado).toBe("cargando");
    expect(fakeApi.reset).toHaveBeenCalledWith("widget-1");
    act(() => opciones.callback("token-2"));
    expect(result.current.token).toBe("token-2");
  });

  it("reiniciar() tras un error del widget también pide un desafío nuevo", async () => {
    const { result } = montar();
    await flush();
    act(() => {
      opciones["error-callback"]();
    });
    act(() => result.current.reiniciar());
    expect(fakeApi.reset).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe("cargando");
  });

  it("si widget.reset falla, se vuelve a renderizar de cero", async () => {
    fakeApi.reset.mockImplementation(() => {
      throw new Error("widget muerto");
    });
    const { result } = montar();
    await flush();
    act(() => result.current.reiniciar());
    await flush();
    expect(fakeApi.remove).toHaveBeenCalled();
    expect(fakeApi.render).toHaveBeenCalledTimes(2);
  });

  it("al desmontar remueve el widget", async () => {
    const { unmount } = montar();
    await flush();
    unmount();
    expect(fakeApi.remove).toHaveBeenCalledWith("widget-1");
  });

  it("un callback tardío después de desmontar no rompe nada", async () => {
    const { unmount } = montar();
    await flush();
    const cb = opciones.callback;
    unmount();
    expect(() => cb("tarde")).not.toThrow();
  });

  it("sin site key: estado 'error' y no renderiza nada (la reserva queda bloqueada, no abierta)", async () => {
    const { result } = montar(null);
    await flush();
    expect(result.current.estado).toBe("error");
    expect(result.current.token).toBeNull();
    expect(fakeApi.render).not.toHaveBeenCalled();
  });
});

it("widget no responde, ignora token tardio y reinicia manualmente; expiracion acotada", async () => {
  vi.useFakeTimers();
  (window as unknown as { turnstile: unknown }).turnstile = fakeApi;
  const { result, unmount } = montar();
  await flush();
  await act(async () => vi.advanceTimersByTimeAsync(WIDGET_TIMEOUT_MS));
  expect(result.current.estado).toBe("error");
  act(() => opciones.callback("tarde"));
  expect(result.current.token).toBeNull();
  act(() => result.current.reiniciar());
  act(() => opciones.callback("nuevo"));
  expect(result.current.token).toBe("nuevo");
  act(() => opciones["expired-callback"]());
  expect(result.current.token).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(WIDGET_TIMEOUT_MS));
  expect(result.current.estado).toBe("error");
  unmount();
  act(() => opciones.callback("desmontado"));
  expect(vi.getTimerCount()).toBe(0);
});
