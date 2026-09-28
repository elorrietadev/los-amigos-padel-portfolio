// Turnos de las semanas ANTERIORES a la actual, solo para que la campana de
// notificaciones no "olvide" un turno jugado sin cobrar al cambiar de semana.
//
// Misma query que obtenerReservasPorRango, pero paginada hasta el final
// (obtenerReservasPorRangoCompleto): 8 semanas pueden superar las 1000 filas
// de PostgREST. Sin SQL nuevo, con una ventana FINITA
// de SEMANAS_HISTORICO_SIN_PAGO semanas: alcanza para cubrir un cobro
// olvidado durante un par de meses sin traer historial ilimitado. No toca
// useReservasJugadas (que sigue siendo "semana actual + lo que se expanda a
// mano" para las listas de Reservas/Caja): es una instancia aparte, cargada
// una vez por sesión y recargada solo cuando aparecen turnos jugados nuevos
// en el pasado (materialización de turnos fijos). Los pagos se reflejan por
// `actualizarLocal`, que AdminShell encadena a la de jugadas.

import { useCallback, useEffect, useRef, useState } from "react";
import { formatearISO } from "../../../lib/datetime";
import { obtenerReservasPorRangoCompleto } from "./reservas.api";
import { SEMANAS_HISTORICO_SIN_PAGO, obtenerLunes, procesarReservas } from "./reservas.logic";
import type { ReservaProcesada } from "./reservas.types";

export interface UseReservasSinPagoHistoricasResult {
  data: ReservaProcesada[];
  recargar: () => Promise<void>;
  actualizarLocal: (actualizador: (prev: ReservaProcesada[]) => ReservaProcesada[]) => void;
}

export function useReservasSinPagoHistoricas(): UseReservasSinPagoHistoricasResult {
  const [data, setData] = useState<ReservaProcesada[]>([]);
  // Guard anti-race, mismo criterio que el resto de los loaders.
  const secuenciaRef = useRef(0);

  const recargar = useCallback(async () => {
    const miSecuencia = ++secuenciaRef.current;
    const ahora = Date.now();
    const inicio = formatearISO(obtenerLunes(ahora, -SEMANAS_HISTORICO_SIN_PAGO));
    const finDate = obtenerLunes(ahora);
    finDate.setDate(finDate.getDate() - 1); // domingo anterior: la semana actual la carga useReservasJugadas
    const fin = formatearISO(finDate);
    const { data: filas, error } = await Promise.resolve(obtenerReservasPorRangoCompleto(inicio, fin)).catch((e: unknown) => ({
      data: null,
      error: e,
    }));
    if (miSecuencia !== secuenciaRef.current) return;
    if (error) {
      // Refresco de fondo: sin toast ni estado de error (no bloquea nada).
      console.warn("useReservasSinPagoHistoricas: carga falló", error);
      return;
    }
    setData(procesarReservas(filas, Date.now()).visibles);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const actualizarLocal = useCallback((actualizador: (prev: ReservaProcesada[]) => ReservaProcesada[]) => {
    setData(actualizador);
  }, []);

  return { data, recargar, actualizarLocal };
}
