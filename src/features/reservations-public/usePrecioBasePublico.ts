// PUBLIC-R7 — precio base vigente real (precio_base_vigente RPC), para
// mostrar un "Desde $X"/"Por hora" real en Home/Información en vez del
// configCancha.precioHora estático (podía divergir del precio configurado
// desde Configuración). Mismo criterio mínimo que useConfiguracionReservas:
// fetch único, sin caché ni refresco periódico (el precio base no cambia
// mientras el usuario mira la pantalla). Sin fallback silencioso: si falla o
// no hay dato, quien consuma este hook no tiene ningún precio para mostrar
// (loading/error lo dejan en null), nunca un valor inventado.
import { useEffect, useState } from "react";
import { obtenerPrecioBasePublico } from "./reservations.api";

export interface UsePrecioBasePublico {
  precio: number | null;
  loading: boolean;
  error: boolean;
}

export function usePrecioBasePublico(): UsePrecioBasePublico {
  const [precio, setPrecio] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    obtenerPrecioBasePublico().then(({ data, error: fetchError }) => {
      if (!vigente) return;
      if (fetchError || data == null) {
        setError(true);
        setLoading(false);
        return;
      }
      setPrecio(data);
      setLoading(false);
    });
    return () => {
      vigente = false;
    };
  }, []);

  return { precio, loading, error };
}
