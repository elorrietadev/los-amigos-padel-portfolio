// CFG-F2 — horario semanal base real (horarios_semana), para formularios
// admin que trabajan por día de semana en vez de por fecha puntual (Turnos
// Fijos: un turno fijo se repite todas las semanas en un `dia_semana`, sin
// fecha propia, así que una fecha especial no le aplica — horarios_semana es
// la fuente correcta, no franja_operativa). Reusa el mismo tipo/parser que ya
// usa Información pública (procesarHorariosSemana en reservations-public):
// misma forma de fila (dia_semana/abierto/hora_apertura/hora_cierre), sea que
// venga de la tabla base (admin, NOT NULL) o de la vista pública (nullable) —
// estructuralmente compatible. Mismo criterio mínimo que el resto de estos
// hooks: un solo fetch, sin caché ni refresco periódico.
import { useEffect, useState } from "react";
import { procesarHorariosSemana } from "../../reservations-public/reservations.logic";
import type { HorarioSemanaDia } from "../../reservations-public/reservations.types";
import { obtenerHorariosSemana } from "./configuracion.api";

export interface UseHorariosSemanaAdmin {
  dias: HorarioSemanaDia[];
  loading: boolean;
  error: boolean;
}

export function useHorariosSemana(): UseHorariosSemanaAdmin {
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
