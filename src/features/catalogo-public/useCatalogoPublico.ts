// useCatalogoPublico (PUBLIC-R4) — trae el catálogo público real. Singleton
// (no depende de fecha ni de ningún parámetro), se trae una sola vez — mismo
// criterio y misma forma que useConfiguracionReservas.ts. Cada vista que lo
// necesita (Home, Catálogo) llama a su propia instancia: no existe una capa
// de cache compartida en este frontend (mismo patrón que useDisponibilidad/
// useFranjaOperativa, cada una fetchea por su cuenta).
import { useEffect, useState } from "react";
import { obtenerProductosPublicos } from "./catalogo.api";
import { procesarProductosPublicos } from "./catalogo.logic";
import type { ProductoPublico } from "./catalogo.types";

export interface UseCatalogoPublico {
  productos: ProductoPublico[];
  loading: boolean;
  error: boolean;
}

export function useCatalogoPublico(): UseCatalogoPublico {
  const [productos, setProductos] = useState<ProductoPublico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    obtenerProductosPublicos().then(({ data, error: fetchError }) => {
      if (cancelado) return;
      if (fetchError) {
        setError(true);
        setLoading(false);
        return;
      }
      setProductos(procesarProductosPublicos(data));
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  return { productos, loading, error };
}
