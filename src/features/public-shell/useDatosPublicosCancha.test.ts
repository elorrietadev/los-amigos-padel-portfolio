/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDatosPublicosCancha } from "./useDatosPublicosCancha";

const obtenerDatosPublicosCanchaMock = vi.hoisted(() => vi.fn());
vi.mock("../reservations-public/reservations.api", () => ({
  obtenerDatosPublicosCancha: obtenerDatosPublicosCanchaMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDatosPublicosCancha", () => {
  it("arranca en loading y mapea la fila real a camelCase", async () => {
    obtenerDatosPublicosCanchaMock.mockResolvedValue({
      data: {
        nombre_cancha: "Los amigos padel",
        whatsapp_numero: "5493775550100",
        instagram_url: "https://www.instagram.com/losamigos_padel",
        direccion: "Monte Caseros, Corrientes",
        mapa_lat: -30.242812,
        mapa_lng: -57.655903,
      },
      error: null,
    });
    const { result } = renderHook(() => useDatosPublicosCancha());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.datos).toEqual({
      nombreCancha: "Los amigos padel",
      whatsappNumero: "5493775550100",
      instagramUrl: "https://www.instagram.com/losamigos_padel",
      direccion: "Monte Caseros, Corrientes",
      mapaLat: -30.242812,
      mapaLng: -57.655903,
    });
  });

  it("instagram_url null llega como null, no como string inventado", async () => {
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
    const { result } = renderHook(() => useDatosPublicosCancha());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.datos?.instagramUrl).toBeNull();
  });

  it("error de red: error=true, sin inventar datos", async () => {
    obtenerDatosPublicosCanchaMock.mockResolvedValue({ data: null, error: { message: "network" } });
    const { result } = renderHook(() => useDatosPublicosCancha());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.datos).toBeNull();
  });

  it("mapa_lat/mapa_lng null se trata como error, nunca como 0,0", async () => {
    obtenerDatosPublicosCanchaMock.mockResolvedValue({
      data: {
        nombre_cancha: "Los amigos padel",
        whatsapp_numero: "5493775550100",
        instagram_url: null,
        direccion: "Monte Caseros, Corrientes",
        mapa_lat: null,
        mapa_lng: null,
      },
      error: null,
    });
    const { result } = renderHook(() => useDatosPublicosCancha());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.datos).toBeNull();
  });
});
