// FINAL-F5-B — Cloudflare Turnstile (modo administrado, render explícito).
//
// UX: `appearance: "interaction-only"` => el widget es invisible y solo se muestra
// si Cloudflare decide que hace falta un desafío. El token se obtiene apenas se
// monta el contenedor (execution "render"), así que "Confirmar" queda bloqueado
// hasta tener uno válido.
//
// El token es de UN SOLO USO y vence a los 300 s: quien lo consume debe llamar a
// `reiniciar()` después de CADA intento (éxito o error). Con `refresh-expired`
// automático, si vence solo el widget genera otro y `token` vuelve a null hasta
// que llegue.

import { useCallback, useEffect, useRef, useState } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
// Debe coincidir con TURNSTILE_EXPECTED_ACTION de la Pages Function (default "reservar").
export const TURNSTILE_ACTION = "reservar";
export const SCRIPT_TIMEOUT_MS = 15000;
export const WIDGET_TIMEOUT_MS = 60000;

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  appearance: "always" | "execute" | "interaction-only";
  theme: "auto" | "light" | "dark";
  size: "normal" | "flexible" | "compact";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": () => boolean | void;
}

export interface TurnstileApi {
  render: (contenedor: HTMLElement, opciones: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

let cargaScript: Promise<TurnstileApi> | null = null;

const apiGlobal = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

// Carga api.js una sola vez. Si falla (red, bloqueador, CSP), se descarta la promesa
// y el <script> para que un reintento vuelva a intentar de cero.
export function cargarTurnstile(): Promise<TurnstileApi> {
  if (cargaScript) return cargaScript;
  cargaScript = new Promise<TurnstileApi>((resolve, reject) => {
    const yaCargada = apiGlobal();
    if (yaCargada) return resolve(yaCargada);
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    let terminada = false;
    const timer = setTimeout(() => fallar(), SCRIPT_TIMEOUT_MS);
    const fallar = () => {
      if (terminada) return;
      terminada = true;
      clearTimeout(timer);
      script.onload = script.onerror = null;
      script.remove();
      cargaScript = null;
      reject(new Error("turnstile-script"));
    };
    script.onload = () => {
      const api = apiGlobal();
      if (terminada) return;
      if (api) { terminada = true; clearTimeout(timer); resolve(api); }
      else fallar();
    };
    script.onerror = fallar;
    document.head.appendChild(script);
  });
  return cargaScript;
}

export type EstadoTurnstile = "cargando" | "listo" | "error";

export interface UseTurnstile {
  // Ref-callback: asignarlo al <div> donde Cloudflare puede mostrar el desafío.
  // (Callback y no objeto ref, porque el contenedor puede montarse después del hook.)
  contenedorRef: (el: HTMLDivElement | null) => void;
  token: string | null;
  estado: EstadoTurnstile;
  // Descarta el token (ya consumido/vencido) y pide otro. También reintenta la carga
  // del script si había fallado.
  reiniciar: () => void;
}

// `null` = sin site key (bloquea la reserva); sin argumento se lee VITE_TURNSTILE_SITE_KEY.
export function useTurnstile(siteKey: string | null = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? null): UseTurnstile {
  const [contenedor, setContenedor] = useState<HTMLDivElement | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoTurnstile>(siteKey ? "cargando" : "error");
  const [intento, setIntento] = useState(0);
  const esperarRef = useRef<(() => void) | null>(null);
  const widgetRef = useRef<{ api: TurnstileApi; id: string } | null>(null);

  useEffect(() => {
    if (!contenedor) return;
    if (!siteKey) {
      setEstado("error");
      return;
    }
    let cancelado = false;
    let vencido = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const esperar = () => {
      clearTimeout(timer);
      vencido = false;
      timer = setTimeout(() => {
        vencido = true;
        setToken(null);
        setEstado("error");
      }, WIDGET_TIMEOUT_MS);
    };
    esperarRef.current = esperar;
    setToken(null);
    setEstado("cargando");

    cargarTurnstile()
      .then((api) => {
        if (cancelado) return;
        esperar();
        const id = api.render(contenedor, {
          sitekey: siteKey,
          action: TURNSTILE_ACTION,
          appearance: "interaction-only",
          theme: "auto",
          size: "compact",
          callback: (t) => {
            if (cancelado || vencido) return;
            clearTimeout(timer);
            setToken(t);
            setEstado("listo");
          },
          // Vencido o sin respuesta a tiempo: el widget se refresca solo; mientras tanto no hay token.
          "expired-callback": () => {
            if (cancelado) return;
            setToken(null);
            setEstado("cargando");
            esperar();
          },
          "timeout-callback": () => {
            if (cancelado) return;
            setToken(null);
            setEstado("cargando");
            esperar();
          },
          "error-callback": () => {
            if (cancelado) return;
            setToken(null);
            clearTimeout(timer);
            vencido = true;
            setEstado("error");
            return true; // ya lo mostramos nosotros: evita el ruido en consola de Turnstile
          },
        });
        widgetRef.current = { api, id };
      })
      .catch(() => {
        if (!cancelado) setEstado("error");
      });

    return () => {
      cancelado = true;
      clearTimeout(timer);
      esperarRef.current = null;
      const w = widgetRef.current;
      widgetRef.current = null;
      if (w) {
        try {
          w.api.remove(w.id);
        } catch {
          // El widget ya no existe: nada que limpiar.
        }
      }
      setToken(null);
    };
  }, [contenedor, siteKey, intento]);

  const reiniciar = useCallback(() => {
    setToken(null);
    setEstado("cargando");
    const w = widgetRef.current;
    if (w) {
      try {
        esperarRef.current?.();
        w.api.reset(w.id);
        return;
      } catch {
        // Widget inválido: se recrea abajo.
      }
    }
    setIntento((i) => i + 1);
  }, []);

  return { contenedorRef: setContenedor, token, estado, reiniciar };
}
