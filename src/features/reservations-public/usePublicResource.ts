import { useCallback, useEffect, useState } from "react";

// Snapshots belong to both a key and an attempt, including the render before effects.
export function usePublicResource<T>(key: string, cargar: () => Promise<T>) {
  const [intento, setIntento] = useState(0);
  const [estado, setEstado] = useState<{ key: string; intento: number; data: T | null; error: boolean } | null>(null);
  const refrescar = useCallback(() => setIntento((i) => i + 1), []);
  useEffect(() => {
    let vigente = true;
    const timeout = setTimeout(() => {
      if (!vigente) return;
      vigente = false;
      setEstado({ key, intento, data: null, error: true });
    }, 15000);
    cargar().then((data) => {
      if (vigente) setEstado({ key, intento, data, error: false });
    }).catch(() => {
      if (vigente) setEstado({ key, intento, data: null, error: true });
    }).finally(() => clearTimeout(timeout));
    return () => { vigente = false; clearTimeout(timeout); };
  }, [key, intento, cargar]);
  const actual = estado?.key === key && estado.intento === intento ? estado : null;
  return { data: actual?.data ?? null, loading: !actual, error: actual?.error ?? false, refrescar };
}
