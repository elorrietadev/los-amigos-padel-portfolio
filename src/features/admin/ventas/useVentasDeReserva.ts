// P3 — carga on-demand de las ventas/productos asociados a UNA reserva
// puntual, compartida entre AgendaDetalleSheet.tsx y ReservasView.tsx
// (DetalleReservaContenido): mismo dato, mismo cálculo, un solo hook. Se
// dispara solo, al montar y cada vez que cambia `reservaId` (a diferencia de
// useReservasParaVenta, que expone `cargar()` para que el llamador decida
// cuándo) — acá no hay "modo" que active/desactive la carga: el panel de
// detalle SIEMPRE quiere ver los productos de la reserva que tiene abierta.
//
// `reservaId: null` (nada seleccionado, o la celda es un bloqueo/turno fijo
// virtual, ninguno de los dos puede tener ventas asociadas) limpia el estado
// sin pegarle a la red.
//
// Guard anti-carrera: mismo patrón `secuenciaRef` que useReservasParaVenta/
// useReservasJugadas — necesario acá en particular porque el usuario puede
// cambiar de reserva seleccionada más rápido de lo que tarda en resolver el
// fetch anterior (clickear una fila, después otra, antes de que la primera
// responda); solo la respuesta de la carga más reciente puede pisar el estado.

import { useCambioEconomico } from "../economiaEvents";
import { useCallback, useEffect, useRef, useState } from "react";
import { patchearDevolucionEnVenta, procesarVenta } from "../historial/historial.logic";
import type { DevolucionResumen, VentaConDetalle } from "../historial/historial.types";
import { obtenerVentasPorReserva } from "./ventas.api";

export interface UseVentasDeReservaResult {
  ventas: VentaConDetalle[];
  loading: boolean;
  error: boolean;
  reintentar: () => void;
  // P4 — patch local tras un registrar_devolucion exitoso, sin refetch: mismo
  // criterio y misma función pura (patchearDevolucionEnVenta) que ya usa
  // useHistorialVentas.patchearDevolucion — no se duplica la fórmula acá.
  patchearDevolucion: (ventaId: string, itemId: string, devolucion: DevolucionResumen) => void;
}

export function useVentasDeReserva(reservaId: string | null): UseVentasDeReservaResult {
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [ventas, setVentas] = useState<VentaConDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const secuenciaRef = useRef(0);

  const cargar = useCallback((id: string) => {
    const miSecuencia = ++secuenciaRef.current;
    setLoading(true);
    setVentas([]);
    setLoadedId(id);
    setError(false);
    Promise.resolve(obtenerVentasPorReserva(id)).then(({ data, error: fetchError }) => {
      if (miSecuencia !== secuenciaRef.current) return; // se coló una carga más nueva (otra reserva, u otro reintento) — se descarta esta respuesta
      if (fetchError) {
        setError(true);
        setLoading(false);
        return;
      }
      setVentas((data ?? []).map(procesarVenta));
      setError(false);
      setLoading(false);
    }).catch(() => {
      if (miSecuencia !== secuenciaRef.current) return;
      setError(true); setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (reservaId == null) {
      secuenciaRef.current++; // invalida cualquier fetch en vuelo de la reserva anterior
      setVentas([]);
      setLoading(false);
      setError(false);
      return;
    }
    cargar(reservaId);
    return () => { secuenciaRef.current++; };
  }, [reservaId, cargar]);

  const reintentar = useCallback(() => {
    if (reservaId != null) cargar(reservaId);
  }, [reservaId, cargar]);

  const patchearDevolucion = useCallback((ventaId: string, itemId: string, devolucion: DevolucionResumen) => {
    setVentas((prev) => patchearDevolucionEnVenta(prev, ventaId, itemId, devolucion));
  }, []);

  useCambioEconomico(({ reservaId: changed, devolucion }) => {
    if (!reservaId || (changed !== undefined && changed !== reservaId)) return;
    if (devolucion && !loading && loadedId === reservaId && !error) {
      secuenciaRef.current++;
      patchearDevolucion(devolucion.ventaId, devolucion.itemId, devolucion);
    } else cargar(reservaId);
  });
  const current = loadedId === reservaId;
  return { ventas: current && !error ? ventas : [], loading: reservaId !== null && (!current || loading), error: current && error, reintentar, patchearDevolucion };
}
