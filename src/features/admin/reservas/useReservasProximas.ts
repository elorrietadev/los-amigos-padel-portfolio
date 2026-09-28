import { useCambioEconomico } from "../economiaEvents";
// Port de cargarProximos (admin.html:531-549) — carga inicial + refresco
// silencioso (polling/visibilitychange/Realtime, B5) + guard de secuencia
// (B5: con más de un trigger concurrente tocando esta misma carga, solo debe
// aplicar estado la request iniciada más recientemente). Sin filtros de UI
// (eso es B4: este hook expone "vigentes" tal cual, no la lista ya filtrada/
// ordenada que arma construirListaProximas).

import { useCallback, useEffect, useRef, useState } from "react";
import { hoyISO } from "../../../lib/datetime";
import { obtenerReservasProximas } from "./reservas.api";
import { procesarReservas } from "./reservas.logic";
import type { ReservaProcesada } from "./reservas.types";

export interface CargarOpciones {
  // admin.html:531 (`silencioso`) — no togglea loading ni el estado de error
  // persistente: para refrescos de fondo (polling/visibilitychange/Realtime)
  // que no deben mostrar spinner ni disparar un toast de error.
  silencioso?: boolean;
}

export interface UseReservasProximasResult {
  data: ReservaProcesada[];
  loading: boolean;
  // No es 1:1 con el legacy (que no guarda un estado de error persistente,
  // solo dispara un toast transitorio) — ver reporte de sesión para la
  // justificación de este cambio deliberado.
  error: boolean;
  recargar: (opciones?: CargarOpciones) => Promise<void>;
  // API controlada de patch local (B4.2) — no expone setData crudo. El
  // llamador (ReservasView) decide qué actualizador puro aplicar (ej.
  // marcarConfirmada/quitarPorId) tras confirmar éxito de una mutación remota.
  actualizarLocal: (actualizador: (prev: ReservaProcesada[]) => ReservaProcesada[]) => void;
}

export function useReservasProximas(): UseReservasProximasResult {
  const [data, setData] = useState<ReservaProcesada[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Guard anti-race (B5): token de la request iniciada más recientemente.
  // Cada llamada a `cargar` (mount, polling, visibilitychange, Realtime,
  // recargar manual) puede quedar en vuelo al mismo tiempo que otra —  gana
  // la que arrancó último, sin importar en qué orden resuelvan.
  const secuenciaRef = useRef(0);
  const cargadoRef = useRef(false);

  // admin.html:531-549.
  const cargar = useCallback(async ({ silencioso = false }: CargarOpciones = {}) => {
    const miSecuencia = ++secuenciaRef.current;
    if (!silencioso) {
      setLoading(true);
      setError(false);
    }
    const { data: filas, error: fetchError } = await Promise.resolve(obtenerReservasProximas(hoyISO())).catch((error: unknown) => ({ data: null, error }));
    if (miSecuencia !== secuenciaRef.current) return; // se coló una carga más nueva — se descarta esta respuesta
    if (fetchError) {
      setLoading(false);
      if (!cargadoRef.current) setError(true);
      if (!silencioso) {
        setError(true);
        setLoading(false);
      } else {
        // Silencioso: nada visible (ni toast ni el `error` persistente que
        // dispara el toast en ReservasView) — un fallo de fondo no debe
        // alarmar a nadie. console.warn como único rastro para diagnóstico.
        console.warn("useReservasProximas: refresco silencioso falló", fetchError);
      }
      return;
    }
    // F4 owns purging; expired rows with payments or sales remain visible.
    const { visibles: vigentes } = procesarReservas(filas, Date.now());
    cargadoRef.current = true;
    setError(false);
    setData(vigentes);
    setLoading(false);
  }, []);

  useCambioEconomico(({ reservaId, devolucion }) => { if (reservaId && !devolucion) void cargar({ silencioso: true }); });

  useEffect(() => {
    cargar();
  }, [cargar]);

  const actualizarLocal = useCallback((actualizador: (prev: ReservaProcesada[]) => ReservaProcesada[]) => {
    setData(actualizador);
  }, []);

  return { data, loading, error, recargar: cargar, actualizarLocal };
}
