// Port de cargarSemanaGrilla (admin.html:635-681) — carga de la semana visible
// según `semanaOffset`, con caché por lunes y guard anti-race (B7).
//
// Ajuste deliberado respecto del legacy (aprobado): acá `secuenciaRef` cuenta
// TODAS las cargas (silenciosas o no) y gatea data/error/loading por igual —
// el legacy solo incrementaba su secuencia para cargas no-silenciosas y solo
// la usaba para gatear el spinner, dejando sin proteger una carrera entre dos
// refrescos silenciosos (o uno silencioso + uno no) de la MISMA semana.
// `semanaVigenteRef` sigue el mismo rol que el legacy: descarta una respuesta
// que ya no corresponde a la semana actualmente seleccionada, sin importar la
// secuencia (cubre el caso de navegar de semana con un pedido en vuelo).

import { useCallback, useEffect, useRef, useState } from "react";
import { formatearISO } from "../../../lib/datetime";
import { obtenerReservasPorRango } from "../reservas/reservas.api";
import { obtenerLunesOffset, procesarReservasGrilla, type ReservaConHorario } from "./agenda.logic";

export interface CargarAgendaOpciones {
  // Ignora la caché de esa semana y vuelve a pedirla al servidor — necesario
  // para polling/visibilitychange/Realtime (si no, nunca se enterarían de un
  // cambio en una semana ya visitada).
  forzar?: boolean;
  // admin.html:531 (mismo criterio ya usado en B5) — no togglea loading ni
  // dispara el toast de error asociado a `error`.
  silencioso?: boolean;
}

export interface SemanaVisible {
  lunesISO: string;
  domingoISO: string;
}

export interface UseAgendaSemanaResult {
  data: ReservaConHorario[];
  loading: boolean;
  error: boolean;
  semanaVisible: SemanaVisible;
  recargar: (opciones?: CargarAgendaOpciones) => Promise<void>;
  // Patch local tras cancelar/desbloquear una reserva desde el sheet de
  // Agenda (B7) — sin sincronizar con ReservasView, que ni siquiera existe
  // montada mientras se ve Agenda (se autocorrige sola al remontar).
  quitarReservaLocal: (id: string) => void;
}

export function useAgendaSemana(semanaOffset: number): UseAgendaSemanaResult {
  const [data, setData] = useState<ReservaConHorario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const cacheRef = useRef<Record<string, ReservaConHorario[]>>({});
  // admin.html:640 (semanaVigenteRef).
  const semanaVigenteRef = useRef<string | null>(null);
  // admin.html:646 (secuenciaGrillaRef), pero global a TODA carga — ver
  // comentario de cabecera.
  const secuenciaRef = useRef(0);

  const lunes = obtenerLunesOffset(Date.now(), semanaOffset);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const lunesISO = formatearISO(lunes);
  const domingoISO = formatearISO(domingo);

  // Deps [] a propósito: no cierra sobre lunesISO/domingoISO (llegan como
  // parámetros en cada llamada), solo sobre refs y setters estables — puede
  // vivir para siempre sin quedar con un closure viejo.
  const cargar = useCallback(
    async (lunesISOObjetivo: string, domingoISOObjetivo: string, opciones: CargarAgendaOpciones = {}) => {
      const { forzar = false, silencioso = false } = opciones;
      semanaVigenteRef.current = lunesISOObjetivo;
      const miSecuencia = ++secuenciaRef.current;

      if (!forzar && cacheRef.current[lunesISOObjetivo]) {
        setData(cacheRef.current[lunesISOObjetivo]);
        setError(false);
        setLoading(false);
        return;
      }

      if (!silencioso) { setLoading(true); setError(false); }
      if (!cacheRef.current[lunesISOObjetivo]) setData([]);
      const { data: filas, error: fetchError } = await Promise.resolve(obtenerReservasPorRango(lunesISOObjetivo, domingoISOObjetivo)).catch((error: unknown) => ({ data: null, error }));

      // Única semana vigente Y única carga más reciente: cualquier otra
      // combinación (otra semana, o esta misma semana pero superada por una
      // carga posterior) descarta la respuesta sin tocar data/error/loading.
      const vigente = semanaVigenteRef.current === lunesISOObjetivo && miSecuencia === secuenciaRef.current;
      if (!vigente) return;

      if (fetchError) {
        setLoading(false);
        if (!cacheRef.current[lunesISOObjetivo]) setError(true);
        if (!silencioso) {
          setError(true);
          setLoading(false);
        } else {
          console.warn("useAgendaSemana: refresco silencioso falló", fetchError);
        }
        return;
      }

      const procesadas = procesarReservasGrilla(filas, Date.now());
      cacheRef.current[lunesISOObjetivo] = procesadas;
      setError(false);
      setData(procesadas);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    cargar(lunesISO, domingoISO);
  }, [lunesISO, domingoISO, cargar]);

  const recargar = useCallback(
    (opciones?: CargarAgendaOpciones) => cargar(lunesISO, domingoISO, opciones),
    [cargar, lunesISO, domingoISO],
  );

  // No memoizada a propósito: solo se llama desde un manejador de evento (el
  // sheet de detalle), nunca desde un array de deps — no necesita identidad
  // estable, sí necesita cerrar siempre sobre el lunesISO del render actual
  // (la reserva que se cancela es, por definición, de la semana visible).
  function quitarReservaLocal(id: string) {
    setData((prev) => prev.filter((r) => r.id !== id));
    if (cacheRef.current[lunesISO]) {
      cacheRef.current[lunesISO] = cacheRef.current[lunesISO].filter((r) => r.id !== id);
    }
  }

  return {
    data,
    loading,
    error,
    semanaVisible: { lunesISO, domingoISO },
    recargar,
    quitarReservaLocal,
  };
}
