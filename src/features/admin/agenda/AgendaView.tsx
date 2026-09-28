// AgendaView — grilla semanal (B7, rediseño visual R3). Orquesta
// useAgendaSemana (reservas de la semana visible, propio de esta vista) +
// turnosFijos (turnos fijos/excepciones, desde C3 instancia única de
// AdminShell recibida por props — ver useTurnosFijos.ts) y arma cada celda
// con las funciones puras de agenda.logic.ts (B6). El armado visual en sí
// (bloques reales según duración, grilla desktop vs. vista de un solo día en
// mobile) vive en AgendaGridDesktop/AgendaDiaMobile/AgendaColumnaDia — este
// archivo sigue siendo el dueño de los datos/efectos/mutaciones, sin
// cambios de negocio (R3 es puramente visual).
//
// Referencias al legacy (admin.html): navegación de semana (2205-2215),
// drag-to-scroll (445-467), auto-scroll a "hoy" (497-515),
// polling+visibilitychange (772-790), sheet de detalle (2900-2941, ahora
// Drawer/BottomSheet en AgendaDetalleSheet.tsx).

import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { hoyISO } from "../../../lib/datetime";
import { useNombreCancha } from "../configuracion/useNombreCancha";
import { cancelarReserva } from "../reservas/reservas.api";
import { mensajeErrorReserva } from "../reservas/reservas.logic";
import { crearExcepcionTurnoFijo } from "../turnos-fijos/turnosFijos.api";
import type { UseTurnosFijosResult } from "../turnos-fijos/useTurnosFijos";
import { AgendaDetalleSheet } from "./AgendaDetalleSheet";
import { AgendaDiaMobile } from "./AgendaDiaMobile";
import { AgendaGridDesktop } from "./AgendaGridDesktop";
import type { CeldaOcupada } from "./agenda.grid";
import {
  construirDiasGrilla,
  construirFilasGrilla,
  construirLinkWhatsappCancelacion,
  etiquetaSemana,
  obtenerLunesOffset,
} from "./agenda.logic";
import { useAgendaSemana } from "./useAgendaSemana";
import { useEsDesktop } from "./useEsDesktop";
import { useFranjaSemana } from "./useFranjaSemana";

export interface AgendaViewProps {
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
  // admin.html:799-820 — misma señal que consume ReservasView, empujada por
  // AdminShell (dueño único del canal Realtime). Ver useAgendaSemana.ts.
  nuevaReservaSignal?: { fecha: string; token: number } | null;
  // B8 — AdminShell mantiene esta vista siempre montada (con `hidden`) en vez
  // de desmontarla al cambiar de tab, así que ella misma decide qué hacer
  // según esté visible o no. Default `true` para no romper los tests/usos
  // existentes que no la pasan (equivalen a "siempre activa", el comportamiento
  // previo a B8). Ver AdminShell.tsx.
  activo?: boolean;
  // C3 — instancia única de useTurnosFijos que crea AdminShell y comparte por
  // props con AgendaView/ReservasView/TurnosFijosView (sin Context/provider).
  // Requerida (no opcional): a diferencia de ReservasView, esta vista SÍ
  // necesita datos reales de turnos fijos para su función principal (la
  // grilla), así que no tiene sentido un default vacío acá.
  turnosFijos: UseTurnosFijosResult;
  // C6 — token numérico dedicado a materializar_turnos_fijos_jugados
  // (AdminShell, una vez por sesión) — ver comentario de cabecera de
  // AdminShell.tsx sobre por qué no reusa nuevaReservaSignal. Default 0 para
  // no romper tests/usos existentes que no lo pasan.
  materializacionSignal?: number;
}

// admin.html:2219-2224 (leyenda) — colores actualizados a la paleta Court
// Graphite de R3 (tokens.css): reserva=success, fijo=secondary/cian
// ("diferenciado con secundario/cian" del pedido), bloqueado=neutro (mismo
// rayado que dibuja AgendaColumnaDia vía estiloBloque, acá solo un swatch
// sólido equivalente para la leyenda).
const LEYENDA: ReadonlyArray<{ label: string; className: string }> = [
  { label: "Reservado", className: "bg-success" },
  { label: "Turno fijo", className: "bg-secondary" },
  { label: "Bloqueado", className: "bg-border-strong" },
];

interface EstadoArrastre {
  activo: boolean;
  startX: number;
  scrollLeft: number;
  movio: boolean;
}

export function AgendaView({
  mostrarToast,
  nuevaReservaSignal = null,
  activo = true,
  turnosFijos,
  materializacionSignal = 0,
}: AgendaViewProps) {
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [detalleSheet, setDetalleSheet] = useState<CeldaOcupada | null>(null);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  // R3 — solo la usa la vista mobile (un solo día visible + selector
  // horizontal); en desktop se ignora (se ven los 7 días a la vez).
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoyISO());

  const esDesktop = useEsDesktop();
  const agenda = useAgendaSemana(semanaOffset);
  const nombreCancha = useNombreCancha();

  const grillaScrollRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<EstadoArrastre>({ activo: false, startX: 0, scrollLeft: 0, movio: false });

  useEffect(() => {
    if (agenda.error) mostrarToast("No se pudo cargar la agenda de esta semana. Probá de nuevo.", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda.error]);

  // admin.html:772-790 — refresco silencioso cada 5 min + al volver a la
  // pestaña, siempre con forzar:true (si no, el cache de useAgendaSemana
  // devolvería la misma respuesta vieja sin ir a buscar nada nuevo).
  // B8 — gateado por `activo`: mientras la vista está oculta (AdminShell la
  // mantiene montada con `hidden`) no tiene sentido pollear en segundo plano;
  // al reactivarse, el efecto de abajo ya se encarga de un refresco inmediato.
  useEffect(() => {
    if (!activo) return;
    function refrescoSilencioso() {
      agenda.recargar({ forzar: true, silencioso: true });
    }
    function onVisibilidad() {
      if (document.visibilityState === "visible") refrescoSilencioso();
    }
    document.addEventListener("visibilitychange", onVisibilidad);
    const intervalId = setInterval(refrescoSilencioso, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilidad);
      clearInterval(intervalId);
    };
  }, [agenda.recargar, activo]);

  // admin.html:799-820 (rama cayeEnSemanaVigente) — solo fuerza un refresco
  // si la fecha del INSERT cae en la semana actualmente visible; si el
  // usuario está viendo otra semana, no hace nada (esa semana no cacheada se
  // trae fresca sola cuando se navegue hasta ahí).
  const signalVistoRef = useRef(nuevaReservaSignal?.token ?? null);
  // C6 — mismo patrón que signalVistoRef, para el signal dedicado de
  // materializar_turnos_fijos_jugados (ver AgendaViewProps de arriba).
  const materializacionVistoRef = useRef(materializacionSignal);
  // B8 — al reactivarse (false→true) esta vista no necesita reaccionar a
  // señales viejas acumuladas mientras estuvo oculta: alcanza con un refresco
  // inmediato desde el servidor. Se declara ANTES de los efectos de señal de
  // abajo para que, en el mismo commit, los tokens queden marcados como
  // "vistos" antes de que esos efectos los evalúen — así no se duplica el
  // refresco (mismo criterio para nuevaReservaSignal y materializacionSignal).
  // C3 — turnosFijos ya NO se recarga acá: con la instancia única compartida
  // desde AdminShell (ver AgendaViewProps), un alta/baja hecha en la tab de
  // Turnos Fijos ya está reflejada en este mismo objeto vía patch local — no
  // hace falta (ni corresponde) un refresh "por las dudas" al reactivarse.
  const prevActivoRef = useRef(activo);
  useEffect(() => {
    if (activo && !prevActivoRef.current) {
      signalVistoRef.current = nuevaReservaSignal?.token ?? null;
      materializacionVistoRef.current = materializacionSignal;
      agenda.recargar({ forzar: true, silencioso: true });
    }
    prevActivoRef.current = activo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  useEffect(() => {
    if (!activo) return;
    if (!nuevaReservaSignal || signalVistoRef.current === nuevaReservaSignal.token) return;
    signalVistoRef.current = nuevaReservaSignal.token;
    const { lunesISO, domingoISO } = agenda.semanaVisible;
    if (nuevaReservaSignal.fecha >= lunesISO && nuevaReservaSignal.fecha <= domingoISO) {
      agenda.recargar({ forzar: true, silencioso: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevaReservaSignal, activo]);

  // C6 — reacciona al signal dedicado de materializar_turnos_fijos_jugados.
  // A diferencia de nuevaReservaSignal, no filtra por semana visible: un
  // batch de materialización puede tocar varias fechas/semanas a la vez, y es
  // un evento raro (una vez por sesión) — se fuerza el refresco directo ante
  // cualquier cambio de token, sin acotarlo.
  useEffect(() => {
    if (!activo) return;
    if (materializacionVistoRef.current === materializacionSignal) return;
    materializacionVistoRef.current = materializacionSignal;
    agenda.recargar({ forzar: true, silencioso: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materializacionSignal, activo]);

  // B8 — al ocultar la vista (tab cambia a otra), cierra el sheet de detalle
  // si no hay una mutación en curso; si la hay, se deja terminar su propio
  // flujo (confirmarCancelarReserva/confirmarCancelarOcurrencia ya cierran el
  // sheet al resolver, con o sin error).
  useEffect(() => {
    if (!activo && !procesandoAccion) setDetalleSheet(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  const lunes = obtenerLunesOffset(Date.now(), semanaOffset);
  const diasGrilla = construirDiasGrilla(lunes);
  const hoy = hoyISO();

  // CFG-F2 — rango real de horas de la grilla (el más amplio entre los 7
  // días de la semana visible: horarios_semana + fecha especial, resueltos
  // por franja_operativa), reemplaza los 08:00/01:00 hardcodeados de
  // configCancha. `rangoGrilla` es null mientras carga, si falló, o si NINGÚN
  // día de la semana está abierto — en cualquiera de esos casos no hay
  // grilla que dibujar, nunca un fallback silencioso.
  const fechasSemana = diasGrilla.map((d) => d.iso);
  const {
    rango: rangoGrilla,
    porDia: aperturaMinPorDia,
    loading: rangoLoading,
    error: rangoError,
  } = useFranjaSemana(fechasSemana);
  const filasGrilla = rangoGrilla ? construirFilasGrilla(rangoGrilla.aperturaMin, rangoGrilla.cierreExt) : [];

  // R3 — al cambiar de semana, la vista mobile vuelve a mostrar "hoy" si esa
  // semana lo incluye (offset 0), o el lunes de la semana nueva en caso
  // contrario (mismo criterio que el auto-scroll a "hoy" de desktop, abajo).
  useEffect(() => {
    const hoyEnRango = diasGrilla.some((d) => d.iso === hoy);
    setDiaSeleccionado(hoyEnRango ? hoy : diasGrilla[0].iso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanaOffset]);

  // admin.html:497-515 — centra la columna de "hoy" al montar/cambiar de
  // semana (si "hoy" no está en el rango visible, hoyIndex da -1 y se
  // resetea el scroll a 0, igual que el legacy). Solo aplica a la grilla
  // desktop (R3): la vista mobile no tiene scroll horizontal, elige el día
  // por el selector de arriba.
  useEffect(() => {
    if (!esDesktop || !grillaScrollRef.current) return;
    const hoyIndex = diasGrilla.findIndex((d) => d.iso === hoy);
    if (hoyIndex >= 0) {
      const colWidth = grillaScrollRef.current.scrollWidth / (diasGrilla.length + 1);
      grillaScrollRef.current.scrollLeft = Math.max(0, colWidth * (hoyIndex + 1) - grillaScrollRef.current.clientWidth / 2);
    } else {
      grillaScrollRef.current.scrollLeft = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanaOffset, esDesktop]);

  function irSemanaAnterior() {
    setSemanaOffset((s) => s - 1);
  }
  function irSemanaSiguiente() {
    setSemanaOffset((s) => s + 1);
  }
  function volverAHoy() {
    setSemanaOffset(0);
  }

  // admin.html:445-467 (arrastre horizontal con mouse en desktop).
  function iniciarArrastre(e: ReactMouseEvent<HTMLDivElement>) {
    arrastreRef.current = { activo: true, startX: e.pageX, scrollLeft: e.currentTarget.scrollLeft, movio: false };
    e.currentTarget.style.cursor = "grabbing";
  }
  function moverArrastre(e: ReactMouseEvent<HTMLDivElement>) {
    const a = arrastreRef.current;
    if (!a.activo) return;
    const delta = e.pageX - a.startX;
    if (Math.abs(delta) > 3) a.movio = true;
    e.currentTarget.scrollLeft = a.scrollLeft - delta;
  }
  function terminarArrastre(e: ReactMouseEvent<HTMLDivElement>) {
    e.currentTarget.style.cursor = "grab";
    arrastreRef.current = { ...arrastreRef.current, activo: false };
  }
  function bloquearClickSiArrastro(e: ReactMouseEvent<HTMLDivElement>) {
    if (arrastreRef.current.movio) {
      e.stopPropagation();
      e.preventDefault();
      arrastreRef.current = { ...arrastreRef.current, movio: false };
    }
  }

  function alClickCelda(celda: CeldaOcupada) {
    setDetalleSheet(celda);
  }

  // admin.html:1898-1910 (cancelarReserva) — mismo delete real, patch local
  // SOLO en Agenda (ver useAgendaSemana.ts): mientras se ve Agenda,
  // ReservasView está desmontada y no hay nada que sincronizar; se autocorrige
  // sola al remontar (trae datos frescos del servidor).
  //
  // P1 — `avisar`: si es true, DESPUÉS de que el DELETE real confirme éxito
  // (nunca antes, nunca si falla) se abre un wa.me con el aviso de
  // cancelación prellenado — el admin sigue teniendo que apretar "Enviar" en
  // WhatsApp, esto nunca manda el mensaje solo. `reservaCancelada` se lee del
  // `detalleSheet` todavía abierto en este momento (antes de cerrarlo), no
  // hace falta que el llamador pase teléfono/fecha/hora por separado.
  async function confirmarCancelarReserva(id: string, avisar: boolean) {
    if (procesandoAccion) return;
    setProcesandoAccion(true);
    const reservaCancelada = detalleSheet?.estado === "reserva" ? detalleSheet.reserva : null;
    const { error } = await cancelarReserva(id);
    if (error) {
      mostrarToast(mensajeErrorReserva(error, "cancelar"), "error");
    } else {
      if (reservaCancelada?.turno_fijo_id) {
        turnosFijos.agregarExcepcionLocal({ id: `cancel-${id}`, turno_fijo_id: reservaCancelada.turno_fijo_id, fecha: reservaCancelada.fecha, creado: null });
        void turnosFijos.recargar({ silencioso: true });
      }
      agenda.quitarReservaLocal(id);
      if (avisar && reservaCancelada) {
        const link = construirLinkWhatsappCancelacion(reservaCancelada, nombreCancha ?? "");
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      }
    }
    setProcesandoAccion(false);
    // Se cierra siempre, incluso si hubo error — mismo criterio que
    // ReservasView (B4.2).
    setDetalleSheet(null);
  }

  // admin.html:2019-2029 (cancelarOcurrencia). `id` local (no viene del
  // insert real: no se hace .select() de vuelta) — alcanza para el patch
  // local porque estaExceptuado solo mira turno_fijo_id+fecha, nunca el id.
  async function confirmarCancelarOcurrencia(turnoFijoId: string, fecha: string) {
    if (procesandoAccion) return;
    setProcesandoAccion(true);
    const { error } = await crearExcepcionTurnoFijo(turnoFijoId, fecha);
    if (error) {
      mostrarToast("No se pudo cancelar esa fecha. Probá de nuevo.", "error");
    } else {
      turnosFijos.agregarExcepcionLocal({ id: `local-${Date.now()}`, turno_fijo_id: turnoFijoId, fecha, creado: null });
    }
    setProcesandoAccion(false);
    setDetalleSheet(null);
  }

  return (
    <>
    <section className="glass-blur rounded-lg border border-border bg-surface-glass p-3.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={irSemanaAnterior}
          aria-label="Semana anterior"
          className="tap-fx ui-transition rounded-pill border border-border px-3 py-1.5 text-sm font-semibold text-muted hover:border-border-strong hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          ◀
        </button>
        <div className="text-center text-[13px] font-semibold text-text">
          {etiquetaSemana(diasGrilla)}
          {semanaOffset !== 0 && (
            <>
              {" "}
              ·{" "}
              <button type="button" onClick={volverAHoy} className="text-accent underline">
                volver a hoy
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={irSemanaSiguiente}
          aria-label="Semana siguiente"
          className="tap-fx ui-transition rounded-pill border border-border px-3 py-1.5 text-sm font-semibold text-muted hover:border-border-strong hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          ▶
        </button>
      </div>

      {agenda.loading && <p className="mt-2.5 text-sm text-muted">Cargando agenda...</p>}

      <div className="mt-3 flex flex-wrap justify-center gap-4 text-[11px] text-muted">
        {LEYENDA.map(({ label, className }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
            {label}
          </span>
        ))}
      </div>

      {rangoLoading ? (
        <p className="mt-2.5 text-sm text-muted">Cargando horarios de la semana...</p>
      ) : !rangoGrilla ? (
        <p className="mt-2.5 text-sm text-muted">
          {rangoError
            ? "No se pudo cargar el horario de esta semana. Probá de nuevo."
            : "No hay ningún día abierto configurado esta semana."}
        </p>
      ) : esDesktop ? (
        <AgendaGridDesktop
          diasGrilla={diasGrilla}
          filasGrilla={filasGrilla}
          reservasSemana={agenda.data}
          turnosFijos={turnosFijos.turnosFijos}
          excepciones={turnosFijos.excepciones}
          aperturaMinPorDia={aperturaMinPorDia}
          aperturaMinDefault={rangoGrilla.aperturaMin}
          hoy={hoy}
          semanaEsActual={semanaOffset === 0}
          onClickCelda={alClickCelda}
          scrollRef={grillaScrollRef}
          onMouseDown={iniciarArrastre}
          onMouseMove={moverArrastre}
          onMouseUp={terminarArrastre}
          onMouseLeave={terminarArrastre}
          onClickCapture={bloquearClickSiArrastro}
        />
      ) : (
        <AgendaDiaMobile
          diasGrilla={diasGrilla}
          filasGrilla={filasGrilla}
          reservasSemana={agenda.data}
          turnosFijos={turnosFijos.turnosFijos}
          excepciones={turnosFijos.excepciones}
          aperturaMinPorDia={aperturaMinPorDia}
          aperturaMinDefault={rangoGrilla.aperturaMin}
          hoy={hoy}
          semanaEsActual={semanaOffset === 0}
          diaSeleccionado={diaSeleccionado}
          onSeleccionarDia={setDiaSeleccionado}
          onClickCelda={alClickCelda}
        />
      )}

    </section>
      {/* The glass backdrop creates a containing block for fixed children. */}
      <AnimatePresence>
        {detalleSheet && (
          <AgendaDetalleSheet
            celda={detalleSheet}
            procesando={procesandoAccion}
            onCancelarReserva={confirmarCancelarReserva}
            onCancelarOcurrencia={confirmarCancelarOcurrencia}
            onClose={() => setDetalleSheet(null)}
            mostrarToast={mostrarToast}
          />
        )}
      </AnimatePresence>
    </>
  );
}
