// useTelefonosBloqueados (C5) — carga de la lista negra de teléfonos +
// patch local tras bloquear/desbloquear. Instancia propia de BloqueosView,
// sin compartir con otras vistas (nadie más la necesita) — a diferencia de
// turnosFijos (C3), no hace falta levantarla a AdminShell.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Tables } from "../../../types/database.types";
import { obtenerTelefonosBloqueados } from "./telefonosBloqueados.api";

export type TelefonoBloqueado = Tables<"telefonos_bloqueados">;

export interface CargarTelefonosBloqueadosOpciones {
  silencioso?: boolean;
}

export interface UseTelefonosBloqueadosResult {
  data: TelefonoBloqueado[];
  loading: boolean;
  error: boolean;
  recargar: (opciones?: CargarTelefonosBloqueadosOpciones) => Promise<void>;
  // Patch local tras bloquearTelefono (éxito) — evita un refetch completo por
  // una sola fila ya conocida, mismo criterio que el resto de los patches
  // locales del proyecto (agregarTurnoFijoLocal, etc.).
  agregarLocal: (tb: TelefonoBloqueado) => void;
  // Patch local tras desbloquearTelefono (éxito). Por `telefono` (la PK real
  // de esta tabla), no por un `id` que no existe acá.
  quitarLocal: (telefono: string) => void;
}

export function useTelefonosBloqueados(): UseTelefonosBloqueadosResult {
  const [data, setData] = useState<TelefonoBloqueado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Guard anti-race, mismo patrón que useTurnosFijos/useReservasProximas.
  const secuenciaRef = useRef(0);
  const cargadoRef = useRef(false);

  const cargar = useCallback(async ({ silencioso = false }: CargarTelefonosBloqueadosOpciones = {}) => {
    const miSecuencia = ++secuenciaRef.current;
    if (!silencioso) {
      setLoading(true);
      setError(false);
    }
    const { data: filas, error: fetchError } = await Promise.resolve(obtenerTelefonosBloqueados()).catch((error: unknown) => ({ data: null, error }));
    if (miSecuencia !== secuenciaRef.current) return; // se coló una carga más nueva — se descarta esta respuesta

    if (fetchError) {
      setLoading(false);
      if (!cargadoRef.current) setError(true);
      if (!silencioso) {
        setError(true);
        setLoading(false);
      } else {
        console.warn("useTelefonosBloqueados: refresco silencioso falló", fetchError);
      }
      return;
    }

    setData(filas ?? []);
    cargadoRef.current = true;
    setError(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const agregarLocal = useCallback((tb: TelefonoBloqueado) => {
    setData((prev) => [tb, ...prev]);
  }, []);

  const quitarLocal = useCallback((telefono: string) => {
    setData((prev) => prev.filter((tb) => tb.telefono !== telefono));
  }, []);

  return { data, loading, error, recargar: cargar, agregarLocal, quitarLocal };
}
