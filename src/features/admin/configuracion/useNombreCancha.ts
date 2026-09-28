// CFG-F1.1 — nombre real de la cancha (datos_publicos_cancha) para los
// mensajes de WhatsApp que Agenda/Reservas arman para el JUGADOR, en vez del
// hardcode de canchaConfig.ts. Reusa obtenerDatosPublicosCancha de
// configuracion.api (RLS is_admin(), no la vista pública) porque quien
// consume esto ya corre autenticado como admin. Mismo criterio mínimo que
// useDatosPublicosCancha (public-shell): un solo fetch, sin caché ni
// refresco periódico — null mientras carga o si falla, nunca un nombre
// inventado.
import { useEffect, useState } from "react";
import { obtenerDatosPublicosCancha } from "./configuracion.api";

export function useNombreCancha(): string | null {
  const [nombreCancha, setNombreCancha] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerDatosPublicosCancha().then(({ data }) => {
      if (vigente) setNombreCancha(data?.nombre_cancha ?? null);
    });
    return () => {
      vigente = false;
    };
  }, []);

  return nombreCancha;
}
