import { useCambioEconomico } from "../economiaEvents";
// D5 — hook de Historial: carga inicial + "cargar más antiguas" (offset
// creciente, orden determinista de 3 columnas — ver historial.api.ts) +
// reintentar, con guard de secuencia anti-carrera (mismo mecanismo que
// useReservasParaVenta/useReservasJugadas). Sin polling, sin Realtime:
// Historial es un registro, no algo que cambie en vivo mientras se lo mira.
//
// `desde`/`hasta` son props del llamador (HistorialView), no estado interno:
// cambiar el rango dispara una recarga completa desde offset 0 (mismo efecto
// que `reintentar`, vía el cambio de identidad de `cargar`).

import { useCallback, useEffect, useRef, useState } from "react";
import { obtenerVentasConDetalle } from "./historial.api";
import { agregarVentasSinDuplicar, patchearDevolucionEnVenta, procesarVenta } from "./historial.logic";
import type { DevolucionResumen, VentaConDetalle } from "./historial.types";

const TAMANO_PAGINA = 20;

export interface UseHistorialVentasResult {
  data: VentaConDetalle[];
  loading: boolean;
  error: boolean;
  hayMas: boolean;
  cargandoMasAntiguas: boolean;
  errorMasAntiguas: boolean;
  cargarMasAntiguas: () => Promise<void>;
  reintentar: () => Promise<void>;
  // D6 — patch local tras un registrar_devolucion exitoso, sin refetch (ver
  // patchearDevolucionEnVenta en historial.logic.ts).
  patchearDevolucion: (ventaId: string, itemId: string, devolucion: DevolucionResumen) => void;
}

export function useHistorialVentas(desde: string, hasta: string): UseHistorialVentasResult {
  const [data, setData] = useState<VentaConDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hayMas, setHayMas] = useState(true);
  const [cargandoMasAntiguas, setCargandoMasAntiguas] = useState(false);
  const [errorMasAntiguas, setErrorMasAntiguas] = useState(false);
  // Guard anti-carrera compartido por carga inicial/reintentar/cargar-más —
  // gana la request iniciada más recientemente, sin importar el orden de
  // resolución (mismo mecanismo que useReservasJugadas.ts/useReservasParaVenta.ts).
  const secuenciaRef = useRef(0);
  // Offset del próximo "cargar más" — ref, no state: no necesita re-render
  // por sí solo, solo lo consume cargarMasAntiguas.
  const offsetRef = useRef(0);

  const cargar = useCallback(async () => {
    const miSecuencia = ++secuenciaRef.current;
    setLoading(true);
    setCargandoMasAntiguas(false);
    setHayMas(false);
    offsetRef.current = 0;
    setData([]);
    setError(false);
    setErrorMasAntiguas(false);
    const { data: filas, error: fetchError } = await Promise.resolve(obtenerVentasConDetalle({ desde, hasta, offset: 0, limite: TAMANO_PAGINA })).catch((error: unknown) => ({ data: [], error }));
    if (miSecuencia !== secuenciaRef.current) return; // se coló una carga más nueva — se descarta esta respuesta
    if (fetchError) {
      setError(true);
      setLoading(false);
      return;
    }
    const procesadas = (filas ?? []).map(procesarVenta);
    setData(procesadas);
    setHayMas(procesadas.length === TAMANO_PAGINA);
    offsetRef.current = procesadas.length;
    setLoading(false);
  }, [desde, hasta]);

  useCambioEconomico(({ devolucion }) => {
    if (devolucion && !loading && !cargandoMasAntiguas && !error) {
      secuenciaRef.current++;
      setData((prev) => patchearDevolucionEnVenta(prev, devolucion.ventaId, devolucion.itemId, devolucion));
    } else void cargar();
  });

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarMasAntiguas = useCallback(async () => {
    if (loading || cargandoMasAntiguas || !hayMas) return;
    const miSecuencia = ++secuenciaRef.current;
    setCargandoMasAntiguas(true);
    setErrorMasAntiguas(false);
    const offsetActual = offsetRef.current;
    const { data: filas, error: fetchError } = await Promise.resolve(obtenerVentasConDetalle({
      desde,
      hasta,
      offset: offsetActual,
      limite: TAMANO_PAGINA,
    })).catch((error: unknown) => ({ data: [], error }));
    if (miSecuencia !== secuenciaRef.current) return;
    if (fetchError) {
      setErrorMasAntiguas(true);
      setCargandoMasAntiguas(false);
      return;
    }
    const procesadas = (filas ?? []).map(procesarVenta);
    // admin.html no tiene equivalente — offsetRef solo avanza tras éxito: si
    // falla, "Reintentar" (mismo botón) repite el mismo offset en vez de
    // perder terreno o saltear una página.
    offsetRef.current = offsetActual + procesadas.length;
    setData((prev) => agregarVentasSinDuplicar(prev, procesadas));
    setHayMas(procesadas.length === TAMANO_PAGINA);
    setCargandoMasAntiguas(false);
  }, [desde, hasta, loading, cargandoMasAntiguas, hayMas]);

  const patchearDevolucion = useCallback((ventaId: string, itemId: string, devolucion: DevolucionResumen) => {
    setData((prev) => patchearDevolucionEnVenta(prev, ventaId, itemId, devolucion));
  }, []);

  return {
    data,
    loading,
    error,
    hayMas,
    cargandoMasAntiguas,
    errorMasAntiguas,
    cargarMasAntiguas,
    reintentar: cargar,
    patchearDevolucion,
  };
}
