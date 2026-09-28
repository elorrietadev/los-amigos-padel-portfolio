// Port de la búsqueda server-side debounded de admin.html:734-763 —
// nombre (ilike, 3+ caracteres) y/o una fecha pasada que no esté ya cargada en
// memoria (esa decisión, `fechaFueraDeRangoCargado`, vive en reservas.logic.ts
// y la resuelve el llamador: acá solo importa el booleano `activa`). Sin
// polling/Realtime — cada cambio de nombre/fecha reprograma su propio
// debounce a través de las deps del efecto.

import { useCallback, useEffect, useRef, useState } from "react";
import { buscarReservas } from "./reservas.api";
import { procesarReservas } from "./reservas.logic";
import type { ReservaProcesada } from "./reservas.types";

const DEBOUNCE_MS = 400;

export interface UseReservasBusquedaResult {
  // `null` = sin búsqueda activa (nunca corrió, o se desactivó). Distinto de
  // `[]` (corrió y no encontró nada) — no confundir uno con el otro.
  data: ReservaProcesada[] | null;
  buscando: boolean;
  // Mismo comentario que los otros hooks: el legacy no persiste un estado de
  // error, solo dispara un toast transitorio (acá lo exponemos para que
  // ReservasView dispare ese toast vía el mismo patrón ya usado).
  error: boolean;
  // No-op limpio si no hay búsqueda activa (data === null) — no se le aplica
  // el actualizador a null ni se lo convierte en [] por accidente.
  actualizarLocal: (actualizador: (prev: ReservaProcesada[]) => ReservaProcesada[]) => void;
}

export function useReservasBusqueda(filtroNombre: string, filtroFecha: string, activa: boolean): UseReservasBusquedaResult {
  const [data, setData] = useState<ReservaProcesada[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(false);
  // admin.html:401 (busquedaVigenteRef) — guard anti-race: solo la respuesta
  // de la búsqueda todavía vigente puede tocar el estado.
  const busquedaVigenteRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activa) {
      setData(null);
      setBuscando(false);
      setError(false);
      busquedaVigenteRef.current = null;
      return;
    }
    setBuscando(true);
    setError(false);
    const clave = `${filtroNombre}|${filtroFecha}`;
    busquedaVigenteRef.current = clave;
    const timer = setTimeout(async () => {
      setBuscando(true);
      const { data: filas, error: fetchError } = await buscarReservas({ nombre: filtroNombre, fecha: filtroFecha });
      // El usuario ya cambió la búsqueda (o la limpió) mientras esta request
      // estaba en vuelo — descartar la respuesta vieja sin tocar el estado.
      if (busquedaVigenteRef.current !== clave) return;
      if (fetchError) {
        setError(true);
        setBuscando(false);
        return;
      }
      setError(false);
      const { visibles: vigentes } = procesarReservas(filas, Date.now());
      setData(vigentes);
      setBuscando(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [activa, filtroNombre, filtroFecha]);

  const actualizarLocal = useCallback((actualizador: (prev: ReservaProcesada[]) => ReservaProcesada[]) => {
    setData((prev) => (prev === null ? prev : actualizador(prev)));
  }, []);

  return { data, buscando, error, actualizarLocal };
}
