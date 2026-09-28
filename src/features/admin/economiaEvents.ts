import type { DevolucionResumen } from "./historial/historial.types";
import { useEffect, useRef } from "react";

// Only economic consumers subscribe. An unknown reservation (a return from
// history) invalidates open reservation details; a sale targets its own ID.
export interface CambioEconomico {
  reservaId?: string | null;
  devolucion?: DevolucionResumen & { ventaId: string; itemId: string; productoId: string };
  stockActualizado?: boolean;
}
const listeners = new Set<(cambio: CambioEconomico) => void>();
export function invalidarEconomia(cambio: CambioEconomico = {}) {
  listeners.forEach((listener) => listener(cambio));
}
export function useCambioEconomico(callback: (cambio: CambioEconomico) => void) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const listener = (cambio: CambioEconomico) => latest.current(cambio);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
}
