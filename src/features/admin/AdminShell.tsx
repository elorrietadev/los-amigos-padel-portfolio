// AdminShell — R2: reconstruido sobre AppShell (Sidebar flotante en
// notebook/desktop, BottomNav+MoreMenu en mobile) en vez del viejo layout
// bottom-nav/sidebar-por-hover. Sigue siendo el dueño de la infraestructura
// transversal: Realtime, aviso sonoro/banner, toast, materialización de
// turnos fijos jugados — nada de eso cambió.
//
// R2 agrega DOS instancias compartidas nuevas, mismo criterio que
// useTurnosFijos (C3): Caja pasa a ser destino propio pero necesita la MISMA
// data de "jugadas" que Reservas (para que pagar en Reservas se refleje en
// Caja al instante, sin refetch); Vender/Productos/Historial pasan a ser
// destinos propios pero necesitan el MISMO catálogo (useProductos) que antes
// compartían como sub-tabs de una sola ProductosView.
//
// Vistas "siempre montadas" (patrón B8, con `hidden`): Agenda, Reservas,
// Vender, Productos, Historial — las 5 que tienen estado propio que vale la
// pena proteger (filtros, semana visible, y sobre todo el carrito de Vender,
// que antes sobrevivía a Catálogo<->Vender por vivir las dos como sub-tabs de
// la misma ProductosView; ahora que son destinos de nav independientes,
// necesitan el mismo tratamiento para no perder esa garantía).
// Vistas montadas condicionalmente (como los placeholders de siempre):
// Fijos, Bloqueos, Caja, Reportes, Backup — sin estado que proteger.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgendaView } from "./agenda/AgendaView";
import { reproducirAviso } from "./audio";
import { BackupView } from "./backup/BackupView";
import { ConfiguracionContainer } from "./configuracion/ConfiguracionContainer";
import { BloqueosView } from "./bloqueos/BloqueosView";
import { CajaView } from "./caja/CajaView";
import { AppShell } from "./components/AppShell";
import { Toast, type ToastData } from "./components/Toast";
import { IconArrowUp } from "./icons";
import { NotificacionesCampana, type DestinoNotificacion } from "./notificaciones/NotificacionesCampana";
import { TITULOS_VISTA, type Vista } from "./nav.config";
import { useProductos } from "./productos/useProductos";
import { ProductosView } from "./productos/ProductosView";
import { HistorialView } from "./historial/HistorialView";
import { ReportesView } from "./reportes/ReportesView";
import { materializarTurnosFijosJugados } from "./reservas/reservas.api";
import { obtenerRangoSemana } from "./reservas/reservas.logic";
import { ReservasView } from "./reservas/ReservasView";
import type { ReservaRow } from "./reservas/reservas.types";
import { useReservasJugadas } from "./reservas/useReservasJugadas";
import { useReservasSinPagoHistoricas } from "./reservas/useReservasSinPagoHistoricas";
import { useReservasProximas } from "./reservas/useReservasProximas";
import { useReservasRealtime } from "./reservas/useReservasRealtime";
import { TurnosFijosView } from "./turnos-fijos/TurnosFijosView";
import { useTurnosFijos } from "./turnos-fijos/useTurnosFijos";
import { VenderView } from "./ventas/VenderView";

const COLAPSADA_STORAGE_KEY = "lap-sidebar-colapsada";

function leerColapsadaInicial(): boolean {
  try {
    return window.localStorage.getItem(COLAPSADA_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// P5 — backstop de "si hay remount, restaurarla": el fix real (useAdminAuth.ts)
// evita que un TOKEN_REFRESHED de rutina desmonte AdminShell, pero esto cubre
// cualquier OTRO remount real (F5, cierre/reapertura de la pestaña dentro de
// la misma sesión de navegador) sin depender de esa causa puntual.
// `sessionStorage`, no `localStorage`: vive solo mientras dura la pestaña —
// no tiene sentido que una pestaña nueva (u otro admin en el mismo navegador)
// arranque en una sección ajena, a diferencia de la preferencia de sidebar
// colapsada/expandida, que sí es genuinamente "de siempre". Se prefiere sobre
// la URL: este panel no tiene routing (nav.config.ts decide todo por estado
// de React, sin history/hash) y agregarlo sería un rediseño de navegación
// completo para resolver un bug de persistencia — sessionStorage alcanza.
const VISTA_STORAGE_KEY = "lap-vista-activa";
const VISTAS_VALIDAS = new Set<string>(Object.keys(TITULOS_VISTA));

function leerVistaInicial(): Vista {
  try {
    const guardada = window.sessionStorage.getItem(VISTA_STORAGE_KEY);
    if (guardada && VISTAS_VALIDAS.has(guardada)) return guardada as Vista;
  } catch {
    // sessionStorage inaccesible — arranca en "reservas", mismo default de siempre.
  }
  return "reservas";
}

// Sección 10 del pedido — único subtítulo dinámico real (el ejemplo explícito
// era justo este); el resto de las vistas se queda solo con el título, sin
// inventar breadcrumbs/subtítulos que no aportan.
function subtituloAgendaHoy(): string {
  const texto = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(),
  );
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export interface AdminShellProps {
  onLogout: () => void;
}

export function AdminShell({ onLogout }: AdminShellProps) {
  const [vista, setVista] = useState<Vista>(leerVistaInicial);
  const [colapsada, setColapsada] = useState<boolean>(leerColapsadaInicial);
  const [toast, setToast] = useState<ToastData | null>(null);
  // admin.html:422 (avisoNuevo) — token del aviso actualmente visible (no
  // boolean): cada evento nuevo pisa el token y reinicia el auto-ocultado de
  // 6s, incluso si ya había un aviso visible (dos reservas seguidas extienden
  // la ventana en vez de cortarla a los 6s del primer evento).
  const [avisoNuevo, setAvisoNuevo] = useState<number | null>(null);
  // admin.html:799-820 — señal empujada hacia ReservasView/CajaView (dueñas
  // reales de los datos de Próximos/Jugados/Caja). `token` cambia en cada
  // evento para que distingan un evento nuevo de la señal heredada de su
  // propio montaje. Se queda `null` mientras no llegó ningún INSERT.
  const [nuevaReservaSignal, setNuevaReservaSignal] = useState<{ fecha: string; token: number } | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLAPSADA_STORAGE_KEY, colapsada ? "1" : "0");
    } catch {
      // localStorage inaccesible — la preferencia solo dura la sesión.
    }
  }, [colapsada]);

  // P5 — persiste la sección activa para sobrevivir a un remount real (ver
  // leerVistaInicial arriba). Cambiar de destino de nav es la única forma de
  // que esto corra: no hay debounce ni guard porque no hay volumen de writes
  // que justifique uno (un click de sidebar, un write).
  useEffect(() => {
    try {
      window.sessionStorage.setItem(VISTA_STORAGE_KEY, vista);
    } catch {
      // sessionStorage inaccesible — la sección no persiste, sin romper nada.
    }
  }, [vista]);

  // P5 — logout real: limpia la sección guardada para que un login siguiente
  // en la MISMA pestaña (mismo admin u otro) no aparezca en una sección
  // ajena a lo que acaba de pasar — arranca en el default de siempre.
  function manejarLogout() {
    try {
      window.sessionStorage.removeItem(VISTA_STORAGE_KEY);
    } catch {
      // sessionStorage inaccesible — nada que limpiar.
    }
    onLogout();
  }

  // C3 — instancia ÚNICA de useTurnosFijos, compartida por props (sin Context/
  // provider) con AgendaView, ReservasView y TurnosFijosView.
  const turnosFijos = useTurnosFijos();

  // R2 — instancia ÚNICA de useReservasJugadas, compartida por props (mismo
  // criterio que turnosFijos) con ReservasView y CajaView. Antes vivía dentro
  // de ReservasView; se levanta acá porque Caja ahora es un destino de
  // navegación propio y necesita la MISMA data (con el mismo patch local tras
  // un pago) para que "pagar en Reservas" se refleje en Caja sin refetch.
  const jugadasSemana = useReservasJugadas();
  // Notificaciones — turnos de semanas anteriores (ventana finita), para que un
  // turno sin cobrar no desaparezca de la campana al cambiar de semana. Los
  // pagos/cancelaciones que ReservasView aplica con jugadas.actualizarLocal se
  // encadenan acá para que ambos orígenes queden coherentes.
  const historicas = useReservasSinPagoHistoricas();
  const actualizarJugadasLocal = jugadasSemana.actualizarLocal;
  const actualizarHistoricasLocal = historicas.actualizarLocal;
  const actualizarLocal = useCallback(
    (actualizador: Parameters<typeof actualizarJugadasLocal>[0]) => {
      actualizarJugadasLocal(actualizador);
      actualizarHistoricasLocal(actualizador);
    },
    [actualizarJugadasLocal, actualizarHistoricasLocal],
  );
  const jugadas = { ...jugadasSemana, actualizarLocal };
  // Semana actual (y lo expandido a mano) + historicas, sin duplicar por id: la
  // versión de `jugadasSemana` gana porque es la más fresca.
  const jugadasParaAvisos = useMemo(() => {
    if (historicas.data.length === 0) return jugadasSemana.data;
    const porId = new Map(historicas.data.map((r) => [r.id, r]));
    for (const r of jugadasSemana.data) porId.set(r.id, r);
    return [...porId.values()];
  }, [jugadasSemana.data, historicas.data]);
  // Notificaciones — instancia ÚNICA de useReservasProximas, mismo criterio que
  // jugadas: ReservasView la consume por props y la campana deriva de ella las
  // reservas pendientes, sin una segunda query.
  const proximas = useReservasProximas();
  // "Activa" para jugadas = Reservas o Caja a la vista (las dos consumidoras),
  // no solo Reservas como antes de R2 — mismo criterio de B8, generalizado.
  const jugadasActivo = vista === "reservas" || vista === "caja";

  useEffect(() => {
    if (jugadas.error) mostrarToast("No se pudo cargar la semana actual. Probá de nuevo.", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jugadas.error]);

  useEffect(() => {
    if (jugadas.errorAnterior) mostrarToast("No se pudo cargar la semana anterior. Probá de nuevo.", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jugadas.errorAnterior]);

  // Mismo mecanismo que ReservasView tenía antes de R2 (refresco silencioso
  // cada 5min + al volver a la pestaña), ahora acá porque `jugadas` vive acá.
  useEffect(() => {
    if (!jugadasActivo) return;
    function refrescoSilencioso() {
      jugadas.recargar({ silencioso: true });
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
  }, [jugadas.recargar, jugadasActivo]);

  const jugadasSignalVistoRef = useRef(nuevaReservaSignal?.token ?? null);
  const jugadasMaterializacionVistoRef = useRef(0);
  const jugadasPrevActivoRef = useRef(jugadasActivo);
  useEffect(() => {
    if (jugadasActivo && !jugadasPrevActivoRef.current) {
      jugadasSignalVistoRef.current = nuevaReservaSignal?.token ?? null;
      jugadas.recargar({ silencioso: true });
    }
    jugadasPrevActivoRef.current = jugadasActivo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jugadasActivo]);

  // Notificaciones — estas dos reacciones (reserva nueva de esta semana y
  // materialización de turnos fijos jugados) corren AUNQUE Reservas/Caja no
  // estén a la vista: la campana cuenta turnos jugados sin pago desde cualquier
  // sección y necesita que jugadas no quede vieja. Son eventos raros (un INSERT
  // o una vez por sesión), no polling.
  useEffect(() => {
    if (!nuevaReservaSignal || jugadasSignalVistoRef.current === nuevaReservaSignal.token) return;
    jugadasSignalVistoRef.current = nuevaReservaSignal.token;
    const { inicio, fin } = obtenerRangoSemana(Date.now());
    if (nuevaReservaSignal.fecha >= inicio && nuevaReservaSignal.fecha <= fin) {
      jugadas.recargar({ silencioso: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevaReservaSignal]);

  // Notificaciones — con Reservas a la vista, ReservasView recarga sola las
  // próximas ante una reserva nueva; con otra sección activa lo hace acá, para
  // que la campana muestre la pendiente recién llegada. El ref se actualiza
  // siempre para no recargar dos veces el mismo evento al cambiar de sección.
  const reservasActiva = vista === "reservas";
  const proximasSignalVistoRef = useRef(nuevaReservaSignal?.token ?? null);
  useEffect(() => {
    if (!nuevaReservaSignal || proximasSignalVistoRef.current === nuevaReservaSignal.token) return;
    proximasSignalVistoRef.current = nuevaReservaSignal.token;
    if (!reservasActiva) proximas.recargar({ silencioso: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevaReservaSignal, reservasActiva]);

  // R2 — instancia ÚNICA de useProductos, compartida por props con
  // VenderView/ProductosView/HistorialView (antes vivía dentro de
  // ProductosView y las otras dos eran sus sub-tabs). Única instancia: una
  // reposición hecha en Productos se ve al instante en Vender y viceversa.
  const productos = useProductos();
  useEffect(() => {
    if (productos.error) mostrarToast("No se pudieron cargar los productos. Probá de nuevo.", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos.error]);

  // admin.html:489-493 — mismo auto-dismiss (4000ms), toast único sin cola.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // Identidad estable entre renders (setToast ya es estable) para que las
  // vistas hijas puedan omitirla de sus deps sin capturar un closure viejo.
  const mostrarToast = useCallback((mensaje: string, tipo: ToastData["tipo"] = "ok") => {
    setToast({ texto: mensaje, tipo });
  }, []);

  // C6 — admin.html:610-613 (materializarTurnosFijosJugados). Corre UNA sola
  // vez por sesión, al montar. Si falla, solo se loguea.
  const [materializacionSignal, setMaterializacionSignal] = useState(0);
  useEffect(() => {
    let cancelado = false;
    materializarTurnosFijosJugados().then(({ data, error }) => {
      if (cancelado) return;
      if (error) {
        console.warn("AdminShell: no se pudo materializar turnos fijos jugados", error);
        return;
      }
      if (!data) return;
      mostrarToast(
        `Se registraron ${data} turno${data === 1 ? "" : "s"} fijo${data === 1 ? "" : "s"} jugado${data === 1 ? "" : "s"}, revisá ${data === 1 ? "su pago" : "sus pagos"} en Jugados.`,
        "ok",
      );
      setMaterializacionSignal((prev) => prev + 1);
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // R2 — jugadas también reacciona a materializacionSignal (antes lo hacía
  // dentro de ReservasView).
  useEffect(() => {
    if (jugadasMaterializacionVistoRef.current === materializacionSignal) return;
    jugadasMaterializacionVistoRef.current = materializacionSignal;
    jugadas.recargar({ silencioso: true });
    // La materialización puede haber registrado turnos jugados en semanas anteriores.
    void historicas.recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materializacionSignal]);

  // admin.html:792-816 (aviso sonoro + banner ante un INSERT nuevo).
  const onNuevaReserva = useCallback((reserva: ReservaRow) => {
    reproducirAviso();
    const token = ++tokenRef.current;
    setAvisoNuevo(token);
    setNuevaReservaSignal({ fecha: reserva.fecha, token });
  }, []);

  useReservasRealtime(onNuevaReserva);

  // admin.html:2193-2196 — mismo auto-ocultado (6000ms).
  useEffect(() => {
    if (avisoNuevo === null) return;
    const id = setTimeout(() => setAvisoNuevo(null), 6000);
    return () => clearTimeout(id);
  }, [avisoNuevo]);

  function ocultarAvisoYVerReservas() {
    setVista("reservas");
    setAvisoNuevo(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const subtitulo = vista === "grilla" ? subtituloAgendaHoy() : undefined;

  // Notificaciones — los CTA de la campana navegan a la sección y, para
  // Reservas, piden la pestaña puntual (ver prop `enfoque` de ReservasView).
  const [enfoqueReservas, setEnfoqueReservas] = useState<{ token: number; tab: "pendientes" | "jugadas" } | null>(null);
  const enfoqueTokenRef = useRef(0);
  const navegarDesdeNotificacion = useCallback((destino: DestinoNotificacion) => {
    if (destino.vista === "reservas") {
      setEnfoqueReservas({ token: ++enfoqueTokenRef.current, tab: destino.tab });
    }
    setVista(destino.vista);
  }, []);

  return (
    <>
      <AppShell
        vista={vista}
        onSeleccionar={setVista}
        colapsada={colapsada}
        onToggleColapsada={() => setColapsada((v) => !v)}
        onLogout={manejarLogout}
        titulo={TITULOS_VISTA[vista]}
        subtitulo={subtitulo}
        acciones={
          <NotificacionesCampana
            jugadas={jugadasParaAvisos}
            proximas={proximas.data}
            productos={productos.productos}
            onNavegar={navegarDesdeNotificacion}
          />
        }
      >
        {avisoNuevo !== null && (
          <button
            type="button"
            onClick={ocultarAvisoYVerReservas}
            className="tap-fx anim-fadein sticky top-0 z-20 mb-3.5 w-full rounded-md bg-accent px-4 py-2.5 text-center text-[13px] font-bold text-on-accent"
          >
            🔔 Llegó un turno nuevo para confirmar — tocá para verlo
          </button>
        )}

        {/* B8 — Agenda/Reservas/Vender/Productos/Historial quedan siempre
            montadas (con `hidden`) para preservar su estado entre cambios de
            destino — ver comentario de cabecera. */}
        <div hidden={vista !== "grilla"}>
          <AgendaView
            mostrarToast={mostrarToast}
            nuevaReservaSignal={nuevaReservaSignal}
            activo={vista === "grilla"}
            turnosFijos={turnosFijos}
            materializacionSignal={materializacionSignal}
          />
        </div>
        <div hidden={vista !== "reservas"}>
          <ReservasView
            mostrarToast={mostrarToast}
            jugadas={jugadas}
            proximas={proximas}
            enfoque={enfoqueReservas}
            nuevaReservaSignal={nuevaReservaSignal}
            activo={vista === "reservas"}
            turnosFijos={turnosFijos}
            materializacionSignal={materializacionSignal}
          />
        </div>
        <div hidden={vista !== "vender"}>
          <VenderView mostrarToast={mostrarToast} productos={productos} />
        </div>
        <div hidden={vista !== "productos"}>
          <ProductosView mostrarToast={mostrarToast} productos={productos} />
        </div>
        <div hidden={vista !== "historial"}>
          <HistorialView mostrarToast={mostrarToast} productos={productos} />
        </div>

        {vista !== "grilla" &&
          vista !== "reservas" &&
          vista !== "vender" &&
          vista !== "productos" &&
          vista !== "historial" && (
            <div key={vista} className="tab-enter">
              {vista === "fijos" && <TurnosFijosView mostrarToast={mostrarToast} turnosFijos={turnosFijos} />}
              {vista === "bloquear" && <BloqueosView mostrarToast={mostrarToast} />}
              {vista === "caja" && <CajaView mostrarToast={mostrarToast} jugadas={jugadas} />}
              {vista === "reportes" && <ReportesView mostrarToast={mostrarToast} />}
              {vista === "backup" && <BackupView mostrarToast={mostrarToast} />}
              {vista === "configuracion" && <ConfiguracionContainer />}
            </div>
          )}

        {/* Botón "volver arriba" — mismo umbral/criterio que antes (scrollY >
            400 sobre window, ya que el contenido no tiene su propio scroll
            interno). */}
        <BotonVolverArriba />
      </AppShell>

      <Toast toast={toast} />
    </>
  );
}

// Extraído como su propio componente chico solo para no ensuciar AdminShell
// con un listener de scroll que no tiene nada que ver con navegación/datos.
function BotonVolverArriba() {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    function onScroll() {
      setMostrar(window.scrollY > 400);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!mostrar) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Volver arriba"
      className="tap-fx hover-lift anim-fadein fixed right-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[41] flex h-11 w-11 items-center justify-center rounded-full bg-accent shadow-[0_6px_18px_rgba(215,242,109,0.35)] lg:bottom-6"
    >
      <IconArrowUp size={20} className="text-on-accent" />
    </button>
  );
}
