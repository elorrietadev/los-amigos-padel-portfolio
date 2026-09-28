import { useCambioEconomico } from "../economiaEvents";
// useProductos (D1) — carga del catálogo + patch local tras crear/editar/
// reponer stock. Instancia propia de ProductosView, sin compartir con otras
// vistas (nadie más del panel consume productos hoy) — mismo criterio que
// useTelefonosBloqueados.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { obtenerProductos } from "./productos.api";
import type { Producto } from "./productos.logic";

export type { Producto };

export interface CargarProductosOpciones {
  silencioso?: boolean;
}

export interface UseProductosResult {
  productos: Producto[];
  loading: boolean;
  error: boolean;
  recargar: (opciones?: CargarProductosOpciones) => Promise<void>;
  // Patch local tras crearProducto (éxito) — la fila completa ya vuelve del
  // `.select().single()`, sin refetch.
  agregarProductoLocal: (producto: Producto) => void;
  // Patch local tras actualizarProducto (éxito). Reemplaza por `id`.
  actualizarProductoLocal: (producto: Producto) => void;
  // Patch local tras reponerStock (éxito). `cantidadRepuesta` y
  // `nuevoPrecioVenta` (si se decidió actualizar el precio vigente) ya los
  // tiene el cliente — no hace falta refetch ni lo que devuelve el RPC (el id
  // del lote nuevo, que no se usa en ningún lado).
  ajustarStockLocal: (productoId: string, cantidadRepuesta: number, nuevoPrecioVenta: number | null) => void;
}

export function useProductos(): UseProductosResult {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Guard anti-race, mismo patrón que useTurnosFijos/useTelefonosBloqueados.
  const secuenciaRef = useRef(0);
  const cargadoRef = useRef(false);

  const cargar = useCallback(async ({ silencioso = false }: CargarProductosOpciones = {}) => {
    const miSecuencia = ++secuenciaRef.current;
    if (!silencioso) {
      setLoading(true);
      setError(false);
    }
    const { data, error: fetchError } = await Promise.resolve(obtenerProductos()).catch((error: unknown) => ({ data: null, error }));
    if (miSecuencia !== secuenciaRef.current) return; // se coló una carga más nueva — se descarta esta respuesta

    if (fetchError) {
      setLoading(false);
      if (!cargadoRef.current) setError(true);
      if (!silencioso) {
        setError(true);
        setLoading(false);
      } else {
        console.warn("useProductos: refresco silencioso falló", fetchError);
      }
      return;
    }

    setProductos(data ?? []);
    cargadoRef.current = true;
    setError(false);
    setLoading(false);
  }, []);

  useCambioEconomico(({ devolucion, stockActualizado }) => {
    if (stockActualizado) {
      secuenciaRef.current++;
      if (loading) void cargar();
      return;
    }
    if (devolucion && !loading && !error) {
      secuenciaRef.current++;
      setProductos((prev) => prev.map((p) => p.id === devolucion.productoId ? { ...p, stock_actual: p.stock_actual + devolucion.cantidad } : p));
    } else void cargar({ silencioso: true });
  });

  useEffect(() => {
    cargar();
  }, [cargar]);

  const agregarProductoLocal = useCallback((producto: Producto) => {
    setProductos((prev) => [...prev, producto]);
  }, []);

  const actualizarProductoLocal = useCallback((producto: Producto) => {
    setProductos((prev) => prev.map((p) => (p.id === producto.id ? producto : p)));
  }, []);

  const ajustarStockLocal = useCallback(
    (productoId: string, cantidadRepuesta: number, nuevoPrecioVenta: number | null) => {
      setProductos((prev) =>
        prev.map((p) =>
          p.id === productoId
            ? { ...p, stock_actual: p.stock_actual + cantidadRepuesta, precio_venta: nuevoPrecioVenta ?? p.precio_venta }
            : p,
        ),
      );
    },
    [],
  );

  return { productos, loading, error, recargar: cargar, agregarProductoLocal, actualizarProductoLocal, ajustarStockLocal };
}
