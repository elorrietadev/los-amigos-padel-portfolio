// D4 — carga puntual de reservas de los últimos 7 días para el picker de
// "venta atada a reserva" de VenderView. No reusa ningún hook de reservas/:
// useReservasProximas/useReservasJugadas están atados a la semana calendario
// y al estado propio de ReservasView (cargarAnterior, guards de secuencia
// pensados para esa vista); useReservasBusqueda busca por nombre + UNA fecha
// exacta, no por rango. Lo que SÍ se reusa tal cual de reservas/ es el
// transporte (`obtenerReservasPorRango`) y la vigencia (`procesarReservas`,
// que filtra pendientes abandonadas — no reservas históricas, ver reporte de
// sesión D4) — nada de eso se reimplementa acá.
//
// Sin polling, sin Realtime, sin carga automática: VenderView decide CUÁNDO
// llamar a `cargar` (una sola vez al entrar a modo "atada" + reintentos
// manuales) — este hook solo encapsula transporte + estado + guard anti-carrera.

import { useCallback, useRef, useState } from "react";
import { obtenerReservasPorRango } from "../reservas/reservas.api";
import { obtenerRangoUltimosDias, procesarReservas } from "../reservas/reservas.logic";
import type { ReservaProcesada } from "../reservas/reservas.types";

const DIAS_RANGO = 7;

export interface UseReservasParaVentaResult {
  data: ReservaProcesada[];
  loading: boolean;
  // Mismo criterio que el resto de los loaders de reservas/: sin estado de
  // error persistente más allá de este booleano — VenderView lo usa para
  // bloquear la selección y ofrecer "Reintentar", no para un toast transitorio.
  error: boolean;
  cargar: () => Promise<void>;
}

export function useReservasParaVenta(): UseReservasParaVentaResult {
  const [data, setData] = useState<ReservaProcesada[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Guard anti-carrera: la carga inicial y un "Reintentar" manual pueden
  // superponerse (ej. reintentar dos veces rápido) — gana la respuesta de la
  // request iniciada más recientemente, mismo mecanismo que secuenciaRef en
  // useReservasJugadas.ts.
  const secuenciaRef = useRef(0);

  const cargar = useCallback(async () => {
    const miSecuencia = ++secuenciaRef.current;
    setLoading(true);
    setError(false);
    const { inicio, fin } = obtenerRangoUltimosDias(Date.now(), DIAS_RANGO);
    const { data: filas, error: fetchError } = await obtenerReservasPorRango(inicio, fin);
    if (miSecuencia !== secuenciaRef.current) return; // se coló una carga más nueva — se descarta esta respuesta
    if (fetchError) {
      setError(true);
      setLoading(false);
      return;
    }
    const { vigentes } = procesarReservas(filas, Date.now());
    setData(vigentes);
    setError(false);
    setLoading(false);
  }, []);

  return { data, loading, error, cargar };
}
