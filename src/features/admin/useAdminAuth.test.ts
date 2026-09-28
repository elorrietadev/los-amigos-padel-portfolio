/** @vitest-environment jsdom */
// E4.2 — gate estructural de admin: sesión (authenticated) ya no alcanza,
// hace falta is_admin() === true. Cubre el contrato fail-closed del hook:
// true entra, false/error deslogueani y muestran "no autorizado", sin sesión
// se comporta como antes, y una sesión restaurada (no solo login fresco)
// también pasa por el mismo chequeo.

import { act, renderHook, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdminAuth } from "./useAdminAuth";

type AuthChangeCallback = (event: string, session: Session | null) => void;

const listenerMock = vi.hoisted(() => ({
  callback: null as AuthChangeCallback | null,
}));

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn((cb: AuthChangeCallback) => {
      listenerMock.callback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
  rpc: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({ supabase: supabaseMock }));

function crearSesion(userId = "admin-1"): Session {
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: userId } as Session["user"],
  } as Session;
}

afterEach(() => {
  vi.clearAllMocks();
  listenerMock.callback = null;
});

describe("useAdminAuth — gate is_admin (E4.2)", () => {
  it("sesión + is_admin true -> entra (autenticado)", async () => {
    const sesion = crearSesion();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sesion } });
    supabaseMock.rpc.mockResolvedValue({ data: true, error: null });

    const { result } = renderHook(() => useAdminAuth());

    await waitFor(() => expect(result.current.estado.fase).toBe("autenticado"));
    expect(supabaseMock.rpc).toHaveBeenCalledWith("is_admin");
    expect(supabaseMock.auth.signOut).not.toHaveBeenCalled();
  });

  it("sesión + is_admin false -> no entra y hace signOut", async () => {
    const sesion = crearSesion("no-admin-1");
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sesion } });
    supabaseMock.rpc.mockResolvedValue({ data: false, error: null });
    supabaseMock.auth.signOut.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAdminAuth());

    await waitFor(() => expect(result.current.estado.fase).toBe("no_autorizado"));
    expect(supabaseMock.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("error al consultar is_admin -> no entra (fail closed, sin acceso por defecto)", async () => {
    const sesion = crearSesion();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sesion } });
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: "network error" } });
    supabaseMock.auth.signOut.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAdminAuth());

    await waitFor(() => expect(result.current.estado.fase).toBe("no_autorizado"));
    expect(supabaseMock.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("sin sesión -> comportamiento actual de login (sin_sesion, sin llamar is_admin)", async () => {
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useAdminAuth());

    await waitFor(() => expect(result.current.estado.fase).toBe("sin_sesion"));
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it("restauración de sesión admin -> entra correctamente", async () => {
    const sesion = crearSesion();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sesion } });
    supabaseMock.rpc.mockResolvedValue({ data: true, error: null });

    const { result } = renderHook(() => useAdminAuth());

    // Simula el evento que supabase-js dispara al restaurar una sesión ya
    // existente (no un login fresco vía signInWithPassword).
    await act(async () => {
      listenerMock.callback?.("INITIAL_SESSION", sesion);
    });

    await waitFor(() => expect(result.current.estado.fase).toBe("autenticado"));
    if (result.current.estado.fase === "autenticado") {
      expect(result.current.estado.session).toBe(sesion);
    }
  });

  // P5 — causa raíz del bug real "al volver de otra pestaña, la sección
  // activa se resetea": supabase-js dispara onAuthStateChange (típicamente
  // TOKEN_REFRESHED) al recuperar visibilidad, con la MISMA sesión ya
  // autenticada. Antes de este fix, resolverSesion reabría el gate completo
  // (fase "verificando_autorizacion") para CUALQUIER evento — y como
  // main-admin.tsx solo renderiza <AdminShell> con fase "autenticado", ese
  // parpadeo desmontaba todo el panel (ver AdminShell.tsx/P5). Este test
  // prueba la causa raíz en aislamiento: la fase nunca debe abandonar
  // "autenticado" para un evento con el mismo usuario, ni siquiera mientras
  // el refetch de is_admin() todavía está en vuelo.
  it("TOKEN_REFRESHED con la MISMA sesión ya autenticada: no reabre el gate visible mientras se reconfirma is_admin()", async () => {
    const sesion = crearSesion();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sesion } });
    supabaseMock.rpc.mockResolvedValueOnce({ data: true, error: null }); // login inicial

    const { result } = renderHook(() => useAdminAuth());
    await waitFor(() => expect(result.current.estado.fase).toBe("autenticado"));

    // Refetch de is_admin() para el refresh, deliberadamente sin resolver
    // todavía — si el gate se reabriera, se vería ACÁ, antes de resolver nada.
    let resolverRpc!: (v: { data: boolean; error: null }) => void;
    supabaseMock.rpc.mockReturnValueOnce(new Promise((r) => (resolverRpc = r)));

    await act(async () => {
      listenerMock.callback?.("TOKEN_REFRESHED", sesion);
    });

    // Mientras el refetch sigue en vuelo, la fase sigue "autenticado" — nunca
    // pasó por "verificando_autorizacion" (que hubiera desmontado AdminShell).
    expect(result.current.estado.fase).toBe("autenticado");

    await act(async () => {
      resolverRpc({ data: true, error: null });
    });

    expect(result.current.estado.fase).toBe("autenticado");
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(2); // el refetch SÍ ocurrió (fail-closed intacto)
  });

  it("TOKEN_REFRESHED con un usuario DISTINTO (sesión reemplazada) sí reabre el gate normal", async () => {
    const sesionA = crearSesion("admin-a");
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sesionA } });
    supabaseMock.rpc.mockResolvedValueOnce({ data: true, error: null });

    const { result } = renderHook(() => useAdminAuth());
    await waitFor(() => expect(result.current.estado.fase).toBe("autenticado"));

    const sesionB = crearSesion("admin-b");
    let resolverRpc!: (v: { data: boolean; error: null }) => void;
    supabaseMock.rpc.mockReturnValueOnce(new Promise((r) => (resolverRpc = r)));

    await act(async () => {
      listenerMock.callback?.("SIGNED_IN", sesionB);
    });

    // Usuario distinto: sí corresponde reabrir "verificando_autorizacion"
    // mientras se confirma is_admin() para ESTA sesión nueva.
    expect(result.current.estado.fase).toBe("verificando_autorizacion");

    await act(async () => {
      resolverRpc({ data: true, error: null });
    });
    await waitFor(() => expect(result.current.estado.fase).toBe("autenticado"));
    if (result.current.estado.fase === "autenticado") {
      expect(result.current.estado.session).toBe(sesionB);
    }
  });

  it("si is_admin() falla durante un refresh silencioso, sí desloguea (fail-closed no se pierde por el atajo)", async () => {
    const sesion = crearSesion();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: sesion } });
    supabaseMock.rpc.mockResolvedValueOnce({ data: true, error: null });
    supabaseMock.auth.signOut.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAdminAuth());
    await waitFor(() => expect(result.current.estado.fase).toBe("autenticado"));

    supabaseMock.rpc.mockResolvedValueOnce({ data: false, error: null }); // acceso revocado

    await act(async () => {
      listenerMock.callback?.("TOKEN_REFRESHED", sesion);
    });

    await waitFor(() => expect(result.current.estado.fase).toBe("no_autorizado"));
    expect(supabaseMock.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
