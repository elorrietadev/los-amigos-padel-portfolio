import { obtenerConfiguracionReservas } from "./reservations.api";
import { procesarConfiguracionReservas } from "./reservations.logic";
import { usePublicResource } from "./usePublicResource";

async function cargar() {
  const { data, error } = await obtenerConfiguracionReservas();
  const config = procesarConfiguracionReservas(data);
  if (error || !config || Object.values(config).some((n) => !Number.isFinite(n) || n < 0) ||
    config.duracionMinima <= 0 || config.duracionMaxima < config.duracionMinima || config.limiteReservasActivasTelefono < 1) throw new Error("configuracion invalida");
  return config;
}
export function useConfiguracionReservas() {
  const { data: configuracion, ...estado } = usePublicResource("configuracion", cargar);
  return { configuracion, ...estado };
}
export type UseConfiguracionReservas = ReturnType<typeof useConfiguracionReservas>;
