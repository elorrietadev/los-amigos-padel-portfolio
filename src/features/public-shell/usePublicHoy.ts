// Home pública (PUBLIC-R2) — "abierto ahora" y "próximos horarios de hoy"
// reusando EXACTAMENTE la misma lógica/hooks que ya usa PublicBookingPage
// (useDisponibilidad/useFranjaOperativa/useConfiguracionReservas +
// estaAbierta/horasInicioDisponibles de reservations.logic.ts): ningún
// cálculo nuevo, ningún hardcode de horario/duración. Si algo de esto no
// resolvió (loading/error/día cerrado), quien consuma este hook decide cómo
// degradar — acá solo se exponen los datos ya reales o vacíos, nunca un
// valor inventado.
import { calcularCierreExtendido, hoyISO, horaToMinutos } from "../../lib/datetime";
import { estaAbierta, horasInicioDisponibles } from "../reservations-public/reservations.logic";
import type { ConfiguracionReservas, FranjaOperativa } from "../reservations-public/reservations.types";
import { useConfiguracionReservas } from "../reservations-public/useConfiguracionReservas";
import { useDisponibilidad } from "../reservations-public/useDisponibilidad";
import { useFranjaOperativa } from "../reservations-public/useFranjaOperativa";

const MAX_HORARIOS_HOY = 3;

export interface PublicHoy {
  loading: boolean;
  error: boolean;
  cerrado: boolean;
  abierta: boolean;
  horarios: string[];
  franja: FranjaOperativa | null;
  configuracion: ConfiguracionReservas | null;
}

export function usePublicHoy(): PublicHoy {
  const fecha = hoyISO();
  const disponibilidad = useDisponibilidad(fecha);
  const { franja, loading: franjaLoading, error: franjaError } = useFranjaOperativa(fecha);
  const { configuracion, loading: configLoading, error: configError } = useConfiguracionReservas();

  const cerrado = franja?.cerrado ?? false;
  const aperturaMin = franja && !cerrado ? horaToMinutos(franja.horaApertura!) : 0;
  const cierreExt = franja && !cerrado ? calcularCierreExtendido(aperturaMin, horaToMinutos(franja.horaCierre!)) : 0;

  const horarios =
    !disponibilidad.loading && !disponibilidad.error && configuracion && franja && !cerrado
      ? horasInicioDisponibles(
          fecha,
          disponibilidad.reservasDelDia,
          aperturaMin,
          cierreExt,
          configuracion.duracionMinima,
          undefined,
          configuracion.anticipacionMinimaMinutos,
        ).slice(0, MAX_HORARIOS_HOY)
      : [];

  const ahora = new Date();
  const abierta = franja && !cerrado ? estaAbierta(ahora.getHours() * 60 + ahora.getMinutes(), aperturaMin, cierreExt) : false;

  return {
    loading: disponibilidad.loading || franjaLoading || configLoading,
    error: disponibilidad.error || franjaError || configError,
    cerrado,
    abierta,
    horarios,
    franja,
    configuracion,
  };
}
