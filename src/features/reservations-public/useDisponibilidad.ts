import { useCallback, useEffect } from "react";
import { obtenerExcepcionesTurnoFijo, obtenerReservasPublicasPorFecha, obtenerTurnosFijosPublicos } from "./reservations.api";
import { procesarReservasPublicas, procesarTurnosFijos, reservasDelDia } from "./reservations.logic";
import type { OcupacionDelDia } from "./reservations.types";
import { usePublicResource } from "./usePublicResource";

export interface OpcionesRefresco { forzar?: boolean; silencioso?: boolean }
export interface UseDisponibilidad {
  reservasDelDia: OcupacionDelDia[];
  loading: boolean;
  error: boolean;
  refrescar: (opts?: OpcionesRefresco) => Promise<void>;
}
const horaValida = (h: unknown) => typeof h === "string" && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(h);

export function useDisponibilidad(fecha: string): UseDisponibilidad {
  const cargar = useCallback(async () => {
    const [reservas, fijos, excepciones] = await Promise.all([
      obtenerReservasPublicasPorFecha(fecha), obtenerTurnosFijosPublicos(), obtenerExcepcionesTurnoFijo(),
    ]);
    if (reservas.error || fijos.error || excepciones.error ||
      !Array.isArray(reservas.data) || !Array.isArray(fijos.data) || !Array.isArray(excepciones.data)) throw new Error("disponibilidad incompleta");
    if (reservas.data.some((r) => !r.id || r.fecha !== fecha || !horaValida(r.hora_inicio) || !horaValida(r.hora_fin) ||
      typeof r.confirmada !== "boolean" || !r.creado || !Number.isFinite(Date.parse(r.creado))) ||
      fijos.data.some((t) => !t.id || t.dia_semana == null || !Number.isInteger(t.dia_semana) || t.dia_semana < 0 || t.dia_semana > 6 || !horaValida(t.hora_inicio) || !horaValida(t.hora_fin)) ||
      excepciones.data.some((e) => !e.turno_fijo_id || !e.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(e.fecha))) throw new Error("disponibilidad invalida");
    return reservasDelDia(fecha, procesarReservasPublicas(reservas.data, Date.now()), procesarTurnosFijos(fijos.data), excepciones.data);
  }, [fecha]);
  const recurso = usePublicResource(fecha, cargar);
  const refrescar = useCallback(async (_opts?: OpcionesRefresco) => { recurso.refrescar(); }, [recurso.refrescar]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") void refrescar(); };
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(() => void refrescar(), 5 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", visible); clearInterval(timer); };
  }, [refrescar]);
  // Background failures also block selection: unknown does not mean free.
  return { reservasDelDia: recurso.data ?? [], loading: recurso.loading, error: recurso.error, refrescar };
}
