// Orquestación del formulario de reserva pública, extraída de index.html
// (líneas 227-232, 261, 393-478, 616, 664, 670, 532 al momento de la extracción).
// No reimplementa ningún cálculo/mapeo: todo vive en reservations.logic.ts y
// reservations.form.logic.ts, esto solo conecta esos módulos + reservations.api.ts
// con estado de React (inputs, guardando, mensaje, éxito, timeout de redirect).

import { useEffect, useRef, useState } from "react";
import { calcularCierreExtendido, extenderReserva, horaToMinutos } from "../../lib/datetime";
import { useCotizacionReservas } from "../public-shell/useCotizacionReservas";
import { crearReserva, type RespuestaReservar } from "./reservations.api";
import {
  horasFinDisponibles as calcularHorasFinDisponibles,
  horasInicioDisponibles as calcularHorasInicioDisponibles,
} from "./reservations.logic";
import {
  calcularPrecioEstimado,
  construirLinkWhatsapp,
  construirMensajeWhatsapp,
  mapearErrorCrearReserva,
  NOMBRE_MAX_LENGTH,
  TELEFONO_MAX_LENGTH,
} from "./reservations.form.logic";
import type { ConfigReserva, ConfiguracionReservas, FranjaOperativa } from "./reservations.types";
import type { UseDisponibilidad } from "./useDisponibilidad";
import type { UseTurnstile } from "./useTurnstile";

export interface MensajeForm {
  // El legacy nunca usó otro valor que "error" para `mensaje` en todo el archivo
  // (confirmado con grep) — se preserva ese único caso real, no un union más ancho.
  tipo: "error";
  texto: string;
}

export interface ExitoReserva {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  precio: number;
  link: string;
}

interface UseReservaForm {
  cotizacion: ReturnType<typeof useCotizacionReservas>;
  incierta: boolean;
  reservaIncierta: { fecha: string; horaInicio: string; horaFin: string; nombre: string } | null;
  habilitarReintento: () => void;
  horaInicio: string;
  horaFin: string;
  nombre: string;
  telefono: string;
  mensaje: MensajeForm | null;
  guardando: boolean;
  exito: ExitoReserva | null;
  horasInicioDisponibles: string[];
  horasFinDisponibles: string[];
  // C4 — true si `fecha` está cerrada (fecha especial o día de la semana
  // cerrado en horarios_semana). Quien renderice decide qué mostrar en ese
  // caso (horasInicioDisponibles ya viene vacío de todas formas).
  cerrado: boolean;
  precioEstimado: number;
  formCompleto: boolean;
  seleccionarHoraInicio: (hora: string) => void;
  seleccionarHoraFin: (hora: string) => void;
  actualizarNombre: (valor: string) => void;
  actualizarTelefono: (valor: string) => void;
  confirmarReserva: () => Promise<void>;
  cerrarExito: () => void;
}

export function useReservaForm(
  fecha: string,
  disponibilidad: Pick<UseDisponibilidad, "reservasDelDia" | "refrescar"> & Partial<Pick<UseDisponibilidad, "loading" | "error">>,
  config: ConfigReserva,
  // C4 — horario operativo real de `fecha` (null mientras carga, o si falló
  // el fetch): reemplaza config.horaApertura/horaCierre, que ya no son la
  // fuente de verdad para la disponibilidad pública. Sin franja cargada o
  // con el día cerrado, no hay horarios para ofrecer (mismo efecto que
  // aperturaMin === cierreExt: los generadores de horas ya devuelven []).
  franja: FranjaOperativa | null,
  // C5/C6 — configuración operativa real (duración, anticipación máxima/
  // mínima, límite por teléfono; null mientras carga, o si falló el fetch):
  // reemplaza las constantes DURACION_MINIMA/DURACION_MAXIMA/14/3, que ya no
  // son la fuente de verdad. Sin esto cargado, no hay horarios que ofrecer —
  // nunca se cae a un valor por defecto silencioso.
  configuracionReservas: ConfiguracionReservas | null,
  // FINAL-F5-B — verificación anti-bot (Turnstile). El token es de un solo uso:
  // confirmarReserva lo consume y SIEMPRE llama a reiniciar() después del intento.
  turnstile: Pick<UseTurnstile, "token" | "reiniciar">,
): UseReservaForm {
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [mensaje, setMensaje] = useState<MensajeForm | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState<ExitoReserva | null>(null);

  const [incierta, setIncierta] = useState(false);
  const [reservaIncierta, setReservaIncierta] = useState<UseReservaForm["reservaIncierta"]>(null);
  const inciertaRef = useRef(false);
  const enviandoRef = useRef(false);
  const activoRef = useRef(false);
  const tokensUsadosRef = useRef(new Set<string>());
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // index.html:258 (seleccionarFecha) — el legacy resetea horaInicio/horaFin/mensaje
  // en el mismo instante en que cambia `fecha`. Acá `fecha` es una prop externa (la
  // dueña de ese estado es quien la administre), así que el hook reacciona a su
  // cambio en vez de hacerlo dentro de un handler de clic.
  useEffect(() => {
    setHoraInicio("");
    setHoraFin("");
    if (!inciertaRef.current) setMensaje(null);
  }, [fecha]);

  // Cleanup nuevo (no existe en el legacy, que nunca desmonta este componente):
  // si el hook se desmonta antes de que se cumplan los 1500ms, no debe quedar
  // un setTimeout suelto tratando de redirigir una página que ya no está.
  useEffect(() => {
    activoRef.current = true;
    return () => {
      activoRef.current = false;
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  // C4 — sin franja cargada todavía, o con el día cerrado, no hay horario que
  // ofrecer: aperturaMin === cierreExt hace que horasInicioDisponibles ya dé
  // [] sin necesidad de una rama aparte (mismo motivo que 0/0 más abajo).
  const cerrado = franja?.cerrado ?? false;
  const aperturaMin = franja && !cerrado ? horaToMinutos(franja.horaApertura!) : 0;
  const cierreExt = franja && !cerrado ? calcularCierreExtendido(aperturaMin, horaToMinutos(franja.horaCierre!)) : 0;

  // C5/C6 — sin configuración cargada todavía, no hay nada que ofrecer: a
  // diferencia de aperturaMin/cierreExt (donde 0/0 ya da [] naturalmente),
  // acá NO se usa un default numérico (0 rompería el cálculo: generaría
  // horarios de 0min) — se corta explícito.
  const fuentesListas = !disponibilidad.loading && !disponibilidad.error && Boolean(franja && configuracionReservas);
  const horasInicioDisponibles = fuentesListas && configuracionReservas
    ? calcularHorasInicioDisponibles(
        fecha,
        disponibilidad.reservasDelDia,
        aperturaMin,
        cierreExt,
        configuracionReservas.duracionMinima,
        undefined,
        configuracionReservas.anticipacionMinimaMinutos,
      )
    : [];
  const horasFinDisponibles = fuentesListas && configuracionReservas
    ? calcularHorasFinDisponibles(
        horaInicio,
        disponibilidad.reservasDelDia,
        aperturaMin,
        cierreExt,
        configuracionReservas.duracionMinima,
        configuracionReservas.duracionMaxima,
      )
    : [];
  const { precioEstimado } = calcularPrecioEstimado(horaInicio, horaFin, aperturaMin, config.precioHora);
  const cotizacion = useCotizacionReservas(fecha, horaInicio, horasFinDisponibles);
  const precioValido = !cotizacion.loading && !cotizacion.error && Number.isFinite(cotizacion.precios[horaFin]);
  const formCompleto = Boolean(fecha && horaInicio && horaFin && nombre && telefono);

  // index.html:616 — elegir un nuevo inicio limpia el fin ya elegido.
  function seleccionarHoraInicio(hora: string) {
    setHoraInicio(hora);
    setHoraFin("");
  }

  function seleccionarHoraFin(hora: string) {
    setHoraFin(hora);
  }

  // index.html:664 — mismo regex exacto: letras (con acentos/Ñ) y espacios.
  // FINAL-F5-A — además: cualquier espacio en blanco que no sea el espacio común
  // (tab, NBSP, saltos pegados) pasa a ser un espacio (el servidor rechaza los
  // caracteres de control) y se corta a NOMBRE_MAX_LENGTH (el servidor rechaza
  // más de 80 luego de colapsar espacios; acá el corte es conservador).
  function actualizarNombre(valor: string) {
    setNombre(
      valor
        .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, "")
        .replace(/[^\S ]/g, " ")
        .slice(0, NOMBRE_MAX_LENGTH),
    );
  }

  // index.html:670 — mismo regex exacto: solo dígitos. FINAL-F5-A: tope de largo.
  function actualizarTelefono(valor: string) {
    setTelefono(valor.replace(/[^0-9]/g, "").slice(0, TELEFONO_MAX_LENGTH));
  }

  // index.html:532 — "Hacer otra reserva".
  function cerrarExito() {
    if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    redirectTimeoutRef.current = null;
    setExito(null);
  }

  // index.html:417-478 (FINAL-F5-B: ahora vía POST /api/reservar + Turnstile)
  async function confirmarReserva() {
    if (enviandoRef.current || inciertaRef.current || !activoRef.current) return;
    setMensaje(null);
    if (!formCompleto) {
      setMensaje({ tipo: "error", texto: "Completá todos los campos antes de reservar." });
      return;
    }
    const { ini: iniCheck, fin: finCheck } = extenderReserva(horaInicio, horaFin, aperturaMin);
    if (!configuracionReservas || finCheck - iniCheck < configuracionReservas.duracionMinima) {
      setMensaje({
        tipo: "error",
        texto: `La reserva mínima es de ${configuracionReservas?.duracionMinima ?? 0} minutos.`,
      });
      return;
    }

    // FINAL-F5-B — sin verificación válida no se envía nada (el botón ya está
    // bloqueado; esto cubre Enter/doble evento antes de que React re-renderice).
    if (!fuentesListas || !precioValido) {
      setMensaje({ tipo: "error", texto: "Necesitamos disponibilidad y precio actualizados antes de confirmar. Reintentá la carga." });
      return;
    }
    const tokenTurnstile = turnstile.token;
    if (!tokenTurnstile || tokensUsadosRef.current.has(tokenTurnstile)) {
      setMensaje({ tipo: "error", texto: "Estamos verificando tu conexión. Esperá un instante y volvé a confirmar." });
      return;
    }

    enviandoRef.current = true;
    tokensUsadosRef.current.add(tokenTurnstile);
    setGuardando(true);

    const { data: nuevaReserva, error: errRpc } = await crearReserva(
      {
        p_fecha: fecha,
        p_hora_inicio: horaInicio,
        p_hora_fin: horaFin,
        p_nombre: nombre,
        p_telefono: telefono,
      },
      tokenTurnstile,
    ).catch((): RespuestaReservar => ({ data: null, error: { message: "RESERVA_INCIERTA" } }));
    if (!activoRef.current) return;
    enviandoRef.current = false;
    setGuardando(false);
    // El token de Turnstile es single-use: se gastó con este intento, salió bien o mal.
    turnstile.reiniciar();

    if (errRpc?.message === "RESERVA_INCIERTA") {
      inciertaRef.current = true;
      setIncierta(true);
      setReservaIncierta({ fecha, horaInicio, horaFin, nombre });
      setMensaje({ tipo: "error", texto: "No recibimos la confirmación. La reserva podría haberse creado. Consultá con la cancha por WhatsApp antes de intentar otra vez." });
      return;
    }
    if (errRpc) {
      const { texto, debeRefrescarDisponibilidad } = mapearErrorCrearReserva(
        errRpc.message || "",
        configuracionReservas.limiteReservasActivasTelefono,
        errRpc.retryAfter,
      );
      setMensaje({ tipo: "error", texto });
      if (debeRefrescarDisponibilidad) {
        await disponibilidad.refrescar({ forzar: true, silencioso: true });
      }
      return;
    }

    // Desviación deliberada y aprobada respecto del legacy: index.html arma el
    // WhatsApp y `exito.precio` con el precio ESTIMADO local. Acá se usa el
    // precio AUTORITATIVO que devuelve el servidor (nuevaReserva.precio) — desde
    // C2, crear_reserva ya ni siquiera recibe un precio del cliente: lo calcula
    // internamente contra el motor histórico de tarifas (calcular_precio_en_instante).
    const precioFinal = nuevaReserva.precio;

    const mensajeWa = construirMensajeWhatsapp({
      nombreCancha: config.nombreCancha,
      fecha,
      horaInicio,
      horaFin,
      nombre,
      telefono,
      precio: precioFinal,
    });
    const link = construirLinkWhatsapp(config.whatsappNumero, mensajeWa);

    // 1. Mostramos la pantalla de éxito primero.
    setExito({ fecha, horaInicio, horaFin, precio: precioFinal, link });

    // 2. Redirección automática retrasada (compatible con Instagram).
    redirectTimeoutRef.current = setTimeout(() => {
      if (activoRef.current) window.location.href = link;
    }, 1500);

    setHoraInicio("");
    setHoraFin("");
    setNombre("");
    setTelefono("");
    setMensaje(null);
    await disponibilidad.refrescar({ forzar: true, silencioso: true });
  }

  return {
    cotizacion,
    incierta,
    reservaIncierta,
    habilitarReintento: () => {
      inciertaRef.current = false;
      setIncierta(false);
      setReservaIncierta(null);
      setMensaje(null);
      void disponibilidad.refrescar({ forzar: true });
    },
    horaInicio,
    horaFin,
    nombre,
    telefono,
    mensaje,
    guardando,
    exito,
    horasInicioDisponibles,
    horasFinDisponibles,
    cerrado,
    precioEstimado,
    formCompleto,
    seleccionarHoraInicio,
    seleccionarHoraFin,
    actualizarNombre,
    actualizarTelefono,
    confirmarReserva,
    cerrarExito,
  };
}
