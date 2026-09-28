import { useCambioEconomico } from "../economiaEvents";
// Port de cargarJugadosSemanaActual (admin.html:554-570) + cargarSemanaAnteriorJugados
// (admin.html:573-591) — semana actual + acumulación manual de semanas
// anteriores (B4.3) + refresco silencioso y guard de secuencia en la carga de
// la semana actual (B5; `cargarAnterior` no lo necesita, ya está serializada
// por `cargandoAnteriorRef`, es una acción manual sin trigger concurrente).

import { useCallback, useEffect, useRef, useState } from "react";
import { formatearISO } from "../../../lib/datetime";
import { obtenerReservasPorRango } from "./reservas.api";
import { obtenerRangoSemana, procesarReservas } from "./reservas.logic";
import type { CargarOpciones } from "./useReservasProximas";
import type { ReservaProcesada } from "./reservas.types";

export interface UseReservasJugadasResult {
  data: ReservaProcesada[];
  loading: boolean;
  // Mismo comentario que useReservasProximas: el legacy no persiste un estado
  // de error, solo dispara un toast transitorio. Ver reporte de sesión.
  error: boolean;
  recargar: (opciones?: CargarOpciones) => Promise<void>;
  // Mismo comentario que useReservasProximas: API controlada de patch local,
  // sin exponer setData crudo.
  actualizarLocal: (actualizador: (prev: ReservaProcesada[]) => ReservaProcesada[]) => void;
  // admin.html:390/573-591 — "cargar semana anterior" es una acción manual y
  // separada de la carga inicial, con su propio loading/error.
  cargandoAnterior: boolean;
  errorAnterior: boolean;
  cargarAnterior: () => Promise<void>;
  // admin.html:391/726-729 (fechaFueraDeRangoCargado) — valor de solo lectura
  // del ref interno, no el ref en sí (no se puede setear desde afuera). B4.5.2
  // lo necesita para decidir si una fecha pasada ya está cubierta en memoria o
  // hace falta ir a buscarla al servidor.
  semanaMasAntiguaJugados: string | null;
}

export function useReservasJugadas(): UseReservasJugadasResult {
  const [data, setData] = useState<ReservaProcesada[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [cargandoAnterior, setCargandoAnterior] = useState(false);
  const [errorAnterior, setErrorAnterior] = useState(false);

  // admin.html:391 — ref, no state: la semana más antigua ya cargada no
  // necesita re-render por sí sola, solo determina el rango del próximo
  // "cargar anterior". `cargandoAnteriorRef` evita doble click sin depender
  // de una closure stale sobre el state (cargarAnterior queda con deps []).
  const semanaMasAntiguaRef = useRef<string | null>(null);
  const cargandoAnteriorRef = useRef(false);
  // Guard anti-race (B5) — mismo mecanismo que useReservasProximas: gana la
  // request iniciada más recientemente, sin importar el orden de resolución.
  const secuenciaRef = useRef(0);
  const cargadoRef = useRef(false);

  // admin.html:554-570, sin "recordar la semana más antigua" (eso vive en
  // semanaMasAntiguaRef, seteado más abajo).
  const cargar = useCallback(async ({ silencioso = false }: CargarOpciones = {}) => {
    const miSecuencia = ++secuenciaRef.current;
    if (!silencioso) {
      setLoading(true);
      setError(false);
    }
    const { inicio, fin } = obtenerRangoSemana(Date.now());
    const { data: filas, error: fetchError } = await Promise.resolve(obtenerReservasPorRango(inicio, fin)).catch((error: unknown) => ({ data: null, error }));
    if (miSecuencia !== secuenciaRef.current) return; // se coló una carga más nueva — se descarta esta respuesta
    if (fetchError) {
      setLoading(false);
      if (!cargadoRef.current) setError(true);
      if (!silencioso) {
        setError(true);
        setLoading(false);
      } else {
        // Mismo criterio que useReservasProximas: un refresco de fondo
        // fallido no toca data/error/loading visibles, solo deja rastro acá.
        console.warn("useReservasJugadas: refresco silencioso falló", fetchError);
      }
      return;
    }
    const { visibles: vigentes } = procesarReservas(filas, Date.now());
    // admin.html:567 — reemplaza solo la porción de la semana actual dentro de
    // lo ya cargado: las semanas anteriores ya traídas por cargarAnterior
    // quedan intactas ante un recargar().
    setData((prev) => [...prev.filter((r) => r.fecha < inicio), ...vigentes]);
    // admin.html:568 — se fija solo la primera vez: recargar la semana actual
    // no debe pisar el límite ya extendido hacia atrás por cargarAnterior.
    if (semanaMasAntiguaRef.current === null) semanaMasAntiguaRef.current = inicio;
    cargadoRef.current = true;
    setError(false);
    setLoading(false);
  }, []);

  useCambioEconomico(({ reservaId, devolucion }) => { if (reservaId && !devolucion) void cargar({ silencioso: true }); });

  useEffect(() => {
    cargar();
  }, [cargar]);

  const actualizarLocal = useCallback((actualizador: (prev: ReservaProcesada[]) => ReservaProcesada[]) => {
    setData(actualizador);
  }, []);

  // admin.html:573-591 — extiende una semana hacia atrás de lo ya cargado, sin
  // reemplazar nada. El rango siempre es estrictamente anterior a
  // semanaMasAntiguaRef, así que no hay riesgo real de duplicados por id.
  const cargarAnterior = useCallback(async () => {
    if (cargandoAnteriorRef.current || !semanaMasAntiguaRef.current) return;
    const nuevoLunes = new Date(`${semanaMasAntiguaRef.current}T00:00:00`);
    nuevoLunes.setDate(nuevoLunes.getDate() - 7);
    const nuevoDomingo = new Date(nuevoLunes);
    nuevoDomingo.setDate(nuevoLunes.getDate() + 6);
    const nuevoLunesISO = formatearISO(nuevoLunes);
    const nuevoDomingoISO = formatearISO(nuevoDomingo);

    cargandoAnteriorRef.current = true;
    setCargandoAnterior(true);
    setErrorAnterior(false);
    const { data: filas, error: fetchError } = await Promise.resolve(obtenerReservasPorRango(nuevoLunesISO, nuevoDomingoISO)).catch((error: unknown) => ({ data: null, error }));
    if (fetchError) {
      setLoading(false);
      if (!cargadoRef.current) setError(true);
      cargandoAnteriorRef.current = false;
      setErrorAnterior(true);
      setCargandoAnterior(false);
      return;
    }
    const { visibles: vigentes } = procesarReservas(filas, Date.now());
    // admin.html:589 — se actualiza solo tras éxito: si falla, se puede
    // reintentar el mismo rango sin perder terreno ni datos ya cargados.
    semanaMasAntiguaRef.current = nuevoLunesISO;
    setData((prev) => [...vigentes, ...prev]);
    cargandoAnteriorRef.current = false;
    setCargandoAnterior(false);
  }, []);

  return {
    data,
    loading,
    error,
    recargar: cargar,
    actualizarLocal,
    cargandoAnterior,
    errorAnterior,
    cargarAnterior,
    semanaMasAntiguaJugados: semanaMasAntiguaRef.current,
  };
}
