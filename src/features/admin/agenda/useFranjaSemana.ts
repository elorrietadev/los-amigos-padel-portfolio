// CFG-F2 — rango real de horas de la grilla semanal (reemplaza los
// 08:00/01:00 hardcodeados de configCancha): pide franja_operativa (misma
// RPC que ya usa la disponibilidad pública — respeta horarios_semana Y
// fecha especial) para cada una de las 7 fechas visibles, en paralelo, y
// arma el rango más amplio con calcularRangoGrillaSemana (agenda.logic.ts).
// Mismo criterio mínimo que el resto de estos hooks: se re-consulta entero
// cada vez que cambia la semana visible, sin caché entre semanas.
import { useEffect, useState } from "react";
import { obtenerFranjaOperativa } from "../../reservations-public/reservations.api";
import { procesarFranjaOperativa } from "../../reservations-public/reservations.logic";
import { calcularRangoGrillaSemana, type RangoGrillaSemana } from "./agenda.logic";

export interface UseFranjaSemana {
  rango: RangoGrillaSemana | null;
  // AUDIT-DAY #5 — apertura real de CADA día visible, no la mínima global de
  // `rango` (esa sigue existiendo para el alto de la grilla/filasGrilla, que
  // necesita un único rango compartido). Un día ausente acá (cerrado, o sin
  // franja resuelta) usa el fallback global en el llamador — ver AgendaView.
  porDia: Record<string, number>;
  loading: boolean;
  error: boolean;
}

export function useFranjaSemana(fechas: readonly string[]): UseFranjaSemana {
  const [rango, setRango] = useState<RangoGrillaSemana | null>(null);
  const [porDia, setPorDia] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const clave = fechas.join(",");

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError(false);

    Promise.all(fechas.map((fecha) => obtenerFranjaOperativa(fecha))).then((resultados) => {
      if (!vigente) return;
      if (resultados.some((r) => r.error)) {
        setError(true);
        setLoading(false);
        return;
      }
      const franjasPorFecha = resultados.map((r, i) => ({ fecha: fechas[i]!, franja: procesarFranjaOperativa(r.data) }));
      const franjas = franjasPorFecha
        .map(({ franja }) => franja)
        .filter((f): f is NonNullable<typeof f> => f != null);
      const nuevoPorDia: Record<string, number> = {};
      for (const { fecha, franja } of franjasPorFecha) {
        const propia = franja ? calcularRangoGrillaSemana([franja]) : null;
        if (propia) nuevoPorDia[fecha] = propia.aperturaMin;
      }
      setPorDia(nuevoPorDia);
      setRango(calcularRangoGrillaSemana(franjas));
      setLoading(false);
    });

    return () => {
      vigente = false;
    };
    // `fechas` se resume en `clave` (string estable) — la dependencia real es
    // esa, no el array (una referencia nueva en cada render rompería el
    // criterio de "solo re-consultar cuando cambia la semana").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return { rango, porDia, loading, error };
}
