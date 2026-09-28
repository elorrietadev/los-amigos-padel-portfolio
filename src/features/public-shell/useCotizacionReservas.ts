import { useCallback } from "react";
import { cotizarReserva } from "../reservations-public/reservations.api";
import { usePublicResource } from "../reservations-public/usePublicResource";

export function useCotizacionReservas(fecha: string, horaInicio: string, horasFin: string[]) {
  const horasFinKey = horasFin.join(",");
  const cargar = useCallback(async () => {
    const precios: Record<string, number> = {};
    if (!horaInicio || !horasFinKey) return precios;
    await Promise.all(horasFinKey.split(",").map(async (horaFin) => {
      const { data, error } = await cotizarReserva(fecha, horaInicio, horaFin);
      if (error || typeof data !== "number" || !Number.isFinite(data) || data < 0) throw new Error("cotizacion invalida");
      precios[horaFin] = data;
    }));
    return precios;
  }, [fecha, horaInicio, horasFinKey]);
  const { data, ...estado } = usePublicResource(`${fecha}/${horaInicio}/${horasFinKey}`, cargar);
  return { precios: data ?? {}, ...estado };
}
export type CotizacionReservas = ReturnType<typeof useCotizacionReservas>;
