// Port de la porción turnos_fijos/excepciones_turno_fijo de cargarTodo
// (admin.html:609-630), más el token de baja (admin.html:2031-2049) desde C3
// — sin el resto de cargarTodo (productos, bloqueados, materializar turnos
// jugados: eso es de otros dominios/pasos).
//
// C2 — se muda acá desde agenda/useTurnosFijos.ts (B7: en ese momento vivía en
// Agenda porque era su única consumidora). C3 — sube un escalón más: AdminShell
// crea la ÚNICA instancia y la pasa por props a AgendaView/ReservasView/
// TurnosFijosView (sin Context/provider) para que las tres compartan el mismo
// turnosFijos/excepciones/cache de tokens en vez de cada una traer su propia
// copia — mismo criterio que ya aplica useAgendaSemana.ts al reusar
// reservas/reservas.api.ts, un nivel más arriba.
//
// A diferencia de B7 (carga única, sin refresco): expone `recargar` (con guard
// anti-race, mismo patrón que useAgendaSemana/useReservasProximas) para que
// TurnosFijosView pueda refrescar tras sus propias mutaciones si el patch
// local no alcanza (ver rollback fallido en TurnosFijosView.tsx). Con la
// instancia compartida de C3, Agenda YA NO llama a `recargar` al reactivarse:
// el patch local que ya aplica TurnosFijosView es la fuente actual (mismo
// estado, misma instancia) — un refresh "por las dudas" ahí sería redundante.

import { useCallback, useEffect, useRef, useState } from "react";
import { recortarHora } from "../../../lib/datetime";
import type { ExcepcionTurnoFijo, TurnoFijoConHorario } from "../agenda/agenda.logic";
import { obtenerExcepciones, obtenerTokenTitular, obtenerTurnosFijos, upsertTokenTitular } from "./turnosFijos.api";

export interface CargarTurnosFijosOpciones {
  // admin.html:531 (mismo criterio ya usado en el resto del código migrado) —
  // no togglea `loading` ni el `error` persistente que dispararía un toast;
  // un fallo de fondo no debe alarmar a nadie, solo queda un console.warn.
  silencioso?: boolean;
}

export interface UseTurnosFijosResult {
  turnosFijos: TurnoFijoConHorario[];
  excepciones: ExcepcionTurnoFijo[];
  loading: boolean;
  error: boolean;
  recargar: (opciones?: CargarTurnosFijosOpciones) => Promise<void>;
  // Patch local tras crear/eliminar un turno fijo (C2) — evita un refetch
  // completo para una sola fila ya conocida, mismo criterio que
  // agregarExcepcionLocal (B7) de abajo.
  agregarTurnoFijoLocal: (turnoFijo: TurnoFijoConHorario) => void;
  quitarTurnoFijoLocal: (id: string) => void;
  // TF-R3 — patch local tras eliminarTitular: sacar TODOS sus horarios del
  // estado (no solo uno) y limpiar su token cacheado (obtenerOCrearToken lo
  // regeneraría para un titular que ya no existe si no se limpia).
  quitarTitularLocal: (titularId: string) => void;
  // TF-R3 — patch local tras actualizarTitular: nombre/telefono viven
  // duplicados en cada fila de ese titular (aplanados desde el embed), así
  // que hay que pisarlos en todas a la vez.
  actualizarTitularLocal: (titularId: string, nombre: string, telefono: string) => void;
  // Patch local tras crearExcepcionTurnoFijo (B7, cancelar una ocurrencia
  // puntual desde el sheet de Agenda).
  agregarExcepcionLocal: (excepcion: ExcepcionTurnoFijo) => void;
  // Patch local tras crearExcepcionesTurnoFijo (C2, excepciones automáticas
  // por choques al dar de alta un turno fijo) — variante bulk de la de arriba.
  agregarExcepcionesLocal: (excepciones: ExcepcionTurnoFijo[]) => void;
  // C3 — admin.html:2031-2049 (obtenerOCrearToken), usado por TurnosFijosView
  // para el link de baja de WhatsApp. Cache en memoria (`tokensFijos`, no
  // persistido) para no repetir el upsert/select una vez resuelto el token de
  // un turno fijo. `null` si no se pudo generar/leer (el llamador decide el
  // mensaje de error).
  obtenerOCrearToken: (turnoFijoId: string) => Promise<string | null>;
}

export function useTurnosFijos(): UseTurnosFijosResult {
  const [turnosFijos, setTurnosFijos] = useState<TurnoFijoConHorario[]>([]);
  const [excepciones, setExcepciones] = useState<ExcepcionTurnoFijo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // C3 — cache en memoria de tokens ya resueltos, sin servicio propio todavía
  // (decisión C3: no crear tokensFijosService.ts).
  //
  // TF-R2 — la key pasa a ser titular_id (no turno_fijo_id): el token es uno
  // por titular, compartido entre todos sus horarios.
  const [tokensFijos, setTokensFijos] = useState<Record<string, string>>({});
  // Guard anti-race (mismo patrón que useAgendaSemana/useReservasProximas):
  // gana la carga iniciada más recientemente, sin importar en qué orden
  // resuelvan (mount, `recargar` manual, reactivación de Agenda).
  const secuenciaRef = useRef(0);
  const cargadoRef = useRef(false);

  const cargar = useCallback(async ({ silencioso = false }: CargarTurnosFijosOpciones = {}) => {
    const miSecuencia = ++secuenciaRef.current;
    if (!silencioso) {
      setLoading(true);
      setError(false);
    }
    const [{ data: tf, error: errorTf }, { data: ex, error: errorEx }] = await Promise.all([
      Promise.resolve(obtenerTurnosFijos()).catch((error: unknown) => ({ data: null, error })),
      Promise.resolve(obtenerExcepciones()).catch((error: unknown) => ({ data: null, error })),
    ]);
    if (miSecuencia !== secuenciaRef.current) return; // se coló una carga más nueva — se descarta esta respuesta

    const fetchError = errorTf || errorEx;
    if (fetchError) {
      setLoading(false);
      if (!cargadoRef.current) setError(true);
      if (!silencioso) {
        setError(true);
        setLoading(false);
      } else {
        console.warn("useTurnosFijos: refresco silencioso falló", fetchError);
      }
      return;
    }

    // TF-R2 — nombre/telefono ya no están en turnos_fijos: vienen del embed
    // `titulares_turno_fijo` armado en obtenerTurnosFijos() y se aplanan acá,
    // junto con titular_id, para que el resto del código siga viendo el mismo
    // shape que antes (TurnoFijoConHorario).
    setTurnosFijos(
      (tf ?? []).map((t) => ({
        id: t.id,
        dia_semana: t.dia_semana,
        titular_id: t.titular_id,
        nombre: t.titulares_turno_fijo?.nombre ?? "",
        telefono: t.titulares_turno_fijo?.telefono ?? "",
        horaInicio: recortarHora(t.hora_inicio)!,
        horaFin: recortarHora(t.hora_fin)!,
        // FINAL-F3 (M5) — necesario para no proyectar ocurrencias previas a la creación.
        creado: t.creado,
      })),
    );
    setExcepciones(ex ?? []);
    cargadoRef.current = true;
    setError(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const agregarTurnoFijoLocal = useCallback((turnoFijo: TurnoFijoConHorario) => {
    setTurnosFijos((prev) => [...prev, turnoFijo]);
  }, []);

  const quitarTurnoFijoLocal = useCallback((id: string) => {
    setTurnosFijos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const quitarTitularLocal = useCallback((titularId: string) => {
    setTurnosFijos((prev) => prev.filter((t) => t.titular_id !== titularId));
    setTokensFijos((prev) => {
      if (!(titularId in prev)) return prev;
      const { [titularId]: _quitado, ...resto } = prev;
      return resto;
    });
  }, []);

  const actualizarTitularLocal = useCallback((titularId: string, nombre: string, telefono: string) => {
    setTurnosFijos((prev) => prev.map((t) => (t.titular_id === titularId ? { ...t, nombre, telefono } : t)));
  }, []);

  const agregarExcepcionLocal = useCallback((excepcion: ExcepcionTurnoFijo) => {
    secuenciaRef.current++;
    setLoading(false);
    setExcepciones((prev) => [...prev.filter((e) => e.turno_fijo_id !== excepcion.turno_fijo_id || e.fecha !== excepcion.fecha), excepcion]);
  }, []);

  const agregarExcepcionesLocal = useCallback((nuevas: ExcepcionTurnoFijo[]) => {
    setExcepciones((prev) => [...prev, ...nuevas]);
  }, []);

  // C3 — admin.html:2031-2049. Flujo: cache -> upsert(ignoreDuplicates) -> si
  // no devuelve fila (ya existía un token para este titular), fallback
  // select -> cache. Sin reintentos/delays para el caso multi-admin (dos
  // admins pidiendo el link del mismo titular a la vez): decisión C3, no
  // agregar esa complejidad todavía.
  //
  // TF-R2 — sigue recibiendo turnoFijoId (mismo call site en TurnosFijosView,
  // sin tocarlo) pero resuelve el titular_id real desde el estado ya cargado
  // antes de pedir/crear el token — el link resultante es el mismo para
  // cualquier horario del mismo titular.
  const obtenerOCrearToken = useCallback(
    async (turnoFijoId: string): Promise<string | null> => {
      const turno = turnosFijos.find((t) => t.id === turnoFijoId);
      if (!turno) return null;
      const titularId = turno.titular_id;

      const cacheado = tokensFijos[titularId];
      if (cacheado) return cacheado;

      const { data } = await upsertTokenTitular(titularId);
      let token = data?.token ?? null;
      if (!token) {
        const { data: existente } = await obtenerTokenTitular(titularId);
        token = existente?.token ?? null;
      }
      if (!token) return null;

      setTokensFijos((prev) => ({ ...prev, [titularId]: token }));
      return token;
    },
    [turnosFijos, tokensFijos],
  );

  return {
    turnosFijos,
    excepciones,
    loading,
    error,
    recargar: cargar,
    agregarTurnoFijoLocal,
    quitarTurnoFijoLocal,
    quitarTitularLocal,
    actualizarTitularLocal,
    agregarExcepcionLocal,
    agregarExcepcionesLocal,
    obtenerOCrearToken,
  };
}

// C3 — instancia vacía para vistas que reciben el hook compartido como prop
// opcional (hoy solo ReservasView: el toggle "Mostrar turnos fijos" no es su
// función principal, a diferencia de Agenda/TurnosFijosView) y no deberían
// tener que armar un objeto ad-hoc en cada test/uso aislado que no la pasa.
export const TURNOS_FIJOS_VACIO: UseTurnosFijosResult = {
  turnosFijos: [],
  excepciones: [],
  loading: false,
  error: false,
  recargar: async () => {},
  agregarTurnoFijoLocal: () => {},
  quitarTurnoFijoLocal: () => {},
  quitarTitularLocal: () => {},
  actualizarTitularLocal: () => {},
  agregarExcepcionLocal: () => {},
  agregarExcepcionesLocal: () => {},
  obtenerOCrearToken: async () => null,
};
