import { ocupaCancha } from "./reservas.logic";
import "./reservas.css";
import { invalidarEconomia } from "../economiaEvents";
// ReservasView — UI real de Reservas: "Necesitan confirmación" + Próximos
// (B4.2) + Jugados con orden y "cargar semana anterior" (B4.3) + pagos (B4.4)
// + filtros/búsqueda/KPIs (B4.5) + integrada en AdminShell (B4.6), que le pasa
// `mostrarToast` por props en vez de un contexto.
//
// R5 — rediseño puramente visual/estructural, sin tocar ninguna función de
// datos/mutación de abajo: "Necesitan confirmación" pasa de banner siempre
// visible a ser su propio tab ("Pendientes"), junto a Próximas/Jugadas
// (antes un subtab de 2). Los botones de acción (Confirmar/Cancelar/
// WhatsApp/Pago) se mueven de cada fila de la lista a un panel de detalle a
// la derecha (desktop, reutilizando el mismo lenguaje visual del drawer de
// Agenda — AgendaDetalleSheet.tsx) o a un bottom sheet (mobile) — la lista en
// sí queda más densa e informativa, sin acciones inline. Ver
// DetalleReservaContenido más abajo.
//
// El modal de pago vive en PaymentModal.tsx y reutiliza PaymentSegmented.
// Se abre desde el panel de detalle; las mutaciones se conservan aquí.
// El modal de cancelar reserva sigue usando el ConfirmModal genérico.

import { DrawerSurface } from "../components/DrawerSurface";
import { useDialogFocus } from "../components/useDialogFocus";
import { DatePicker } from "../../../components/ui/DatePicker";
import { motion, AnimatePresence, useIsPresent, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MENSAJE_CLAVE_REUTILIZADA, esErrorClaveReutilizada, useClaveIdempotencia } from "../../../lib/idempotencia";
import { Check, ClipboardList, Repeat, Search, Wallet, X } from "lucide-react";
import { Badge, type BadgeVariant } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { IconButton } from "../../../components/ui/IconButton";
import { Input } from "../../../components/ui/Input";
import { ConfirmModal } from "../components/ConfirmModal";
import { useNombreCancha } from "../configuracion/useNombreCancha";
import { hoyISO, horaToMinutos } from "../../../lib/datetime";
import { IconWhatsapp } from "../icons";
import { useEsDesktop } from "../agenda/useEsDesktop";
import { useFranjaOperativa } from "../../reservations-public/useFranjaOperativa";
import { TURNOS_FIJOS_VACIO, type UseTurnosFijosResult } from "../turnos-fijos/useTurnosFijos";
import { formatearMoneda } from "../../../lib/format";
import { DevolucionModal, type DatosDevolucion } from "../devoluciones/DevolucionModal";
import { registrarDevolucion } from "../devoluciones/devoluciones.api";
import { esErrorDevolucionExcedeDisponible } from "../devoluciones/devoluciones.logic";
import {
  calcularTotalesReserva,
  estadoPagoTurno,
  itemsConVentaId,
  type EstadoPagoTurno,
  type ItemVentaConVentaId,
} from "../ventas/ventas.logic";
import { useVentasDeReserva, type UseVentasDeReservaResult } from "../ventas/useVentasDeReserva";
import { PaymentModal } from "./PaymentModal";
import { cancelarReserva, confirmarReserva } from "./reservas.api";
import type { ResultadoMovimientoPago } from "./pagos.logic";
import {
  aplicarPago,
  calcularHorasSemana,
  calcularOcupacionHoy,
  calcularPendientesUrgentes,
  construirLinkWhatsapp,
  construirListaJugadas,
  construirListaProximas,
  fechaFueraDeRangoCargado,
  formatearBadgeFecha,
  marcarConfirmada,
  mensajeErrorReserva,
  obtenerRangoSemana,
  ocurrenciasFijasVirtuales,
  quitarPorId,
  textoPago,
} from "./reservas.logic";
import type {
  FiltroRapido,
  FiltrosReservas,
  ItemListaProximas,
  OrdenJugadas,
  ReservaProcesada,
  ReservaVirtual,
} from "./reservas.types";
import { useReservasBusqueda } from "./useReservasBusqueda";
import type { UseReservasJugadasResult } from "./useReservasJugadas";
import type { UseReservasProximasResult } from "./useReservasProximas";

// admin.html:1099-1124/1128 — mismo horizonte que ocurrenciasFijasVirtuales
// (90 días) para el toggle "Mostrar turnos fijos" de Próximos. Distinto del
// horizonte de 14 días de TurnosFijosView (PRÓXIMAS OCURRENCIAS), que es una
// función independiente a propósito (ver comentario en reservas.logic.ts).
const HORIZONTE_VIRTUALES_DIAS = 90;

type VistaReservas = "pendientes" | "proximas" | "jugadas";

const TABS: ReadonlyArray<{ key: VistaReservas; label: string }> = [
  { key: "pendientes", label: "Pendientes" },
  { key: "proximas", label: "Próximas" },
  { key: "jugadas", label: "Jugadas" },
];
const SPRING_TAB = { type: "spring", stiffness: 500, damping: 34, mass: 0.7 } as const;
const SPRING_SHEET = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 } as const;

// admin.html:2341-2344 — mismo orden y labels.
const FILTROS_RAPIDOS: ReadonlyArray<{ key: NonNullable<FiltroRapido>; label: string }> = [
  { key: "hoy", label: "Hoy" },
  { key: "manana", label: "Mañana" },
  { key: "semana", label: "Esta semana" },
  { key: "pendientes", label: "Solo pendientes" },
];

// R5.1 — las pills de filtros rápidos y orden de Jugadas comparten estados
// (activo/inactivo) pero el inactivo no tenía hover ni foco visibles.
// Centralizado acá en vez de repetir la misma condición 3 veces.
function pillClass(activo: boolean): string {
  return `tap-fx ui-transition rounded-pill border px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
    activo
      ? "border-success bg-success/15 text-success"
      : "border-border text-muted hover:border-border-strong hover:text-text"
  }`;
}

export interface ReservasViewProps {
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
  // R2 — instancia ÚNICA de useReservasJugadas, levantada a AdminShell y
  // compartida por props con CajaView (mismo criterio que turnosFijos, C3):
  // Caja pasó a ser un destino de navegación propio, pero sigue leyendo la
  // MISMA semana jugada (con el mismo patch local tras un pago) que esta
  // vista — así pagar acá se refleja en Caja al instante, sin refetch. Ver
  // AdminShell.tsx y CajaView.tsx.
  jugadas: UseReservasJugadasResult;
  // Notificaciones — instancia ÚNICA de useReservasProximas, levantada a
  // AdminShell (mismo criterio que `jugadas`): la campana deriva las pendientes
  // del MISMO estado, sin una segunda query.
  proximas: UseReservasProximasResult;
  // Notificaciones — un CTA de la campana pide abrir una pestaña puntual.
  // `token` distingue un pedido nuevo del heredado del montaje; además limpia
  // los filtros para que la lista no quede vacía por uno viejo.
  enfoque?: { token: number; tab: VistaReservas } | null;
  // admin.html:799-820 — señal de "llegó una reserva nueva" empujada desde
  // AdminShell, dueño real del canal Realtime (vive mientras haya sesión, no
  // solo mientras esta vista está montada — ver useReservasRealtime.ts).
  // `token` cambia en cada evento para poder distinguir uno real de un valor
  // heredado del propio montaje. `null`/ausente = sin evento nuevo todavía.
  nuevaReservaSignal?: { fecha: string; token: number } | null;
  // B8 — AdminShell mantiene esta vista siempre montada (con `hidden`) en vez
  // de desmontarla al cambiar de tab, así que ella misma decide qué hacer
  // según esté visible o no. Default `true` para no romper los tests/usos
  // existentes que no la pasan (equivalen a "siempre activa", el comportamiento
  // previo a B8). Ver AdminShell.tsx.
  activo?: boolean;
  // C3 — instancia única de useTurnosFijos que crea AdminShell y comparte por
  // props con AgendaView/TurnosFijosView (sin Context/provider) — ver
  // useTurnosFijos.ts. Opcional con default vacío (TURNOS_FIJOS_VACIO): a
  // diferencia de Agenda, turnos fijos acá solo alimenta el toggle "Mostrar
  // turnos fijos" de Próximos, no es la función principal de esta vista — así
  // no rompe los tests/usos existentes que no la pasan.
  turnosFijos?: UseTurnosFijosResult;
  // C6 — token numérico dedicado a materializar_turnos_fijos_jugados
  // (AdminShell, una vez por sesión) — ver comentario de cabecera de
  // AdminShell.tsx sobre por qué no reusa nuevaReservaSignal. Default 0 para
  // no romper tests/usos existentes que no lo pasan (equivale a "sin
  // materialización todavía").
  materializacionSignal?: number;
}

interface CancelarModalState {
  turnoFijoId: string | null;
  id: string;
  nombre: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

// Identidad estable de un item de la lista combinada (reserva real o
// ocurrencia virtual de turno fijo) — puramente de presentación, para saber
// qué fila está seleccionada sin depender de un id real que las virtuales no
// tienen. No es lógica de negocio: ordenarProximas/pasaFiltros (B6) no la usan.
function claveItem(item: ItemListaProximas): string {
  return "virtual" in item ? `v-${item.turnoFijoId}-${item.fecha}` : item.id;
}

export function ReservasView({
  mostrarToast,
  jugadas,
  proximas,
  enfoque = null,
  nuevaReservaSignal = null,
  activo = true,
  turnosFijos = TURNOS_FIJOS_VACIO,
  materializacionSignal = 0,
}: ReservasViewProps) {
  const esDesktop = useEsDesktop(1200);
  // CFG-F2 — apertura REAL de hoy (horarios_semana/franja_operativa vigente,
  // nunca configCancha) para clasificar ocurrencias virtuales de turno fijo
  // como pasadas o no (construirListaProximas) — las reservas reales usan su
  // propia hora_apertura_vigente, ver reservas.logic.ts. `null` mientras
  // carga, si falló, o si hoy está cerrado: en cualquiera de esos casos no
  // hay corrimiento de día que aplicar, nunca un fallback a 08:00.
  const { franja: franjaHoy } = useFranjaOperativa(hoyISO());
  const aperturaHoyMin =
    franjaHoy && !franjaHoy.cerrado && franjaHoy.horaApertura ? horaToMinutos(franjaHoy.horaApertura) : null;
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [cancelarModal, setCancelarModal] = useState<CancelarModalState | null>(null);
  const [procesandoCancelar, setProcesandoCancelar] = useState(false);
  // R5 — 3 tabs reales en vez de "Próximos/Jugados" + banner de pendientes
  // siempre visible; mismo default ("proximas") que el legacy tenía para su
  // subtab por defecto.
  const [vistaReservas, setVistaReservas] = useState<VistaReservas>("proximas");
  // R5 — item seleccionado para el panel/sheet de detalle. Se guarda solo la
  // clave (no el objeto) para no quedar con una referencia vieja tras un
  // patch local (confirmar/pagar) — se vuelve a resolver contra la lista
  // vigente en cada render (ver `itemSeleccionado` más abajo).
  const [seleccionClave, setSeleccionClave] = useState<string | null>(null);
  const [animarCierre, setAnimarCierre] = useState(false);
  const [ordenJugados, setOrdenJugados] = useState<OrdenJugadas>("recientes");
  const [pagoReserva, setPagoReserva] = useState<ReservaProcesada | null>(null);
  // admin.html:396-398 — mismos defaults ("", "", null).
  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>(null);
  // admin.html:402 — mismo default (20).
  const [limiteVisible, setLimiteVisible] = useState(20);
  // admin.html:406 (mostrarTurnosFijos) — mismo default (false).
  const [mostrarFijos, setMostrarFijos] = useState(false);

  // admin.html:701 — se resetea a 20 cada vez que cambia el tab o cualquier
  // filtro, nunca por una mutación (confirmar/cancelar/pagar).
  useEffect(() => {
    setLimiteVisible(20);
  }, [vistaReservas, filtroRapido, filtroFecha, filtroNombre]);

  // R5 — cambiar de tab deselecciona: la lista de abajo es otra, no tiene
  // sentido dejar un detalle de "Pendientes" a la vista mientras se mira
  // "Jugadas". Un cambio de filtro NO deselecciona (si el item ya
  // seleccionado sigue pasando el filtro, sigue viéndose su detalle).
  useEffect(() => {
    setSeleccionClave(null);
  }, [vistaReservas]);

  // admin.html:732 (busquedaActiva) — nombre con 3+ caracteres, o una fecha
  // pasada que useReservasJugadas todavía no tiene cargada en memoria.
  const busquedaActiva =
    filtroNombre.trim().length >= 3 || fechaFueraDeRangoCargado(filtroFecha, jugadas.semanaMasAntiguaJugados, hoyISO());
  const busqueda = useReservasBusqueda(filtroNombre, filtroFecha, busquedaActiva);

  const enfoqueVistoRef = useRef(enfoque?.token ?? null);
  useEffect(() => {
    if (!enfoque || enfoqueVistoRef.current === enfoque.token) return;
    enfoqueVistoRef.current = enfoque.token;
    setVistaReservas(enfoque.tab);
    setFiltroFecha("");
    setFiltroNombre("");
    setFiltroRapido(null);
  }, [enfoque]);

  // Dependencia solo en `error` (no en `mostrarToast`): los hooks resetean
  // error a false antes de cada carga, así que el patrón true→false→true ya
  // alcanza para permitir un toast por cada fallo nuevo. Si se agregara
  // `mostrarToast` acá, un padre que la pase como función inline dispararía un
  // toast repetido en cada re-render mientras error siga en true.
  useEffect(() => {
    if (proximas.error) mostrarToast("No se pudieron cargar las reservas próximas. Probá de nuevo.", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proximas.error]);

  // R2 — el toast de jugadas.error/errorAnterior se movió a AdminShell (dueño
  // único de la instancia compartida con CajaView): si se quedara acá
  // duplicaría el aviso cuando Caja también está montada. Ver AdminShell.tsx.

  useEffect(() => {
    if (busqueda.error) mostrarToast("No se pudo buscar. Probá de nuevo.", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda.error]);

  // admin.html:703-721 — refresco silencioso (sin spinner) de Próximos cada 5
  // min de respaldo y al volver a la pestaña del navegador. B8 — AdminShell
  // mantiene esta vista siempre montada (con `hidden`) en vez de
  // desmontarla/remontarla al cambiar de tab, así que el gate ya no es el
  // ciclo de vida del componente sino la prop `activo`: mientras está oculta
  // no pollea (el refresco inmediato al reactivarse, más abajo, la pone al
  // día). Deps reales (no []): `proximas.recargar` es estable (useCallback([])
  // dentro del hook), así que este efecto nunca se reinstala por ella en la
  // práctica — pero declararla es más correcto que asumirlo desde acá.
  //
  // R2 — el refresco de `jugadas` (antes también acá) se movió a AdminShell,
  // ahora dueño único de esa instancia (compartida con CajaView) — ver
  // comentario de cabecera de AdminShell.tsx.
  useEffect(() => {
    if (!activo) return;
    function refrescoSilencioso() {
      proximas.recargar({ silencioso: true });
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
  }, [proximas.recargar, activo]);

  // admin.html:799-820 — reacciona a la señal de Realtime que empuja
  // AdminShell. `signalVistoRef` arranca con el token que ya traía la señal
  // al montar (o null) para no disparar un refresco duplicado: si esta vista
  // se está montando recién ahora, el `cargar()` inicial de cada hook ya trae
  // datos frescos por su cuenta.
  const signalVistoRef = useRef(nuevaReservaSignal?.token ?? null);
  // C6 — mismo patrón que signalVistoRef, para el signal dedicado de
  // materializar_turnos_fijos_jugados (ver ReservasViewProps de arriba).
  const materializacionVistoRef = useRef(materializacionSignal);
  // B8 — al reactivarse (false→true) esta vista no necesita reaccionar a
  // señales viejas acumuladas mientras estuvo oculta: alcanza con un refresco
  // inmediato desde el servidor. Se declara ANTES de los efectos de señal de
  // abajo para que, en el mismo commit, los tokens queden marcados como
  // "vistos" antes de que esos efectos los evalúen — así no se duplica el
  // refresco (mismo criterio para nuevaReservaSignal y materializacionSignal).
  const prevActivoRef = useRef(activo);
  useEffect(() => {
    if (activo && !prevActivoRef.current) {
      signalVistoRef.current = nuevaReservaSignal?.token ?? null;
      materializacionVistoRef.current = materializacionSignal;
      proximas.recargar({ silencioso: true });
    }
    prevActivoRef.current = activo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  useEffect(() => {
    if (!activo) return;
    if (!nuevaReservaSignal || signalVistoRef.current === nuevaReservaSignal.token) return;
    signalVistoRef.current = nuevaReservaSignal.token;
    proximas.recargar({ silencioso: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevaReservaSignal, activo]);

  // C6 — reacciona al signal dedicado de materializar_turnos_fijos_jugados.
  // A diferencia de nuevaReservaSignal, no filtra por fecha: un batch de
  // materialización puede tocar varias fechas/semanas a la vez, y es un
  // evento raro (una vez por sesión) — no vale la pena acotarlo, se refresca
  // directo ante cualquier cambio de token.
  useEffect(() => {
    if (!activo) return;
    if (materializacionVistoRef.current === materializacionSignal) return;
    materializacionVistoRef.current = materializacionSignal;
    proximas.recargar({ silencioso: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materializacionSignal, activo]);

  // B8 — al ocultar la vista (tab cambia a otra), cierra los modales
  // transitorios si no hay una mutación en curso; si la hay, se deja terminar
  // su propio flujo (confirmarCancelacion/confirmarPago ya cierran su modal al
  // resolver).
  useEffect(() => {
    if (!activo) {
      if (!procesandoCancelar) setCancelarModal(null);
      setPagoReserva(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  const ahora = Date.now();
  // admin.html:1075-1083 (pasaFiltros) — mismo objeto para ambas listas, sin
  // condición especial: "Solo pendientes" también filtra Jugados si está
  // activo ahí, igual que el legacy (no hay guarda por subtab).
  const filtros: FiltrosReservas = { filtroFecha, filtroNombre, filtroRapido };
  // admin.html:1126-1127 (fuenteProximas/fuenteJugadas) — mientras hay
  // búsqueda activa, la fuente de ambas listas pasa a ser resultadosBusqueda;
  // los filtros locales (pasaFiltros, ya en construirListaProximas/Jugadas) se
  // siguen aplicando igual encima, sin duplicarlos acá.
  const fuenteProximas = busquedaActiva ? (busqueda.data ?? []) : proximas.data;
  const fuenteJugadas = busquedaActiva ? (busqueda.data ?? []) : jugadas.data;

  const pendientesUrgentes = calcularPendientesUrgentes(proximas.data, ahora);
  // admin.html:2127-2141 — los KPIs siempre vienen de los datasets completos
  // (jugadas.data/proximas.data), nunca de resultadosBusqueda ni de la lista
  // ya filtrada por filtroRapido/fecha/nombre: buscar "Juan" o activar "Hoy"
  // no debe mover ni un número de estas cards.
  const { inicio: semanaInicio, fin: semanaFin } = obtenerRangoSemana(ahora);
  const horasSemana = calcularHorasSemana(jugadas.data, semanaInicio, semanaFin, ahora);
  const ocupacionHoy = calcularOcupacionHoy(jugadas.data, hoyISO(), ahora);
  // R2 — Caja (D7) se mudó a CajaView, que comparte esta misma instancia de
  // `jugadas` (ver AdminShell.tsx) — su cálculo/patch en vivo no cambió, solo
  // dejó de vivir acá.
  // C3 — admin.html:1128-1130 (virtualesProximos). `proximas.data` (no
  // `fuenteProximas`) para el chequeo de "ya existe": el dedupe de ocurrencias
  // ya materializadas debe mirar siempre el dataset completo, nunca los
  // resultados de una búsqueda server-side en curso — mismo criterio que ya
  // aplican los KPIs de abajo con jugadas.data/proximas.data.
  const virtualesProximos: ReservaVirtual[] = mostrarFijos
    ? ocurrenciasFijasVirtuales(
        turnosFijos.turnosFijos,
        turnosFijos.excepciones,
        proximas.data,
        ahora,
        HORIZONTE_VIRTUALES_DIAS,
        aperturaHoyMin,
      )
    : [];
  const proximosItems: ItemListaProximas[] = construirListaProximas(
    fuenteProximas,
    virtualesProximos,
    filtros,
    aperturaHoyMin,
    ahora,
  );
  const jugadasItems = construirListaJugadas(fuenteJugadas, filtros, ahora, ordenJugados);

  // admin.html:1137-1139 — limiteVisible/quedanMas se aplican sobre lo que
  // esté mostrando el tab activo, no sobre las 3 listas a la vez. R5 —
  // `pendientesUrgentes` (ReservaProcesada[]) se une al tipo combinado
  // (ItemListaProximas[]) para poder compartir el mismo slice/find que
  // proximosItems/jugadasItems.
  const reservasMostradas: ItemListaProximas[] =
    vistaReservas === "pendientes" ? pendientesUrgentes : vistaReservas === "proximas" ? proximosItems : jugadasItems;
  const reservasVisibles: ItemListaProximas[] = reservasMostradas.slice(0, limiteVisible);
  const quedanMas = reservasMostradas.length > limiteVisible;
  const hayFiltrosActivos = Boolean(filtroFecha || filtroNombre || filtroRapido);
  // admin.html:1140/2388/2390 — mientras hay búsqueda activa, el loading y el
  // mensaje de vacío pasan a reflejar el estado de la búsqueda, no el de la
  // carga normal del tab.
  const cargando = busquedaActiva ? busqueda.buscando : vistaReservas === "jugadas" ? jugadas.loading : proximas.loading;
  const errorCarga = busquedaActiva ? busqueda.error : vistaReservas === "jugadas" ? jugadas.error : proximas.error;
  const textoVacio = busquedaActiva ? "No se encontraron resultados para la búsqueda." : "No hay reservas para mostrar.";
  const textoCargando = busquedaActiva
    ? "Buscando..."
    : vistaReservas === "jugadas"
      ? "Cargando..."
      : "Cargando próximas...";

  // R5 — el item seleccionado se resuelve contra la lista COMPLETA filtrada
  // (no la paginada): así el detalle sigue mostrándose aunque el item quede
  // más allá de "Mostrar más".
  const itemSeleccionado = seleccionClave ? (reservasMostradas.find((i) => claveItem(i) === seleccionClave) ?? null) : null;

  const desktopFocus = useDialogFocus(() => setSeleccionClave(null), false, {
    active: esDesktop && !!itemSeleccionado, trap: false,
  });

  function alternarFiltroRapido(key: NonNullable<FiltroRapido>) {
    setFiltroRapido((actual) => (actual === key ? null : key));
  }

  function limpiarFiltros() {
    setFiltroFecha("");
    setFiltroNombre("");
    setFiltroRapido(null);
  }

  async function confirmar(id: string) {
    if (confirmandoId === id) return;
    setConfirmandoId(id);
    const { error } = await confirmarReserva(id);
    if (error) {
      mostrarToast(mensajeErrorReserva(error, "confirmar"), "error");
    } else {
      proximas.actualizarLocal((prev) => marcarConfirmada(prev, id));
      jugadas.actualizarLocal((prev) => marcarConfirmada(prev, id));
      busqueda.actualizarLocal((prev) => marcarConfirmada(prev, id));
    }
    setConfirmandoId(null);
  }

  function abrirCancelarModal(r: ReservaProcesada) {
    setCancelarModal({ turnoFijoId: r.turno_fijo_id, id: r.id, nombre: r.nombre, fecha: r.fecha, horaInicio: r.horaInicio, horaFin: r.horaFin });
  }

  // ConfirmModal ya bloquea el cierre por overlay/botón mientras `busy` es
  // true, así que acá no hace falta re-chequear procesandoCancelar.
  function cerrarCancelarModal() {
    setCancelarModal(null);
  }

  async function confirmarCancelacion() {
    if (!cancelarModal || procesandoCancelar) return;
    const { id } = cancelarModal;
    setProcesandoCancelar(true);
    const { error } = await cancelarReserva(id);
    if (error) {
      mostrarToast(mensajeErrorReserva(error, "cancelar"), "error");
    } else {
      if (cancelarModal.turnoFijoId) {
        turnosFijos.agregarExcepcionLocal({ id: `cancel-${id}`, turno_fijo_id: cancelarModal.turnoFijoId, fecha: cancelarModal.fecha, creado: null });
        void turnosFijos.recargar({ silencioso: true });
      }
      proximas.actualizarLocal((prev) => quitarPorId(prev, id));
      jugadas.actualizarLocal((prev) => quitarPorId(prev, id));
      busqueda.actualizarLocal((prev) => quitarPorId(prev, id));
      // R5 — el item cancelado ya no existe: si era el seleccionado, el panel
      // de detalle vuelve a su estado vacío en vez de quedar mostrando una
      // reserva fantasma.
      if (seleccionClave === id) setSeleccionClave(null);
    }
    setProcesandoCancelar(false);
    // Se cierra siempre, incluso si hubo error — paridad legacy (admin.html:1907).
    setCancelarModal(null);
  }

  function abrirPagoModal(r: ReservaProcesada) {
    setPagoReserva(r);
  }

  // PaymentModal ya bloquea el cierre mientras `guardando` es true (no llama
  // a este onClose en ese caso), así que acá no hace falta re-chequearlo.
  function cerrarPagoModal() {
    setPagoReserva(null);
  }

  // FINAL-F6 — PaymentModal registra el movimiento (RPC idempotente) y
  // devuelve el snapshot nuevo confirmado por el servidor: acá solo se
  // parchean las listas locales y se avisa a Caja (que lee movimientos).
  function pagoGuardado(resultado: ResultadoMovimientoPago) {
    const id = resultado.reserva_id;
    const split = { efectivo: Number(resultado.pago_efectivo), transferencia: Number(resultado.pago_transferencia) };
    proximas.actualizarLocal((prev) => aplicarPago(prev, id, split));
    jugadas.actualizarLocal((prev) => aplicarPago(prev, id, split));
    busqueda.actualizarLocal((prev) => aplicarPago(prev, id, split));
    invalidarEconomia({ reservaId: id });
    mostrarToast(resultado.repetido ? "Ese movimiento ya estaba registrado (no se duplicó)." : "Movimiento registrado.", "ok");
    setPagoReserva(null);
  }

  // El estado local de pagos quedó viejo (otra pestaña/otro admin): recarga
  // silenciosa de las listas; el modal queda en modo "solo cerrar".
  function pagoDesactualizado() {
    void proximas.recargar({ silencioso: true });
    void jugadas.recargar({ silencioso: true });
  }

  function cambiarVista(v: VistaReservas) {
    setVistaReservas(v);
  }

  function seleccionar(item: ItemListaProximas, conPuntero: boolean) {
    const clave = claveItem(item);
    setAnimarCierre(conPuntero && seleccionClave === clave);
    setSeleccionClave((actual) => actual === clave ? null : clave);
  }

  const detalleProps = {
    item: itemSeleccionado,
    contexto: vistaReservas,
    confirmandoId,
    onConfirmar: confirmar,
    onCancelar: abrirCancelarModal,
    onPago: abrirPagoModal,
    mostrarToast,
  };

  return (
    <div className="admin-workspace reservas-workspace flex flex-col gap-4">
      {/* R2 — "Caja semanal" se mudó a CajaView (D7 sigue siendo el mismo
          cálculo, solo cambió dónde se muestra) — este grid queda en 2
          columnas en vez de 3. */}
      <section aria-label="Indicadores" className="reservas-metrics grid grid-cols-2 gap-2.5">
        <Card className="p-3.5">
          <div className="text-[10.5px] font-bold tracking-wide text-muted uppercase">Horas jugadas</div>
          <div className="mt-1 font-heading text-2xl font-bold text-accent">{horasSemana}</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-[10.5px] font-bold tracking-wide text-muted uppercase">Turnos de hoy jugados</div>
          <div className="mt-1 font-heading text-2xl font-bold text-accent">{ocupacionHoy.ocupacionHoyPct}%</div>
          <div className="mt-2 h-2 overflow-hidden rounded-pill bg-bg">
            <div
              className="h-full origin-left rounded-pill bg-gradient-to-r from-success to-accent transition-transform duration-300 ease-out"
              style={{ transform: `scaleX(${ocupacionHoy.ocupacionHoyPct / 100})` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-muted">
            {ocupacionHoy.reservasHoyJugadas.length}/{ocupacionHoy.reservasHoy.length} jugados
          </div>
        </Card>
      </section>

      {/* R2 — "Cierre de caja" (D7) se mudó a CajaView, destino de navegación
          propio: mismas fórmulas, mismo hook (useCajaSemana), sin cambios de
          cálculo. Ver caja/CajaView.tsx. */}

      <Card className="reservas-filters p-3.5">
        <div className="flex flex-wrap gap-2">
          {FILTROS_RAPIDOS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => alternarFiltroRapido(key)}
              aria-pressed={filtroRapido === key}
              className={pillClass(filtroRapido === key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
          <DatePicker
            aria-label="Fecha"
            value={filtroFecha}
            onChange={setFiltroFecha}
            className="sm:w-[160px]"
          />
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              size={15}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
            />
            <Input
              type="text"
              placeholder="Buscar por nombre..."
              aria-label="Buscar reservas por nombre"
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="pl-9"
            />
          </div>
          {hayFiltrosActivos && (
            <Button variant="secondary" size="sm" onClick={limpiarFiltros} className="self-start sm:self-auto">
              Limpiar
            </Button>
          )}
        </div>
        {busquedaActiva && (busqueda.data ?? []).length === 50 && (
          <p className="mt-2.5 text-xs text-muted">
            Mostrando los 50 resultados más recientes — si no encontrás lo que buscás, probá acotar con una fecha.
          </p>
        )}
      </Card>

      <div className={esDesktop ? "admin-workspace-columns grid grid-cols-[minmax(0,11fr)_minmax(0,9fr)] gap-4" : "flex flex-col gap-4"}>
        <Card className="admin-workspace-list min-w-0 overflow-y-auto p-3.5">
          <div role="tablist" aria-label="Estado de la reserva" className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-border bg-surface-2 p-1">
            {TABS.map((t) => {
              const activo2 = vistaReservas === t.key;
              const cantidad =
                t.key === "pendientes" ? pendientesUrgentes.length : t.key === "proximas" ? proximosItems.length : jugadasItems.length;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={activo2}
                  onClick={() => cambiarVista(t.key)}
                  className={`ui-transition relative rounded-pill px-3 py-1.5 text-[12.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                    activo2 ? "text-on-accent" : "text-muted hover:text-text"
                  }`}
                >
                  {activo2 && (
                    <motion.span
                      layoutId="reservas-tab-pill"
                      transition={SPRING_TAB}
                      className="absolute inset-0 rounded-pill bg-accent"
                    />
                  )}
                  <span className="relative z-10">
                    {t.label} ({cantidad})
                  </span>
                </button>
              );
            })}
          </div>

          {vistaReservas === "jugadas" && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOrdenJugados("recientes")}
                aria-pressed={ordenJugados === "recientes"}
                className={pillClass(ordenJugados === "recientes")}
              >
                Recientes primero
              </button>
              <button
                type="button"
                onClick={() => setOrdenJugados("antiguos")}
                aria-pressed={ordenJugados === "antiguos"}
                className={pillClass(ordenJugados === "antiguos")}
              >
                Antiguos primero
              </button>
            </div>
          )}

          {vistaReservas === "proximas" && (
            <div className="mt-3 border-t border-border pt-2">
              <button
                type="button"
                role="switch"
                aria-label="Mostrar turnos fijos"
                aria-checked={mostrarFijos}
                onClick={() => setMostrarFijos((v) => !v)}
                className="ui-transition flex min-h-11 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Repeat size={16} aria-hidden="true" className={mostrarFijos ? "shrink-0 text-secondary" : "shrink-0 text-muted"} />
                <span className="min-w-0 flex-1 text-sm font-medium text-text">Incluir turnos fijos</span>
                <span aria-hidden="true" className="text-xs text-muted">{mostrarFijos ? "Sí" : "No"}</span>
                <span aria-hidden="true" className={`flex h-6 w-10 shrink-0 items-center rounded-pill border p-0.5 ${mostrarFijos ? "border-secondary bg-secondary" : "border-border-strong bg-surface-2"}`}>
                  <span className={`h-4 w-4 rounded-full ${mostrarFijos ? "ml-auto bg-surface" : "bg-muted"}`} />
                </span>
              </button>
            </div>
          )}

          <section aria-label={TABS.find((t) => t.key === vistaReservas)!.label} aria-busy={cargando} className="mt-3">
            {cargando && <p role="status" className="text-sm text-muted">{textoCargando}</p>}
            {!cargando && errorCarga && (
              <div role="alert" className="mb-3 flex flex-wrap items-center gap-3">
                <p className="text-sm text-error">{busquedaActiva ? "No se pudo buscar. Modificá los filtros para volver a intentar." : "No se pudieron cargar las reservas."}</p>
                {!busquedaActiva && <Button variant="secondary" size="sm" onClick={() => vistaReservas === "jugadas" ? jugadas.recargar() : proximas.recargar()}>Reintentar</Button>}
              </div>
            )}
            {!cargando && !errorCarga && reservasMostradas.length === 0 && <p className="text-sm text-muted">{textoVacio}</p>}
            <div className="flex flex-col gap-2">
              {reservasVisibles.map((item) => (
                <FilaReserva
                  key={claveItem(item)}
                  item={item}
                  contexto={vistaReservas}
                  seleccionada={seleccionClave === claveItem(item)}
                  onClick={(event) => seleccionar(item, event.detail > 0)}
                />
              ))}
            </div>
            {quedanMas && (
              <button
                type="button"
                onClick={() => setLimiteVisible((v) => v + 20)}
                className="tap-fx ui-transition mt-2.5 w-full rounded-md border border-dashed border-border py-3 text-[13px] font-semibold text-muted hover:border-border-strong hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                Mostrar más ({reservasMostradas.length - limiteVisible} más)
              </button>
            )}
            {vistaReservas === "jugadas" && !busquedaActiva && (
              <>
                {jugadas.errorAnterior && !jugadas.cargandoAnterior && <p role="alert" className="mt-3 text-sm text-error">No se pudo cargar la semana anterior. Volvé a intentar.</p>}
                <button
                  type="button"
                  onClick={jugadas.cargarAnterior}
                  disabled={jugadas.cargandoAnterior}
                  className="tap-fx ui-transition mt-2.5 w-full rounded-md border border-dashed border-border py-3 text-[13px] font-semibold text-muted hover:border-border-strong hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-60"
                >
                  {jugadas.cargandoAnterior ? "Cargando semana anterior..." : "Cargar semana anterior"}
                </button>
              </>
            )}
          </section>
        </Card>

        {esDesktop && (
          <Card className="admin-reserva-detail min-h-0 min-w-0 overflow-hidden p-4" data-testid="detalle-reserva">
            <div className="h-full min-h-0" {...desktopFocus} role="region" aria-label="Detalle de la reserva">
            <AnimatePresence initial={false} mode="wait" custom={animarCierre && !itemSeleccionado}>
              <TransicionDetalle key={itemSeleccionado ? "seleccion" : "vacio"}>
                <DetalleReservaContenido {...detalleProps} />
              </TransicionDetalle>
            </AnimatePresence>
          </div>
          </Card>
        )}
      </div>

      {!esDesktop && (
        <AnimatePresence>
          {itemSeleccionado && (
            <>
              <div data-drawer-backdrop className="fixed inset-0 z-40" onClick={() => setSeleccionClave(null)} />
              <DrawerSurface
                onClose={() => setSeleccionClave(null)}
                role="dialog"
                aria-modal="true"
                aria-label="Detalle de la reserva"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={SPRING_SHEET}
                onClick={(e) => e.stopPropagation()}
                className="scroll-hidden fixed inset-x-0 bottom-0 z-50 h-[85dvh] flex max-h-[85dvh] flex-col overflow-hidden rounded-t-xl border-t border-border bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-lg"
                data-testid="detalle-reserva"
              >
                <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex shrink-0 justify-end border-b border-border bg-surface-elevated px-5 py-2">
                  <IconButton aria-label="Cerrar" variant="ghost" size="sm" onClick={() => setSeleccionClave(null)}>
                    <X size={18} strokeWidth={1.75} />
                  </IconButton>
                </div>
                <DetalleReservaContenido {...detalleProps} />
              </DrawerSurface>
            </>
          )}
        </AnimatePresence>
      )}

      {cancelarModal && (
        <ConfirmModal
          mensaje={`¿Cancelar el turno de ${cancelarModal.nombre} del ${formatearBadgeFecha(cancelarModal.fecha)} ${cancelarModal.horaInicio}-${cancelarModal.horaFin}?`}
          confirmLabel={procesandoCancelar ? "Cancelando..." : "Confirmar"}
          busy={procesandoCancelar}
          onClose={cerrarCancelarModal}
          onConfirm={confirmarCancelacion}
        />
      )}

      {pagoReserva && (
        <PaymentModal
          reserva={pagoReserva}
          onGuardado={pagoGuardado}
          onDesactualizado={pagoDesactualizado}
          onClose={cerrarPagoModal}
        />
      )}
    </div>
  );
}

function Fila({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 text-[13px] last:border-b-0">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 break-words text-right font-semibold tabular-nums text-text">{valor}</span>
    </div>
  );
}

// R5 — badge de estado compartido entre la fila de lista y el panel de
// detalle, para que ambos lugares digan exactamente lo mismo.
function estadoBadge(r: ReservaProcesada, contexto: VistaReservas): { texto: string; variant: BadgeVariant } | null {
  if (!ocupaCancha(r, Date.now())) return { texto: "Vencida · contabilidad", variant: "warning" };
  if (r.bloqueado) return { texto: "Bloqueado", variant: "neutral" };
  if (contexto === "jugadas") return r.confirmada ? { texto: "Jugado", variant: "neutral" } : { texto: "No confirmada", variant: "warning" };
  return r.confirmada ? { texto: "Confirmado", variant: "success" } : { texto: "Pendiente", variant: "warning" };
}

// P3 — estado de pago del turno (ventas.logic.ts, estadoPagoTurno): solo
// presentación acá, mismo mapa de texto/color que AgendaDetalleSheet.tsx
// (la clasificación en sí es la lógica pura compartida, no esto). Prefijo
// "Pago " deliberado: sin él, "Pendiente" colisiona con el badge de
// confirmación de la reserva (estadoBadge, arriba) que ya usa ese mismo texto.
const LABEL_ESTADO_PAGO: Record<EstadoPagoTurno, string> = {
  pendiente: "Pago pendiente",
  parcial: "Pago parcial",
  pagado: "Pago completo",
};
const VARIANTE_ESTADO_PAGO: Record<EstadoPagoTurno, BadgeVariant> = {
  pendiente: "warning",
  parcial: "info",
  pagado: "success",
};

interface FilaReservaProps {
  item: ItemListaProximas;
  contexto: VistaReservas;
  seleccionada: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}

// R5 — fila densa de la lista: solo información + badges, SIN acciones (las
// acciones viven en el panel/sheet de detalle, ver DetalleReservaContenido).
// Reemplaza a los antiguos ReservaItem/JugadaItem (que traían sus propios
// botones inline).
function FilaReserva({ item, contexto, seleccionada, onClick }: FilaReservaProps) {
  const esVirtual = "virtual" in item;
  const nombre = esVirtual ? item.nombre : item.nombre;
  const badge = esVirtual ? null : estadoBadge(item, contexto);
  const pagado = !esVirtual && Number(item.pago_efectivo || 0) + Number(item.pago_transferencia || 0) > 0;

  return (
    <button
      type="button"
      data-testid="fila-reserva"
      aria-label={nombre}
      aria-pressed={seleccionada}
      onClick={onClick}
      className={`tap-fx ui-transition flex flex-col items-start gap-1 rounded-md border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        seleccionada ? "border-accent bg-accent-muted" : "border-border bg-surface hover:border-border-strong hover:bg-surface-hover"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="neutral">{formatearBadgeFecha(item.fecha)}</Badge>
        <span className="text-body-sm font-semibold whitespace-nowrap text-text">
          {item.horaInicio}-{item.horaFin}
        </span>
        {esVirtual && <Badge variant="info">Turno fijo</Badge>}
        {badge && <Badge variant={badge.variant}>{badge.texto}</Badge>}
      </div>
      <div className="w-full break-words text-body-sm text-muted">
        {nombre} · {item.telefono}
        {!esVirtual && !item.bloqueado && ` · $${item.precio}`}
      </div>
      {!esVirtual && contexto === "jugadas" && !item.bloqueado && (
        <span className={`text-[11.5px] font-semibold ${pagado ? "text-success" : "text-warning"}`}>{textoPago(item)}</span>
      )}
    </button>
  );
}

interface DetalleReservaContenidoProps {
  item: ItemListaProximas | null;
  contexto: VistaReservas;
  confirmandoId: string | null;
  onConfirmar: (id: string) => void;
  onCancelar: (r: ReservaProcesada) => void;
  onPago: (r: ReservaProcesada) => void;
  // P4 — feedback de la devolución (éxito/error); la mutación en sí
  // (registrar_devolucion) vive acá adentro, mismo criterio que
  // AgendaDetalleSheet.tsx.
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
}

// P3 — encabezado de sección chico dentro del panel de detalle (que acá es
// un único bloque flotante sin cards separadas, a diferencia de
// AgendaDetalleSheet.tsx): mismo criterio tipográfico que sus títulos
// ("PAGO DEL TURNO"/"PRODUCTOS"/"RESUMEN"), sin adoptar su contenedor con
// borde — eso sí sería el rediseño grande que no toca acá.
function TituloSeccion({ children }: { children: ReactNode }) {
  return <h4 className="mt-4 mb-1 text-[10px] font-bold tracking-widest text-muted uppercase first:mt-0">{children}</h4>;
}

// P3/P4 — mismo desglose de ítems que SeccionProductos de AgendaDetalleSheet.tsx
// (loading/error+reintentar/vacío/lista con trazabilidad de devoluciones +
// botón Devolver): se duplica la presentación (estilo de esta vista, sin
// bordes de card) pero NO la lógica — ambas leen el mismo
// UseVentasDeReservaResult y el mismo itemsConVentaId.
function SeccionProductos({
  ventasDeReserva,
  onDevolver,
}: {
  ventasDeReserva: UseVentasDeReservaResult;
  onDevolver: (item: ItemVentaConVentaId) => void;
}) {
  const { ventas, loading, error, reintentar } = ventasDeReserva;

  if (loading) return <p className="text-sm text-muted">Cargando productos...</p>;
  if (error) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-error">No se pudieron cargar los productos.</p>
        <button
          type="button"
          onClick={reintentar}
          className="tap-fx ui-transition rounded-pill border border-border px-3 py-1 text-xs font-semibold text-text hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const items = itemsConVentaId(ventas);
  if (items.length === 0) return <p className="text-sm text-muted">Sin productos asociados.</p>;

  return (
    <div className="flex flex-col divide-y divide-border/60">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1 py-2 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-text">
              {item.productoNombre} × {item.cantidadOriginal}
            </span>
            <span className="font-semibold tabular-nums text-text">{formatearMoneda(item.subtotalVigente)}</span>
          </div>
          {item.cantidadDevuelta > 0 && (
            <span className="text-[11.5px] font-semibold text-warning">
              {item.cantidadVigente === 0
                ? `Totalmente devuelto (${item.cantidadDevuelta})`
                : `Devueltos ${item.cantidadDevuelta} de ${item.cantidadOriginal}`}
            </span>
          )}
          {item.cantidadVigente > 0 && (
            <Button variant="secondary" size="sm" className="mt-0.5 self-start" onClick={() => onDevolver(item)}>
              Devolver
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// R5 — panel de detalle: mismo lenguaje visual que AgendaDetalleSheet
// (título en mayúsculas chico + nombre grande, filas Día/Horario/Teléfono/
// Precio, acciones al pie), pero embebido acá (desktop) o dentro del bottom
// sheet de arriba (mobile) en vez de ser su propio componente de overlay —
// no necesita drawer propio porque ReservasView ya decide dónde montarlo.
function TransicionDetalle({ children }: { children: ReactNode }) {
  const presente = useIsPresent();
  const reducirMovimiento = useReducedMotion();
  return (
    <motion.div
      className="h-full min-h-0"
      inert={!presente}
      aria-hidden={!presente || undefined}
      initial={false}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      exit="cerrado"
      variants={{
        cerrado: (animar: boolean) => ({
          opacity: 0,
          transform: reducirMovimiento ? "translateY(0)" : "translateY(4px)",
          transition: { duration: animar ? 0.15 : 0, ease: [0.22, 1, 0.36, 1] },
        }),
      }}
    >
      {children}
    </motion.div>
  );
}

function DetalleReservaContenido({ item, contexto, confirmandoId, onConfirmar, onCancelar, onPago, mostrarToast }: DetalleReservaContenidoProps) {
  // P3 — el hook se llama SIEMPRE (regla de hooks: no puede condicionarse a
  // los `return` de acá abajo), decide sola qué hacer con `null` (nada
  // seleccionado, turno fijo virtual, o un bloqueo — ninguno de esos puede
  // tener ventas asociadas).
  const reservaId = item && !("virtual" in item) && !item.bloqueado ? item.id : null;
  const ventasDeReserva = useVentasDeReserva(reservaId);
  const nombreCancha = useNombreCancha();

  // P4 — devolver un producto asociado; mismo useState incondicional que el
  // hook de arriba (regla de hooks), mismo flujo exacto que
  // confirmarDevolucion en HistorialView.tsx/AgendaDetalleSheet.tsx.
  const [devolucionModal, setDevolucionModal] = useState<ItemVentaConVentaId | null>(null);
  const [guardandoDevolucion, setGuardandoDevolucion] = useState(false);
  // FINAL-F6 — una clave de idempotencia por devolución: se reusa en los
  // reintentos mientras el modal sigue abierto y se renueva al cerrarlo.
  const claveDevolucion = useClaveIdempotencia();
  useEffect(() => {
    if (!devolucionModal) claveDevolucion.renovar();
  }, [devolucionModal, claveDevolucion]);

  function cerrarDevolucionModal() {
    if (guardandoDevolucion) return;
    setDevolucionModal(null);
  }

  async function confirmarDevolucion(datos: DatosDevolucion) {
    if (guardandoDevolucion || !devolucionModal) return;
    setGuardandoDevolucion(true);
    const { error } = await registrarDevolucion(devolucionModal.id, datos.cantidad, datos.motivo, datos.medioReembolso, claveDevolucion.actual());
    setGuardandoDevolucion(false);

    if (error) {
      if (esErrorDevolucionExcedeDisponible(error)) {
        mostrarToast("La cantidad disponible para devolver cambió, revisá el detalle e intentá de nuevo.", "error");
        setDevolucionModal(null);
        ventasDeReserva.reintentar();
      } else if (esErrorClaveReutilizada(error)) {
        mostrarToast(MENSAJE_CLAVE_REUTILIZADA, "error");
        setDevolucionModal(null);
        ventasDeReserva.reintentar();
      } else {
        mostrarToast("No se pudo registrar la devolución. Probá de nuevo.", "error");
      }
      return;
    }

    setDevolucionModal(null);
    invalidarEconomia({
      reservaId,
      devolucion: { ventaId: devolucionModal.ventaId, itemId: devolucionModal.id, productoId: devolucionModal.productoId, cantidad: datos.cantidad, medioReembolso: datos.medioReembolso },
    });
    mostrarToast("Devolución registrada.", "ok");
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-muted">
        <ClipboardList size={28} strokeWidth={1.5} />
        <p className="text-sm">Seleccioná una reserva para ver el detalle.</p>
      </div>
    );
  }

  if ("virtual" in item) {
    return (
      <div>
        <p className="text-label font-bold tracking-wide text-muted uppercase">Turno fijo</p>
        <p className="font-heading mt-0.5 break-words text-[20px] font-bold text-text">{item.nombre}</p>
        <div className="mt-4 flex flex-col">
          <Fila label="Día" valor={formatearBadgeFecha(item.fecha)} />
          <Fila label="Horario" valor={`${item.horaInicio} - ${item.horaFin}`} />
          <Fila label="Teléfono" valor={item.telefono} />
        </div>
        <p className="mt-4 text-xs text-muted">
          Esta ocurrencia todavía no se jugó. Para cancelarla un día puntual, hacelo desde Turnos fijos o desde la Agenda.
        </p>
      </div>
    );
  }

  const r = item;
  const badge = estadoBadge(r, contexto);
  const pagado = Number(r.pago_efectivo || 0) + Number(r.pago_transferencia || 0) > 0;
  const confirmando = confirmandoId === r.id;
  const estadoPago = !r.bloqueado ? estadoPagoTurno(r) : null;
  const totales = !r.bloqueado && !ventasDeReserva.loading && !ventasDeReserva.error ? calcularTotalesReserva(r, ventasDeReserva.ventas) : null;

  return (
    <>
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label font-bold tracking-wide text-muted uppercase">
            {contexto === "jugadas" ? "Turno jugado" : "Turno reservado"}
          </p>
          <p className="font-heading mt-0.5 break-words text-[20px] font-bold text-text">{r.nombre}</p>
        </div>
        {badge && <Badge variant={badge.variant}>{badge.texto}</Badge>}
      </div>

      <div className="reserva-detail-body min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="reserva-facts mt-3 grid grid-cols-2 gap-x-3">
        <Fila label="Día" valor={formatearBadgeFecha(r.fecha)} />
        <Fila label="Horario" valor={`${r.horaInicio} - ${r.horaFin}`} />
        {!r.bloqueado && <Fila label="Teléfono" valor={r.telefono} />}
      </div>

      {!r.bloqueado && estadoPago && (
        <>
          <TituloSeccion>Pago del turno</TituloSeccion>
          <div className="reserva-facts grid grid-cols-2 gap-x-3">
            <Fila label="Precio del turno" valor={`$${Number(r.precio || 0).toLocaleString("es-AR")}`} />
            <Fila label="Pago" valor={<span className={pagado ? "text-success" : "text-warning"}>{textoPago(r)}</span>} />
            <Fila label="Estado" valor={<Badge variant={VARIANTE_ESTADO_PAGO[estadoPago]}>{LABEL_ESTADO_PAGO[estadoPago]}</Badge>} />
          </div>

          <TituloSeccion>Productos</TituloSeccion>
          <SeccionProductos ventasDeReserva={ventasDeReserva} onDevolver={setDevolucionModal} />

          {totales && (
            <>
              <TituloSeccion>Resumen</TituloSeccion>
              <div className="reserva-facts grid grid-cols-2 gap-x-3">
                <Fila label="Turno" valor={formatearMoneda(totales.precioTurno)} />
                <Fila label="Productos netos" valor={formatearMoneda(totales.productosNetos)} />
                <Fila label="Total asociado" valor={formatearMoneda(totales.totalAsociado)} />
                <Fila label="Cobrado neto" valor={formatearMoneda(totales.cobradoNeto)} />
                <Fila
                  label="Saldo pendiente"
                  valor={
                    <span className={totales.saldoPendienteTurno > 0 ? "text-warning" : "text-success"}>
                      {formatearMoneda(totales.saldoPendienteTurno)}
                    </span>
                  }
                />
              </div>
            </>
          )}
        </>
      )}

      </div>
      <div className="mt-3 flex shrink-0 flex-wrap gap-2 border-t border-border bg-surface pt-3 [&>*]:flex-1">
        {contexto !== "jugadas" && !r.bloqueado && (
          <a
            className="tap-fx ui-transition flex h-11 items-center justify-center gap-1.5 rounded-pill border border-success px-4 text-[13px] font-semibold text-success hover:bg-success-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            href={construirLinkWhatsapp(r, nombreCancha ?? "")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconWhatsapp size={15} /> WhatsApp
          </a>
        )}
        {contexto !== "jugadas" && !r.bloqueado && !r.confirmada && (
          <Button variant="success" loading={confirmando} onClick={() => onConfirmar(r.id)}>
            <Check size={16} strokeWidth={2.25} /> Confirmar
          </Button>
        )}
        {!r.bloqueado && (contexto === "jugadas" || r.confirmada) && (
          <Button variant="success" onClick={() => onPago(r)}>
            <Wallet size={16} strokeWidth={2.25} /> {contexto === "jugadas" ? (pagado ? "Pago" : "Cargar pago") : pagado ? "Pago" : "Cobrar"}
          </Button>
        )}
        {contexto !== "jugadas" && (
          <Button variant="destructive" onClick={() => onCancelar(r)}>
            Cancelar
          </Button>
        )}
      </div>
    </div>

    {devolucionModal && (
      <DevolucionModal
        productoNombre={devolucionModal.productoNombre}
        cantidadVigente={devolucionModal.cantidadVigente}
        precioSnapshot={devolucionModal.precioSnapshot}
        guardando={guardandoDevolucion}
        onGuardar={confirmarDevolucion}
        onClose={cerrarDevolucionModal}
      />
    )}
    </>
  );
}
