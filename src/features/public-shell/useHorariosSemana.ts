// PUBLIC-R5 — horario semanal completo para Información. Mismo criterio
// mínimo que useFranjaOperativa (fetch único, sin caché ni refresco
// periódico): a diferencia de la disponibilidad, el horario semanal
// configurado no cambia mientras el usuario mira la pantalla.
import { useEffect, useState } from "react";
import { obtenerHorariosSemana } from "../reservations-public/reservations.api";
import { procesarHorariosSemana } from "../reservations-public/reservations.logic";
import type { HorarioSemanaDia } from "../reservations-public/reservations.types";

export interface UseHorariosSemana {
  dias: HorarioSemanaDia[];
  loading: boolean;
  error: boolean;
}

export function useHorariosSemana(): UseHorariosSemana {
  const [dias, setDias] = useState<HorarioSemanaDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    obtenerHorariosSemana().then(({ data, error: fetchError }) => {
      if (!vigente) return;
      if (fetchError) {
        setError(true);
        setLoading(false);
        return;
      }
      setDias(procesarHorariosSemana(data));
      setLoading(false);
    });
    return () => {
      vigente = false;
    };
  }, []);

  return { dias, loading, error };
}
