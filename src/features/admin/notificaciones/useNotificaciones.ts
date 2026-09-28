// useNotificaciones — deriva las notificaciones del estado real ya cargado y
// aplica los descartes. No hace fetch ni polling: solo recalcula cuando
// cambian los datos de origen (o, cada 60 s, cuando pasa el tiempo — un turno
// pasa a "jugado" y una pendiente vence sin que ningún dato haya cambiado).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReservaProcesada } from "../reservas/reservas.types";
import type { Producto } from "../productos/productos.logic";
import {
  calcularNotificaciones,
  guardarDescartes,
  leerDescartes,
  type Descartes,
  type Notificacion,
  type TipoNotificacion,
} from "./notificaciones.logic";

const TICK_MS = 60_000;

export interface UseNotificacionesParams {
  jugadas: ReservaProcesada[];
  proximas: ReservaProcesada[];
  productos: Producto[];
}

export interface UseNotificacionesResult {
  items: Notificacion[];
  total: number;
  descartar: (tipo: TipoNotificacion) => void;
  // Cambia cada vez que aparece algo nuevo o aumenta una cantidad visible
  // (0 = nada nuevo todavía). Sirve para animar la campana UNA vez.
  novedadToken: number;
}

export function useNotificaciones({ jugadas, proximas, productos }: UseNotificacionesParams): UseNotificacionesResult {
  const [tick, setTick] = useState(0);
  const [descartes, setDescartes] = useState<Descartes>(leerDescartes);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // "Ahora" se toma de nuevo con cada tick Y con cada cambio de datos: así un
  // cambio de semana o un vencimiento se ve en la próxima recarga sin esperar al tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ahora = useMemo(() => Date.now(), [tick, jugadas, proximas, productos]);
  const todas = useMemo(
    () => calcularNotificaciones({ jugadas, proximas, productos, ahora }),
    [jugadas, proximas, productos, ahora],
  );

  const items = useMemo(() => todas.filter((n) => descartes[n.tipo] !== n.huella), [todas, descartes]);
  const total = useMemo(() => items.reduce((acc, n) => acc + n.cantidad, 0), [items]);

  // Un descarte se limpia recién cuando la categoría se vació DESPUÉS de haber
  // estado presente en esta sesión: así, si el problema se resuelve del todo y
  // más tarde reaparece, vuelve a avisar; y a la vez una carga inicial todavía
  // vacía (datos sin llegar) nunca borra un descarte válido de una sesión previa.
  const presentesRef = useRef<Set<TipoNotificacion>>(new Set());
  useEffect(() => {
    const ahoraPresentes = new Set(todas.map((n) => n.tipo));
    const aLimpiar = [...presentesRef.current].filter((t) => !ahoraPresentes.has(t) && descartes[t] !== undefined);
    presentesRef.current = ahoraPresentes;
    if (aLimpiar.length === 0) return;
    const siguiente = { ...descartes };
    for (const t of aLimpiar) delete siguiente[t];
    guardarDescartes(siguiente);
    setDescartes(siguiente);
  }, [todas, descartes]);

  const descartar = useCallback(
    (tipo: TipoNotificacion) => {
      const objetivo = todas.find((n) => n.tipo === tipo);
      if (!objetivo) return;
      const siguiente = { ...descartes, [tipo]: objetivo.huella };
      guardarDescartes(siguiente);
      setDescartes(siguiente);
    },
    [todas, descartes],
  );

  // "Algo nuevo" = una categoría visible que antes no estaba o cuya cantidad
  // subió. Bajar (pagar uno) o descartar nunca cuenta.
  const cantidadesPrevRef = useRef<Map<TipoNotificacion, number>>(new Map());
  const [novedadToken, setNovedadToken] = useState(0);
  useEffect(() => {
    const previas = cantidadesPrevRef.current;
    const hayNovedad = items.some((n) => n.cantidad > (previas.get(n.tipo) ?? 0));
    cantidadesPrevRef.current = new Map(items.map((n) => [n.tipo, n.cantidad]));
    if (hayNovedad) setNovedadToken((t) => t + 1);
  }, [items]);

  return { items, total, descartar, novedadToken };
}
