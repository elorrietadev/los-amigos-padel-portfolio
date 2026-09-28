import { useCallback } from "react";
import { obtenerFranjaOperativa } from "./reservations.api";
import { procesarFranjaOperativa } from "./reservations.logic";
import { usePublicResource } from "./usePublicResource";

export function useFranjaOperativa(fecha: string) {
  const cargar = useCallback(async () => {
    const { data, error } = await obtenerFranjaOperativa(fecha);
    const franja = procesarFranjaOperativa(data);
    const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (error || !franja || typeof franja.cerrado !== "boolean" || (!franja.cerrado &&
      (!hora.test(franja.horaApertura ?? "") || !hora.test(franja.horaCierre ?? "")))) throw new Error("franja invalida");
    return franja;
  }, [fecha]);
  const { data: franja, ...estado } = usePublicResource(fecha, cargar);
  return { franja, ...estado };
}
export type UseFranjaOperativa = ReturnType<typeof useFranjaOperativa>;
