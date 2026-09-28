// TurnosFijosView — alta y baja de turnos fijos (C2) + próximas ocurrencias y
// link de baja por WhatsApp (C3). Puerto de admin.html: 2457-2538/2540-2554
// (form de alta + lista de activos + próximas ocurrencias) y 1929-2067
// (guardarTurnoFijo/agregarTurnoFijo/eliminarTurnoFijo/cancelarOcurrencia/
// obtenerOCrearToken/compartirLinkBaja).
//
// R4 — rediseño puramente visual: el alta pasa de 3 ChipSelector inline
// (fila horizontal gigante de horas/chips) a un modal compacto con Select
// (día/horas, poblados con las MISMAS opciones que ya generaban
// generarOpcionesHorario/opcionesFinDesde — sin reimplementar esa regla) +
// Input (nombre/teléfono), abierto desde el botón "Nuevo turno fijo". Toda
// la lógica de validación/solape/choques/atomicidad de abajo es exactamente
// la misma que ya existía — el modal es la única pieza nueva, y solo decide
// CUÁNDO mostrarse (abierto hasta que el alta termina con éxito; se queda
// abierto ante cualquier error para que la persona no pierda lo tipeado ni
// el mensaje, mismo criterio que ya usa ProductoFormModal/ProductosView).
//
// TF-R3 — rediseño estructural: la sección "Turnos fijos activos" pasa de
// una fila por HORARIO a una tarjeta por TITULAR (agruparPorTitular, TF-R2
// ya daba titular_id en cada fila) con todos sus horarios debajo. El modal de
// alta agrega un SegmentedControl ("Nuevo titular" / "Titular existente"):
// el primer modo es el mismo formulario de siempre (crea titular + horario);
// el segundo reemplaza nombre/teléfono por TitularPicker y llama a
// agregarHorarioATitular (sin crear un titular nuevo). El botón "+ Agregar
// horario" de un grupo abre el mismo modal ya en modo "Titular existente"
// con ese titular preseleccionado. Link de baja/Copiar link pasan a ser por
// TITULAR (un solo token para todos sus horarios, ver useTurnosFijos desde
// TF-R2) en vez de por horario. Eliminar se separa en "eliminar un horario"
// vs "eliminar el titular completo"; si un horario eliminado individualmente
// era el último del titular, se elimina también el titular (preferencia
// explícita: no dejar titulares vacíos). Editar nombre/teléfono es nuevo
// (requería agregar la policy de UPDATE en titulares_turno_fijo, que no
// existía hasta TF-R3 — ver tf_r3_permitir_editar_titular).
//
// TF-R3.1 — el modo "Nuevo titular" del modal pasa de 1 único Día/Hora a una
// lista dinámica de horarios (mínimo 1, "+ Agregar horario"/"Quitar" por
// fila): se puede cargar un titular con varios horarios de una sola vez, en
// una operación atómica server-side (crear_titular_turno_fijo — titular + N
// horarios + sus excepciones si las hay, todo o nada). "Titular existente"
// NO cambia (pedido explícito: sigue siendo 1 solo horario por vez ahí).
//
// El toggle de turnos fijos en Reservas es C3 también, pero vive en
// ReservasView.tsx (no es una responsabilidad de esta vista).
//
// A diferencia de Agenda/Reservas (B8), esta vista NO queda montada con
// `hidden` entre cambios de tab — AdminShell la monta/desmonta como al resto
// de los placeholders (sin polling ni estado costoso que preservar todavía,
// no hace falta la complejidad de B8 acá).

import "./turnosFijosAlta.css";
import { TimePicker } from "../../../components/ui/TimePicker";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Copy, Pencil, Plus, Repeat, Trash2, User, X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { IconButton } from "../../../components/ui/IconButton";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { extenderReserva, generarOpcionesHorario, hoyISO, horaToMinutos, opcionesFinDesde, recortarHora } from "../../../lib/datetime";
import { limpiarTelefonoWa } from "../../../lib/format";
import { normalizarTelefonoArgentino } from "../../../lib/telefono";
import { useHorariosSemana } from "../configuracion/useHorariosSemana";
import { DIAS_SEMANA, type TurnoFijoConHorario } from "../agenda/agenda.logic";
import { ConfirmModal } from "../components/ConfirmModal";
import { useDialogFocus } from "../components/useDialogFocus";
import { IconWhatsapp } from "../icons";
import { obtenerReservasProximas } from "../reservas/reservas.api";
import { formatearBadgeFecha, ocurrenciasFijasVirtuales, procesarReservas } from "../reservas/reservas.logic";
import { TitularPicker } from "./TitularPicker";
import {
  actualizarTitular,
  agregarHorarioATitular,
  crearExcepcionTurnoFijo,
  crearExcepcionesTurnoFijo,
  crearTitularConHorarios,
  eliminarTitular,
  eliminarTurnoFijo,
  obtenerConfiguracionDuracion,
} from "./turnosFijos.api";
import {
  agruparPorTitular,
  buscarChoquesTurnoFijoConReservas,
  calcularFechaInicioReal,
  hayHorariosDuplicados,
  haySolapeEntreHorarios,
  haySolapeTurnoFijo,
  type TitularAgrupado,
} from "./turnosFijos.logic";
import type { UseTurnosFijosResult } from "./useTurnosFijos";

// C5.1 — fallback mientras no llegó la config real (o si el fetch falló):
// mismo mínimo de 60 que ya usaba este formulario antes de C5.1, sin techo
// (igual que el comportamiento previo) — nunca deja el formulario más
// restrictivo de lo que ya era, el servidor (trigger check_turno_fijo_duracion)
// es la autoridad real.
const DURACION_FALLBACK = { min: 60, max: null as number | null };

const DIAS_OPCIONES = [0, 1, 2, 3, 4, 5, 6] as const;

// PHONE-FIX — mensaje específico de teléfono inválido, mostrado junto al
// campo en vez del error genérico de guardado. Se usa tanto si lo detecta la
// validación de cliente (normalizarTelefonoArgentino, antes de enviar) como
// si lo detecta recién el servidor (error.code === ERRCODE_TELEFONO_INVALIDO
// — el 22023 que lanza validar_telefono_normalizable): el backend sigue
// siendo la autoridad real, esto solo evita mostrar "No se pudo guardar..."
// cuando SÍ podemos identificar que el problema fue el teléfono.
const ERROR_TELEFONO_INVALIDO = "El número de teléfono no es válido.";
const EJEMPLO_TELEFONO_VALIDO = "Ejemplo: 3775550100 o +54 9 3775 55-0100";
const ERRCODE_TELEFONO_INVALIDO = "22023";

// admin.html:2541 (PRÓXIMAS OCURRENCIAS (14 DÍAS)) — mismo horizonte que
// proximasOcurrenciasFijas, la función del legacy propia de esta pestaña
// (independiente de la de Reservas, con horizonte de 90 días).
const HORIZONTE_OCURRENCIAS_DIAS = 14;

export interface TurnosFijosViewProps {
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
  // C3 — instancia única de useTurnosFijos que crea AdminShell y comparte por
  // props (sin Context/provider) — ver useTurnosFijos.ts.
  turnosFijos: UseTurnosFijosResult;
}

interface MensajeForm {
  tipo: "error" | "ok";
  texto: string;
}

type ModoAlta = "nuevo" | "existente";

// TF-R3.1 — una fila del formulario de "Nuevo titular", antes de submit (sin
// `fechasChoqueUnicas` todavía — eso se calcula recién en alSubmit, una vez
// por horario, igual que ya hacía la versión de 1 solo horario). `key` es
// puramente de React (identidad de fila para el .map/agregar/quitar), nunca
// viaja al servidor.
interface HorarioFormRow {
  key: string;
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
}

function nuevaFilaHorario(diaSemana = 1): HorarioFormRow {
  return { key: crypto.randomUUID(), diaSemana, horaInicio: "", horaFin: "" };
}

interface HorarioAltaConChoques {
  diaNum: number;
  horaInicio: string;
  horaFin: string;
  fechasChoqueUnicas: string[];
}

// TF-R3.1 — "nuevo" pasa a cargar SIEMPRE un array de horarios (1 horario es
// simplemente el caso de longitud 1, no un camino aparte). "existente" NO
// cambia (pedido explícito: sin multi-agregado ahí todavía) — mantiene el
// mismo shape plano de antes (nombre/telefono vienen del titular elegido,
// no se piden de nuevo).
type DatosAlta =
  | { modo: "nuevo"; nombre: string; telefono: string; horarios: HorarioAltaConChoques[] }
  | ({ modo: "existente"; titularId: string; nombre: string; telefono: string } & HorarioAltaConChoques);

type ConfirmacionAlta = DatosAlta & { mensaje: string };

interface EliminarHorarioModalState {
  id: string;
  titularId: string;
  esUltimoHorario: boolean;
  label: string;
}

interface EliminarTitularModalState {
  titularId: string;
  nombre: string;
  cantidadHorarios: number;
}

interface EditarTitularModalState {
  titularId: string;
  nombre: string;
  telefono: string;
}

export function TurnosFijosView({ mostrarToast, turnosFijos }: TurnosFijosViewProps) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [tituloModal, setTituloModal] = useState("Nuevo turno fijo");
  const [modoAlta, setModoAlta] = useState<ModoAlta>("nuevo");
  const [titularIdElegido, setTitularIdElegido] = useState("");
  const [diaSemana, setDiaSemana] = useState<number>(1);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  // PHONE-FIX — error específico junto al campo, separado de `mensaje`
  // (que sigue cubriendo el resto de las validaciones del form).
  const [telefonoError, setTelefonoError] = useState<string | null>(null);
  // TF-R3.1 — lista de horarios del modo "Nuevo titular" (siempre >= 1 fila).
  const [horariosNuevos, setHorariosNuevos] = useState<HorarioFormRow[]>([nuevaFilaHorario()]);
  const [mensaje, setMensaje] = useState<MensajeForm | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmacion, setConfirmacion] = useState<ConfirmacionAlta | null>(null);
  const altaFocus = useDialogFocus(cerrarModal, guardando, { active: modalAbierto, modal: true });

  // TF-R3 — una tarjeta por titular en vez de una fila por horario. Pura,
  // sin fetch nuevo: agruparPorTitular deriva todo de turnosFijos.turnosFijos
  // (ya cargado por useTurnosFijos), recalculada solo cuando esa lista cambia.
  const titularesAgrupados = useMemo(
    () => agruparPorTitular(turnosFijos.turnosFijos),
    [turnosFijos.turnosFijos],
  );
  const titularElegido = titularesAgrupados.find((t) => t.titularId === titularIdElegido);

  // C5.1 — duración mínima/máxima real de la cancha (configuracion_cancha,
  // vista pública), traída una sola vez: reemplaza el mínimo de 60
  // hardcodeado que tenía este formulario y agrega el máximo, que antes no
  // existía acá (se podía armar un turno fijo de cualquier largo hasta el
  // cierre). DURACION_FALLBACK mientras no resuelve o si falla — el servidor
  // (trigger check_turno_fijo_duracion) es quien realmente hace cumplir esto.
  const [duracionCancha, setDuracionCancha] = useState<{ min: number; max: number | null }>(DURACION_FALLBACK);

  useEffect(() => {
    let cancelado = false;
    obtenerConfiguracionDuracion().then(({ data, error }) => {
      if (cancelado || error || data == null || data.duracion_minima_minutos == null) return;
      setDuracionCancha({ min: data.duracion_minima_minutos, max: data.duracion_maxima_minutos });
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const [eliminarHorarioModal, setEliminarHorarioModal] = useState<EliminarHorarioModalState | null>(null);
  const [eliminandoHorarioId, setEliminandoHorarioId] = useState<string | null>(null);

  const [eliminarTitularModal, setEliminarTitularModal] = useState<EliminarTitularModalState | null>(null);
  const [eliminandoTitularId, setEliminandoTitularId] = useState<string | null>(null);

  const [editarModal, setEditarModal] = useState<EditarTitularModalState | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  // PHONE-FIX — mismo criterio que `telefonoError` de arriba, para el modal
  // de edición.
  const [editTelefonoError, setEditTelefonoError] = useState<string | null>(null);
  const [mensajeEdicion, setMensajeEdicion] = useState<string | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const [ocurrenciaModal, setOcurrenciaModal] = useState<{ turnoFijoId: string; fecha: string } | null>(null);
  const [procesandoOcurrencia, setProcesandoOcurrencia] = useState(false);

  // CFG-F2 — horario REAL de `diaSemana` (horarios_semana), reemplaza los
  // 08:00/01:00 hardcodeados de configCancha: un turno fijo se repite todas
  // las semanas en un día de semana (sin fecha propia), así que una fecha
  // especial no le aplica — horarios_semana (el horario base) es la fuente
  // correcta. Si ese día está cerrado, no hay ningún horario que ofrecer —
  // nunca un fallback silencioso.
  const { dias: horariosSemana } = useHorariosSemana();

  // TF-R3.1 — extraídos a funciones (antes eran 4 consts calculadas una sola
  // vez para el único Día/Hora del formulario) para poder resolver lo mismo
  // por CADA fila del modo "Nuevo titular", sin duplicar la lógica. El modo
  // "existente" sigue usando el mismo único Día/Hora de siempre, ahora vía
  // estas funciones con `diaSemana`/`horaInicio` (ver consts de abajo) —
  // mismo resultado exacto que antes, cero cambio de comportamiento ahí.
  function resolverHorarioDia(dia: number) {
    return horariosSemana.find((d) => d.diaSemana === dia);
  }
  function aperturaMinDeDia(dia: number): number | null {
    const hd = resolverHorarioDia(dia);
    return hd?.abierto && hd.horaApertura ? horaToMinutos(hd.horaApertura) : null;
  }
  function opcionesHorarioDeDia(dia: number): string[] {
    const hd = resolverHorarioDia(dia);
    return hd?.abierto && hd.horaApertura && hd.horaCierre ? generarOpcionesHorario(hd.horaApertura, hd.horaCierre) : [];
  }
  function opcionesFinDeDia(dia: number, horaInicioElegida: string): string[] {
    const hd = resolverHorarioDia(dia);
    return hd?.abierto && hd.horaApertura && hd.horaCierre
      ? opcionesFinDesde(horaInicioElegida, hd.horaApertura, hd.horaCierre, duracionCancha.min, duracionCancha.max ?? undefined)
      : [];
  }

  // CFG-F2 — horario REAL de `diaSemana` (horarios_semana), reemplaza los
  // 08:00/01:00 hardcodeados de configCancha: un turno fijo se repite todas
  // las semanas en un día de semana (sin fecha propia), así que una fecha
  // especial no le aplica — horarios_semana (el horario base) es la fuente
  // correcta. Si ese día está cerrado, no hay ningún horario que ofrecer —
  // nunca un fallback silencioso. Solo lo usa el modo "existente" (único
  // Día/Hora, sin filas).
  const horarioDia = resolverHorarioDia(diaSemana);
  const aperturaDiaMin = aperturaMinDeDia(diaSemana);
  const opcionesHorario = opcionesHorarioDeDia(diaSemana);
  const opcionesFin = opcionesFinDeDia(diaSemana, horaInicio);

  function resetForm() {
    setModoAlta("nuevo");
    setTitularIdElegido("");
    setDiaSemana(1);
    setHoraInicio("");
    setHoraFin("");
    setNombre("");
    setTelefono("");
    setTelefonoError(null);
    setHorariosNuevos([nuevaFilaHorario()]);
  }

  // TF-R3.1 — manipulación de filas del modo "Nuevo titular". Cambiar el día
  // de una fila resetea SU PROPIA hora (mismo motivo que el único Día/Hora
  // de "existente": el horario real puede cambiar de un día a otro).
  function actualizarFilaHorario(key: string, cambios: Partial<Omit<HorarioFormRow, "key">>) {
    setHorariosNuevos((filas) => filas.map((f) => (f.key === key ? { ...f, ...cambios } : f)));
  }
  function agregarFilaHorario() {
    setHorariosNuevos((filas) => [...filas, nuevaFilaHorario(filas[filas.length - 1]?.diaSemana ?? 1)]);
  }
  // Nunca deja la lista en 0 filas (al menos 1 horario es obligatorio) — el
  // botón de quitar ni se muestra cuando queda una sola fila (ver JSX).
  function quitarFilaHorario(key: string) {
    setHorariosNuevos((filas) => (filas.length <= 1 ? filas : filas.filter((f) => f.key !== key)));
  }

  function abrirModalNuevo() {
    setMensaje(null);
    resetForm();
    setTituloModal("Nuevo turno fijo");
    setModalAbierto(true);
  }

  // TF-R3 — "+ Agregar horario" de un grupo: mismo modal, ya en modo
  // "Titular existente" con ese titular preseleccionado (se puede cambiar
  // de todos modos, el SegmentedControl sigue interactivo).
  function abrirModalParaTitular(titular: TitularAgrupado) {
    setMensaje(null);
    resetForm();
    setModoAlta("existente");
    setTitularIdElegido(titular.titularId);
    setTituloModal(`Agregar horario · ${titular.nombre}`);
    setModalAbierto(true);
  }

  function cerrarModal() {
    if (guardando) return;
    setModalAbierto(false);
    setMensaje(null);
    resetForm();
  }

  // admin.html:1929-1948 (guardarTurnoFijo). Branch único según datos.modo:
  //
  // "existente" — SIN CAMBIOS de TF-R3 (pedido explícito de TF-R3.1: sin
  // multi-agregado ahí todavía): agregarHorarioATitular + excepciones en un
  // segundo paso separado, con el mismo rollback best-effort de siempre
  // (eliminarTurnoFijo si crearExcepcionesTurnoFijo falla).
  //
  // "nuevo" — TF-R3.1: YA NO hace 2 inserts de cliente con rollback
  // best-effort. Una sola llamada a crear_titular_turno_fijo (titular + N
  // horarios + sus excepciones, todo en la misma transacción server-side) —
  // si algo falla, el servidor no deja nada creado, así que acá no hay nada
  // que revertir. Ver turnosFijos.api.ts / el SQL de la RPC.
  async function confirmarAlta(datos: DatosAlta) {
    setGuardando(true);

    if (datos.modo === "existente") {
      const { data: nuevo, error: errorCrear } = await agregarHorarioATitular(
        datos.titularId,
        datos.diaNum,
        datos.horaInicio,
        datos.horaFin,
      );
      if (errorCrear || !nuevo) {
        setGuardando(false);
        setConfirmacion(null);
        setMensaje({ tipo: "error", texto: "No se pudo guardar el turno fijo." });
        return;
      }

      if (datos.fechasChoqueUnicas.length > 0) {
        const { error: errorExcepciones } = await crearExcepcionesTurnoFijo(nuevo.id, datos.fechasChoqueUnicas);
        if (errorExcepciones) {
          const { error: errorRollback } = await eliminarTurnoFijo(nuevo.id);
          setGuardando(false);
          setConfirmacion(null);
          if (!errorRollback) {
            setMensaje({ tipo: "error", texto: "No se pudo completar el alta del turno fijo. Probá de nuevo." });
          } else {
            // Rollback también falló: queda un turno fijo real en la base sin
            // sus excepciones — recargar desde el servidor en vez de adivinar
            // el estado localmente, y avisar fuerte que hace falta revisión
            // manual (mismo criterio que "revisá sus pagos en Jugados" del
            // legacy para materializar_turnos_fijos_jugados).
            turnosFijos.recargar();
            setMensaje({
              tipo: "error",
              texto: "Quedó un turno fijo a medio crear que requiere revisión manual — avisá al encargado del sistema.",
            });
          }
          return;
        }
      }

      turnosFijos.agregarTurnoFijoLocal({
        id: nuevo.id,
        dia_semana: nuevo.dia_semana,
        titular_id: nuevo.titular_id,
        nombre: datos.nombre,
        telefono: datos.telefono,
        horaInicio: recortarHora(nuevo.hora_inicio)!,
        horaFin: recortarHora(nuevo.hora_fin)!,
        creado: nuevo.creado,
      });
      if (datos.fechasChoqueUnicas.length > 0) {
        turnosFijos.agregarExcepcionesLocal(
          datos.fechasChoqueUnicas.map((fecha, i) => ({
            id: `local-${nuevo.id}-${i}`,
            turno_fijo_id: nuevo.id,
            fecha,
            creado: null,
          })),
        );
      }

      setGuardando(false);
      setConfirmacion(null);
      setModalAbierto(false);
      resetForm();
      mostrarToast("Turno fijo agregado.", "ok");
      return;
    }

    const { data: creado, error } = await crearTitularConHorarios(
      datos.nombre,
      datos.telefono,
      datos.horarios.map((h) => ({
        dia_semana: h.diaNum,
        hora_inicio: h.horaInicio,
        hora_fin: h.horaFin,
        excepciones: h.fechasChoqueUnicas,
      })),
    );
    if (error || !creado) {
      setGuardando(false);
      setConfirmacion(null);
      // PHONE-FIX — defensa además de la validación de cliente (que ya debería
      // haber atajado esto antes de llegar acá): si de todos modos el
      // servidor rechaza por teléfono inválido (22023, validar_telefono_
      // normalizable), mostrar el mensaje específico junto al campo en vez
      // del genérico.
      if (error?.code === ERRCODE_TELEFONO_INVALIDO) {
        setTelefonoError(ERROR_TELEFONO_INVALIDO);
      } else {
        setMensaje({ tipo: "error", texto: "No se pudo guardar el turno fijo." });
      }
      return;
    }

    for (const turno of creado.turnos) {
      turnosFijos.agregarTurnoFijoLocal({
        id: turno.id,
        dia_semana: turno.dia_semana,
        titular_id: creado.titular_id,
        nombre: creado.nombre,
        telefono: creado.telefono,
        horaInicio: turno.hora_inicio,
        horaFin: turno.hora_fin,
        // El `creado` REAL del servidor (la RPC lo devuelve); el reloj del
        // navegador solo como último recurso si la clave no vino.
        creado: turno.creado ?? new Date().toISOString(),
      });
    }
    const excepcionesNuevas = creado.turnos.flatMap((turno) =>
      turno.excepciones.map((fecha, i) => ({ id: `local-${turno.id}-${i}`, turno_fijo_id: turno.id, fecha, creado: null })),
    );
    if (excepcionesNuevas.length > 0) turnosFijos.agregarExcepcionesLocal(excepcionesNuevas);

    setGuardando(false);
    setConfirmacion(null);
    setModalAbierto(false);
    resetForm();
    mostrarToast(creado.turnos.length === 1 ? "Turno fijo agregado." : `${creado.turnos.length} turnos fijos agregados.`, "ok");
  }

  // admin.html:1950-2005 (agregarTurnoFijo): validación de campos -> solape
  // con otros fijos -> fetch fresco de reservas próximas para buscar choques
  // -> sin choques guarda directo, con choques pide confirmación.
  //
  // TF-R3.1 — "existente" queda EXACTAMENTE igual que en TF-R3 (1 único
  // horario). "nuevo" pasa a validar/armar choques por CADA fila de
  // horariosNuevos — ver bloque de abajo, separado a propósito en vez de
  // generalizar ambos modos bajo el mismo código: son formas demasiado
  // distintas (1 horario con nombre/telefono ya resueltos vs. N horarios
  // + datos del titular) para que forzarlas a compartir código simplifique
  // algo de verdad.
  async function alSubmit(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);

    if (modoAlta === "existente") {
      if (!horaInicio || !horaFin) {
        setMensaje({ tipo: "error", texto: "Completá todos los campos." });
        return;
      }
      if (!titularElegido) {
        setMensaje({ tipo: "error", texto: "Elegí un titular." });
        return;
      }
      // CFG-F2 — defensa igual que la de abajo: en el flujo normal `horaInicio`
      // solo puede venir de `opcionesHorario`, que ya queda vacío si el día está
      // cerrado — esto solo actúa ante un horario que cambió entre que se abrió
      // el modal y se envió el form.
      if (aperturaDiaMin == null) {
        setMensaje({ tipo: "error", texto: "Ese día de la semana está cerrado en la configuración de horarios." });
        return;
      }
      // C5.1 — chequeo de cliente (defensa adicional, no la autoridad real: eso
      // es el trigger check_turno_fijo_duracion en el servidor).
      const { ini, fin } = extenderReserva(horaInicio, horaFin, aperturaDiaMin);
      const duracionElegida = fin - ini;
      if (duracionElegida < duracionCancha.min || (duracionCancha.max != null && duracionElegida > duracionCancha.max)) {
        setMensaje({
          tipo: "error",
          texto: `La duración debe ser de entre ${duracionCancha.min} y ${duracionCancha.max ?? "∞"} minutos.`,
        });
        return;
      }
      if (haySolapeTurnoFijo(diaSemana, horaInicio, horaFin, turnosFijos.turnosFijos, aperturaDiaMin)) {
        setMensaje({ tipo: "error", texto: "Ya existe otro turno fijo que ocupa ese horario en este día." });
        return;
      }

      setGuardando(true);
      const { data: reservasCrudas, error: errorReservas } = await obtenerReservasProximas(hoyISO());
      if (errorReservas) {
        setGuardando(false);
        setMensaje({ tipo: "error", texto: "No se pudo verificar choques con reservas. Probá de nuevo." });
        return;
      }
      const { vigentes } = procesarReservas(reservasCrudas, Date.now());
      const choques = buscarChoquesTurnoFijoConReservas(
        diaSemana,
        horaInicio,
        horaFin,
        vigentes,
        aperturaDiaMin,
        Date.now(),
        90,
      );

      const datos: DatosAlta = {
        modo: "existente",
        titularId: titularElegido.titularId,
        diaNum: diaSemana,
        horaInicio,
        horaFin,
        nombre: titularElegido.nombre,
        telefono: titularElegido.telefono,
        fechasChoqueUnicas: [],
      };

      if (choques.length === 0) {
        await confirmarAlta(datos);
        return;
      }

      setGuardando(false);
      const fechasChoqueUnicas = [...new Set(choques.map((c) => c.fecha))];
      const fechaInicioReal = calcularFechaInicioReal(diaSemana, fechasChoqueUnicas, Date.now(), 90, {
        horaInicio,
        aperturaMin: aperturaDiaMin,
      });
      const detalle = fechasChoqueUnicas
        .map((fecha) => {
          const choque = choques.find((c) => c.fecha === fecha)!;
          const quien = choque.reserva.bloqueado ? "horario bloqueado" : choque.reserva.nombre || "una reserva";
          return `${formatearBadgeFecha(fecha)} (${quien})`;
        })
        .join(", ");
      const mensajeConfirmacion = `${fechasChoqueUnicas.length === 1 ? "El día" : "Los días"} ${detalle} ya hay algo cargado en ese horario, así que ${fechasChoqueUnicas.length === 1 ? "esa fecha se excluye" : "esas fechas se excluyen"} automáticamente del turno fijo. ${fechaInicioReal ? `Recién va a arrancar el ${formatearBadgeFecha(fechaInicioReal)}` : "No queda ninguna fecha libre para este turno en los próximos 90 días"} — de ahí en más se repite cada semana con normalidad.`;

      setConfirmacion({ ...datos, fechasChoqueUnicas, mensaje: mensajeConfirmacion });
      return;
    }

    // modo "nuevo" — TF-R3.1
    if (!nombre || !telefono) {
      setMensaje({ tipo: "error", texto: "Completá todos los campos." });
      return;
    }
    // PHONE-FIX — validación de formato ANTES de tocar el servidor: mismo
    // algoritmo que normalize_phone() (ver lib/telefono.ts), así que lo que
    // pasa acá es justamente lo que el backend va a aceptar.
    if (!normalizarTelefonoArgentino(telefono)) {
      setTelefonoError(ERROR_TELEFONO_INVALIDO);
      return;
    }
    setTelefonoError(null);
    if (horariosNuevos.some((f) => !f.horaInicio || !f.horaFin)) {
      setMensaje({ tipo: "error", texto: "Completá todos los campos." });
      return;
    }

    const filaCerrada = horariosNuevos.find((f) => aperturaMinDeDia(f.diaSemana) == null);
    if (filaCerrada) {
      setMensaje({
        tipo: "error",
        texto: `Los ${DIAS_SEMANA[filaCerrada.diaSemana].toLowerCase()} la cancha está cerrada en la configuración de horarios.`,
      });
      return;
    }

    for (const f of horariosNuevos) {
      const apertura = aperturaMinDeDia(f.diaSemana)!;
      const { ini, fin } = extenderReserva(f.horaInicio, f.horaFin, apertura);
      const duracionElegida = fin - ini;
      if (duracionElegida < duracionCancha.min || (duracionCancha.max != null && duracionElegida > duracionCancha.max)) {
        setMensaje({
          tipo: "error",
          texto: `La duración debe ser de entre ${duracionCancha.min} y ${duracionCancha.max ?? "∞"} minutos.`,
        });
        return;
      }
    }

    // TF-R3.1 — dos chequeos client-side nuevos, ambos DENTRO de la lista que
    // se está cargando (no contra la base): duplicados exactos primero
    // (mensaje más específico y más barato de calcular), después solapes
    // parciales. El servidor los detecta igual (mismo trigger de siempre,
    // ahora corre también entre los horarios de esta misma alta — ver
    // turnosFijos.api.ts) — esto es solo feedback inmediato.
    const horariosParaChequeo = horariosNuevos.map((f) => ({
      diaSemana: f.diaSemana,
      horaInicio: f.horaInicio,
      horaFin: f.horaFin,
    }));
    if (hayHorariosDuplicados(horariosParaChequeo)) {
      setMensaje({ tipo: "error", texto: "Hay horarios repetidos en la lista." });
      return;
    }
    if (haySolapeEntreHorarios(horariosParaChequeo, aperturaMinDeDia)) {
      setMensaje({ tipo: "error", texto: "Hay horarios que se superponen entre sí en la lista." });
      return;
    }

    // Chequea cada fila contra TODOS los horarios ya existentes (cualquier
    // titular) — mismo criterio que "existente".
    const filaSuperpuesta = horariosNuevos.find((f) =>
      haySolapeTurnoFijo(f.diaSemana, f.horaInicio, f.horaFin, turnosFijos.turnosFijos, aperturaMinDeDia(f.diaSemana)!),
    );
    if (filaSuperpuesta) {
      setMensaje({ tipo: "error", texto: "Ya existe otro turno fijo que ocupa ese horario en este día." });
      return;
    }

    setGuardando(true);
    const { data: reservasCrudas, error: errorReservas } = await obtenerReservasProximas(hoyISO());
    if (errorReservas) {
      setGuardando(false);
      setMensaje({ tipo: "error", texto: "No se pudo verificar choques con reservas. Probá de nuevo." });
      return;
    }
    const { vigentes } = procesarReservas(reservasCrudas, Date.now());

    const choquesPorHorario = horariosNuevos.map((f) =>
      buscarChoquesTurnoFijoConReservas(
        f.diaSemana,
        f.horaInicio,
        f.horaFin,
        vigentes,
        aperturaMinDeDia(f.diaSemana)!,
        Date.now(),
        90,
      ),
    );
    const horariosConChoques: HorarioAltaConChoques[] = horariosNuevos.map((f, i) => ({
      diaNum: f.diaSemana,
      horaInicio: f.horaInicio,
      horaFin: f.horaFin,
      fechasChoqueUnicas: [...new Set(choquesPorHorario[i].map((c) => c.fecha))],
    }));

    const datos: DatosAlta = { modo: "nuevo", nombre, telefono, horarios: horariosConChoques };
    const totalChoques = horariosConChoques.reduce((acc, h) => acc + h.fechasChoqueUnicas.length, 0);
    if (totalChoques === 0) {
      await confirmarAlta(datos);
      return;
    }

    setGuardando(false);
    // Un párrafo por horario con choques (mismo mensaje que "existente",
    // con un prefijo día+horario para distinguirlos entre sí).
    const mensajeConfirmacion = horariosConChoques
      .map((h, i) => ({ h, choques: choquesPorHorario[i] }))
      .filter(({ h }) => h.fechasChoqueUnicas.length > 0)
      .map(({ h, choques }) => {
        const fechaInicioReal = calcularFechaInicioReal(h.diaNum, h.fechasChoqueUnicas, Date.now(), 90, {
          horaInicio: h.horaInicio,
          aperturaMin: aperturaMinDeDia(h.diaNum),
        });
        const detalle = h.fechasChoqueUnicas
          .map((fecha) => {
            const choque = choques.find((c) => c.fecha === fecha)!;
            const quien = choque.reserva.bloqueado ? "horario bloqueado" : choque.reserva.nombre || "una reserva";
            return `${formatearBadgeFecha(fecha)} (${quien})`;
          })
          .join(", ");
        return `${DIAS_SEMANA[h.diaNum]} ${h.horaInicio}-${h.horaFin}: ${h.fechasChoqueUnicas.length === 1 ? "el día" : "los días"} ${detalle} ya hay algo cargado en ese horario, así que ${h.fechasChoqueUnicas.length === 1 ? "esa fecha se excluye" : "esas fechas se excluyen"} automáticamente del turno fijo. ${fechaInicioReal ? `Recién va a arrancar el ${formatearBadgeFecha(fechaInicioReal)}` : "No queda ninguna fecha libre para este turno en los próximos 90 días"} — de ahí en más se repite cada semana con normalidad.`;
      })
      .join("\n\n");

    setConfirmacion({ ...datos, mensaje: mensajeConfirmacion });
  }

  // TF-R3 — separa "eliminar un horario puntual" de "eliminar el titular
  // completo" (antes eran lo mismo: cada fila era un titular con 1 horario).
  // Si este es el único horario del titular, el mensaje avisa que también se
  // va a eliminar el titular y su link — preferencia explícita del pedido,
  // no dejar titulares sin ningún horario.
  function pedirEliminarHorario(grupo: TitularAgrupado, horario: TurnoFijoConHorario) {
    const esUltimoHorario = grupo.horarios.length === 1;
    setEliminarHorarioModal({
      id: horario.id,
      titularId: grupo.titularId,
      esUltimoHorario,
      label: `${DIAS_SEMANA[horario.dia_semana]} ${horario.horaInicio}-${horario.horaFin} · ${grupo.nombre}`,
    });
  }

  // admin.html:2007-2017 (eliminarTurnoFijo) — patch local solo si el delete
  // remoto sale bien; error no toca el estado (el turno sigue en la lista).
  async function confirmarEliminarHorario() {
    if (!eliminarHorarioModal || eliminandoHorarioId) return;
    const { id, titularId, esUltimoHorario } = eliminarHorarioModal;
    setEliminandoHorarioId(id);
    const { error } = await eliminarTurnoFijo(id);
    if (error) {
      mostrarToast("No se pudo eliminar. Probá de nuevo.", "error");
      setEliminandoHorarioId(null);
      setEliminarHorarioModal(null);
      return;
    }
    turnosFijos.quitarTurnoFijoLocal(id);
    if (esUltimoHorario) {
      const { error: errorTitular } = await eliminarTitular(titularId);
      if (!errorTitular) {
        turnosFijos.quitarTitularLocal(titularId);
      } else {
        // El horario ya se eliminó (y ya se sacó del estado) — no revertir
        // eso por un fallo puntual de limpieza secundaria. Queda un titular
        // sin horarios hasta que se reintente eliminarlo a mano.
        mostrarToast("El horario se eliminó, pero no se pudo quitar el titular vacío. Probá de nuevo.", "error");
      }
    }
    setEliminandoHorarioId(null);
    setEliminarHorarioModal(null);
  }

  // TF-R3 — eliminar el TITULAR completo (todos sus horarios, excepciones y
  // token via ON DELETE CASCADE, confirmado en TF-R2) — acción separada y
  // deliberadamente más grande/destructiva que "eliminar un horario".
  function pedirEliminarTitular(grupo: TitularAgrupado) {
    setEliminarTitularModal({ titularId: grupo.titularId, nombre: grupo.nombre, cantidadHorarios: grupo.horarios.length });
  }

  async function confirmarEliminarTitular() {
    if (!eliminarTitularModal || eliminandoTitularId) return;
    const { titularId } = eliminarTitularModal;
    setEliminandoTitularId(titularId);
    const { error } = await eliminarTitular(titularId);
    if (error) {
      mostrarToast("No se pudo eliminar. Probá de nuevo.", "error");
    } else {
      turnosFijos.quitarTitularLocal(titularId);
    }
    setEliminandoTitularId(null);
    setEliminarTitularModal(null);
  }

  // TF-R3 — editar nombre/telefono sin borrar/recrear el titular (romper su
  // identidad/token). Requiere la policy de UPDATE agregada en esta misma
  // etapa (ver turnosFijos.api.ts).
  function abrirEditar(grupo: TitularAgrupado) {
    setMensajeEdicion(null);
    setEditTelefonoError(null);
    setEditNombre(grupo.nombre);
    setEditTelefono(grupo.telefono);
    setEditarModal({ titularId: grupo.titularId, nombre: grupo.nombre, telefono: grupo.telefono });
  }

  function cerrarEditar() {
    if (guardandoEdicion) return;
    setEditarModal(null);
    setMensajeEdicion(null);
    setEditTelefonoError(null);
  }

  async function guardarEdicion(e: FormEvent) {
    e.preventDefault();
    if (!editarModal) return;
    const nombreTrim = editNombre.trim();
    if (!nombreTrim || !editTelefono) {
      setMensajeEdicion("Completá nombre y teléfono.");
      return;
    }
    // PHONE-FIX — mismo criterio que el alta: validar formato antes de tocar
    // el servidor, con el mismo algoritmo que normalize_phone().
    if (!normalizarTelefonoArgentino(editTelefono)) {
      setEditTelefonoError(ERROR_TELEFONO_INVALIDO);
      return;
    }
    setEditTelefonoError(null);
    setGuardandoEdicion(true);
    const { data, error } = await actualizarTitular(editarModal.titularId, nombreTrim, editTelefono);
    setGuardandoEdicion(false);
    if (error || !data) {
      // PHONE-FIX — defensa igual que en el alta: si el servidor rechaza por
      // 22023 (debería ser raro, la validación de arriba ya lo cubre), mensaje
      // específico junto al campo en vez del genérico.
      if (error?.code === ERRCODE_TELEFONO_INVALIDO) {
        setEditTelefonoError(ERROR_TELEFONO_INVALIDO);
      } else {
        setMensajeEdicion("No se pudo guardar. Probá de nuevo.");
      }
      return;
    }
    turnosFijos.actualizarTitularLocal(editarModal.titularId, data.nombre, data.telefono);
    setEditarModal(null);
    mostrarToast("Titular actualizado.", "ok");
  }

  // admin.html:2051-2067 (compartirLinkBaja). `api.whatsapp.com` (no `wa.me`)
  // — decisión C3: es más estable en PC y celular, no se unifica.
  //
  // C7 — "4 horas" hardcodeado -> cancelacion_horas_minimas real. Se trae
  // FRESCO en cada click (no se reusa duracionCancha/su efecto de arriba, ni
  // se cachea en un state): a diferencia de la duración (donde el servidor
  // igual hace cumplir el rango vía trigger aunque el formulario tuviera un
  // valor stale), este número es puramente informativo — un valor viejo acá
  // le mostraría al jugador un plazo distinto del que realmente aplica en
  // /baja/. Sin fallback silencioso a 4: si falla, se avisa y no se manda
  // ningún mensaje con un plazo potencialmente incorrecto.
  //
  // TF-R3 — pasa a ser por TITULAR (un solo link para todos sus horarios),
  // no por horario individual: cualquiera de sus turno_fijo_id resuelve al
  // mismo titular_id/token (ver useTurnosFijos.obtenerOCrearToken), así que
  // alcanza con pedirlo para el primero de la lista ya ordenada del grupo. El
  // mensaje ya no menciona un horario puntual — /baja/ lista todos.
  async function compartirLinkBaja(grupo: TitularAgrupado) {
    const token = await turnosFijos.obtenerOCrearToken(grupo.horarios[0].id);
    if (!token) {
      mostrarToast("No se pudo generar el link. Probá de nuevo.", "error");
      return;
    }
    const { data: config, error: configError } = await obtenerConfiguracionDuracion();
    if (configError || config?.cancelacion_horas_minimas == null) {
      mostrarToast("No se pudo obtener el plazo de cancelación. Probá de nuevo.", "error");
      return;
    }
    const link = `${window.location.origin}/baja/?t=${token}`;
    // Códigos de punto Unicode explícitos (no el emoji literal) — mismo
    // criterio del legacy para evitar que un bundler rompa el caracter.
    const emojiPelota = String.fromCodePoint(127934);
    const emojiDedo = String.fromCodePoint(128073);
    const mensaje = `¡Hola ${grupo.nombre}! ${emojiPelota} Te compartimos el link de tus turnos fijos.\n\nSi alguna semana no podés venir a alguno, por favor ingresá al link para liberar la cancha ese día (tenés tiempo para avisar hasta ${config.cancelacion_horas_minimas} horas antes del turno).\n\n${emojiDedo} Guardate este mensaje para tenerlo a mano:\n${link}`;
    const wa = `https://api.whatsapp.com/send?phone=${limpiarTelefonoWa(grupo.telefono)}&text=${encodeURIComponent(mensaje)}`;
    window.open(wa, "_blank");
  }

  // TF-R3 — "[Copiar link de baja]" del wireframe: alternativa a abrir
  // WhatsApp directo, mismo token/link (obtenerOCrearToken ya cachea por
  // titular_id, así que no duplica el upsert si ya se pidió el de WhatsApp).
  async function copiarLink(grupo: TitularAgrupado) {
    const token = await turnosFijos.obtenerOCrearToken(grupo.horarios[0].id);
    if (!token) {
      mostrarToast("No se pudo generar el link. Probá de nuevo.", "error");
      return;
    }
    const link = `${window.location.origin}/baja/?t=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      mostrarToast("Link copiado.", "ok");
    } catch {
      mostrarToast("No se pudo copiar el link.", "error");
    }
  }

  // admin.html:2090-2105/2542 (proximasOcurrenciasFijas + PRÓXIMAS OCURRENCIAS).
  // Reusa ocurrenciasFijasVirtuales (ya escrita para el toggle de Reservas en
  // reservas.logic.ts) en vez de reimplementar el mismo recorrido — pero con
  // `reservasProximasRaw=[]` y horizonte de 14 días, no 90: esta lista
  // reproduce la semántica del legacy proximasOcurrenciasFijas, que NUNCA
  // excluía ocurrencias ya materializadas como reserva real (a diferencia del
  // toggle de Reservas, que sí las dedupea) — acá siguen apareciendo y siguen
  // siendo cancelables, así que no es una lista puramente informativa.
  //
  // TF-R3 — sigue siendo una lista PLANA ordenada por fecha (no por titular a
  // propósito): su utilidad es cronológica ("qué se juega pronto"), agruparla
  // por titular le haría perder ese orden sin aportar nada acá.
  const ocurrenciasFijas = ocurrenciasFijasVirtuales(
    turnosFijos.turnosFijos,
    turnosFijos.excepciones,
    [],
    Date.now(),
    HORIZONTE_OCURRENCIAS_DIAS,
    aperturaMinDeDia(new Date().getDay()),
  );

  function pedirCancelarOcurrencia(turnoFijoId: string, fecha: string) {
    setOcurrenciaModal({ turnoFijoId, fecha });
  }

  // admin.html:2019-2029 (cancelarOcurrencia) — mismo mensaje e id local que
  // la versión de AgendaDetalleSheet (AgendaView.tsx): alcanza con fecha +
  // turno_fijo_id para estaExceptuado, nunca se lee el id real.
  async function confirmarCancelarOcurrencia() {
    if (!ocurrenciaModal || procesandoOcurrencia) return;
    const { turnoFijoId, fecha } = ocurrenciaModal;
    setProcesandoOcurrencia(true);
    const { error } = await crearExcepcionTurnoFijo(turnoFijoId, fecha);
    if (error) {
      mostrarToast("No se pudo cancelar esa fecha. Probá de nuevo.", "error");
    } else {
      turnosFijos.agregarExcepcionLocal({ id: `local-${Date.now()}`, turno_fijo_id: turnoFijoId, fecha, creado: null });
    }
    setProcesandoOcurrencia(false);
    setOcurrenciaModal(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* R5.1 — borde izquierdo acento + Card elevated: esta es la sección
          "primaria" de la vista (los turnos que realmente están activos),
          diferenciada de "Próximas ocurrencias" (informativa/secundaria, más
          abajo) por peso visual, no solo por título. */}
      <Card
        variant="elevated"
        className="border-l-[3px] border-l-accent p-4"
        data-testid="turnos-fijos-activos"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
              <Repeat size={17} strokeWidth={2} />
            </span>
            <div>
              <h2 className="font-heading text-section-title font-bold text-text">Turnos fijos activos</h2>
              <p className="text-caption text-muted">
                {titularesAgrupados.length === 1
                  ? "1 titular cargado"
                  : `${titularesAgrupados.length} titulares cargados`}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={abrirModalNuevo}>
            <Plus size={15} strokeWidth={2.25} /> Nuevo turno fijo
          </Button>
        </div>
        {titularesAgrupados.length === 0 && <p className="text-sm text-muted">No hay turnos fijos cargados.</p>}
        <div className="flex flex-col gap-3">
          {titularesAgrupados.map((grupo) => (
            <div
              key={grupo.titularId}
              data-testid="grupo-titular"
              className="ui-transition rounded-md border border-border bg-surface p-3 hover:border-border-strong"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent-muted text-accent">
                    <User size={16} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <p className="truncate text-body-sm font-semibold text-text">{grupo.nombre}</p>
                      <IconButton
                        aria-label={`Editar ${grupo.nombre}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => abrirEditar(grupo)}
                      >
                        <Pencil size={13} strokeWidth={1.75} />
                      </IconButton>
                    </div>
                    <p className="truncate text-caption text-muted">
                      {grupo.telefono} · {grupo.horarios.length === 1 ? "1 horario" : `${grupo.horarios.length} horarios`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <IconButton aria-label="Copiar link de baja" variant="ghost" size="sm" onClick={() => copiarLink(grupo)}>
                    <Copy size={14} strokeWidth={1.75} />
                  </IconButton>
                  <button
                    type="button"
                    onClick={() => compartirLinkBaja(grupo)}
                    className="tap-fx ui-transition flex h-9 items-center justify-center gap-1.5 rounded-pill border border-[#25D366] px-3.5 text-[13px] font-semibold text-[#25D366] hover:bg-[#25D366]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  >
                    <IconWhatsapp size={14} /> Link de baja
                  </button>
                  <Button variant="destructive" size="sm" onClick={() => pedirEliminarTitular(grupo)}>
                    Eliminar titular
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                {grupo.horarios.map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{DIAS_SEMANA[h.dia_semana].slice(0, 3).toUpperCase()}</Badge>
                      <span className="text-body-sm font-semibold whitespace-nowrap text-text">
                        {h.horaInicio}-{h.horaFin}
                      </span>
                    </div>
                    <IconButton
                      aria-label={`Eliminar horario ${DIAS_SEMANA[h.dia_semana]} ${h.horaInicio}-${h.horaFin}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => pedirEliminarHorario(grupo, h)}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </IconButton>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => abrirModalParaTitular(grupo)}
                  className="tap-fx ui-transition flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-[12.5px] font-semibold text-muted hover:border-border-strong hover:text-text"
                >
                  <Plus size={13} strokeWidth={2} /> Agregar horario
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* R5.1 — mismo patrón de header que la sección de arriba pero con el
          cian "info" (ya es, por convención de tokens.css, el color de
          turnos fijos/estados neutrales-pero-destacados) en vez de acento:
          separa visualmente "lo activo" de "lo informativo" sin inventar un
          tercer color. Sin Card elevated acá a propósito — es la sección de
          menor peso de las dos. */}
      <Card className="border-l-[3px] border-l-info p-4" data-testid="proximas-ocurrencias-fijas">
        <div className="mb-3.5 flex items-center gap-2.5 border-b border-border pb-3.5">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-info-muted text-info">
            <CalendarClock size={17} strokeWidth={2} />
          </span>
          <div>
            <h2 className="font-heading text-section-title font-bold text-text">Próximas ocurrencias</h2>
            <p className="text-caption text-muted">
              Horizonte de 14 días — cancelá un día puntual sin borrar el turno fijo.
            </p>
          </div>
        </div>
        {ocurrenciasFijas.length === 0 && <p className="text-sm text-muted">No hay ocurrencias próximas.</p>}
        <div className="flex flex-col gap-2">
          {ocurrenciasFijas.map((o) => (
            <div
              key={`${o.turnoFijoId}-${o.fecha}`}
              className="ui-transition flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-2.5 hover:border-border-strong hover:bg-surface-hover"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="neutral">{formatearBadgeFecha(o.fecha)}</Badge>
                <span className="text-body-sm font-semibold whitespace-nowrap text-text">
                  {o.horaInicio}-{o.horaFin}
                </span>
                <span className="truncate text-body-sm text-muted">{o.nombre}</span>
              </div>
              <Button variant="destructive" size="sm" onClick={() => pedirCancelarOcurrencia(o.turnoFijoId, o.fecha)}>
                Cancelar este día
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {modalAbierto && (
        <div
          className="tf-alta-overlay overlay-anim fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-[rgba(5,10,7,0.7)] p-3 backdrop-blur-[3px] sm:p-5"
          onClick={cerrarModal}
        >
          <div
            {...altaFocus}
            className="modal-pop flex h-[min(620px,calc(100dvh-24px))] w-full max-w-[620px] flex-col overflow-hidden rounded-[16px] border border-border bg-surface sm:h-[min(620px,calc(100dvh-40px))]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={tituloModal}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <p className="text-[13px] font-bold tracking-wide text-text uppercase">{tituloModal}</p>
              <IconButton aria-label="Cerrar" variant="ghost" size="sm" onClick={cerrarModal} disabled={guardando}>
                <X size={18} strokeWidth={1.75} />
              </IconButton>
            </div>

            <form onSubmit={alSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
                <SegmentedControl
                  ariaLabel="Tipo de alta"
                  size="sm"
                  options={[
                    { value: "nuevo", label: "Nuevo titular" },
                    { value: "existente", label: "Titular existente" },
                  ]}
                  value={modoAlta}
                  onChange={(v) => {
                    setModoAlta(v);
                    setMensaje(null);
                    setTelefonoError(null);
                  }}
                  disabled={guardando}
                />

                {modoAlta === "nuevo" ? (
                  <>
                    <label className="text-xs text-muted">
                      Nombre y apellido
                      <Input
                        className="mt-1"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, ""))}
                        disabled={guardando}
                      />
                    </label>
                    <label className="text-xs text-muted">
                      Teléfono
                      <Input
                        className="mt-1"
                        value={telefono}
                        error={!!telefonoError}
                        onChange={(e) => {
                          setTelefono(e.target.value.replace(/[^0-9]/g, ""));
                          setTelefonoError(null);
                        }}
                        disabled={guardando}
                      />
                      {telefonoError && (
                        <span className="mt-1 block text-xs text-error">
                          {telefonoError}
                          <br />
                          <span className="text-[11px] text-muted">{EJEMPLO_TELEFONO_VALIDO}</span>
                        </span>
                      )}
                    </label>

                    {/* TF-R3.1 — lista dinámica de horarios: al menos 1 fila
                        siempre, "Quitar" solo aparece si hay más de una (nunca
                        se puede llegar a 0). Cada fila resuelve SUS PROPIAS
                        opciones de día/hora (aperturaMinDeDia/opcionesHorarioDeDia/
                        opcionesFinDeDia) — filas en días distintos pueden tener
                        horarios operativos distintos. */}
                    <div className="flex flex-col gap-2.5">
                      <span className="text-xs text-muted">Horarios</span>
                      {horariosNuevos.map((fila, i) => {
                        const horarioDiaFila = resolverHorarioDia(fila.diaSemana);
                        const opcionesHorarioFila = opcionesHorarioDeDia(fila.diaSemana);
                        const opcionesFinFila = opcionesFinDeDia(fila.diaSemana, fila.horaInicio);
                        return (
                          <div key={fila.key} className="rounded-md border border-border bg-surface-2 p-3">
                            <div className="flex min-h-8 items-center justify-between gap-2">
                              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
                                Horario {i + 1}
                              </span>
                              {horariosNuevos.length > 1 && (
                                <IconButton
                                  aria-label={`Quitar horario ${i + 1}`}
                                  className="max-sm:min-h-11 max-sm:min-w-11"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => quitarFilaHorario(fila.key)}
                                  disabled={guardando}
                                >
                                  <X size={14} strokeWidth={1.75} />
                                </IconButton>
                              )}
                            </div>
                            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-[1.1fr_1fr_1fr] sm:gap-3">
                              <label className="col-span-2 min-w-0 text-xs text-muted sm:col-span-1">
                                Día
                                <Select
                                  aria-label={`Día de la semana · Horario ${i + 1}`}
                                  className="mt-1 min-h-11"
                                  value={fila.diaSemana}
                                  onChange={(e) =>
                                    actualizarFilaHorario(fila.key, {
                                      diaSemana: Number(e.target.value),
                                      horaInicio: "",
                                      horaFin: "",
                                    })
                                  }
                                  disabled={guardando}
                                >
                                  {DIAS_OPCIONES.map((d) => (
                                    <option key={d} value={d}>
                                      {DIAS_SEMANA[d]}
                                    </option>
                                  ))}
                                </Select>
                              </label>
                              <div className="min-w-0 text-xs text-muted">
                                Inicio
                                <TimePicker
                                  aria-label={`Hora inicio · Horario ${i + 1}`}
                                  placeholder="--:--"
                                  options={opcionesHorarioFila}
                                  className="mt-1"
                                  value={fila.horaInicio}
                                  onChange={(hora) => actualizarFilaHorario(fila.key, { horaInicio: hora, horaFin: "" })}
                                  disabled={guardando || opcionesHorarioFila.length === 0}
                                />
                              </div>
                              <div className="min-w-0 text-xs text-muted">
                                Fin
                                <TimePicker
                                  aria-label={`Hora fin · Horario ${i + 1}`}
                                  placeholder="--:--"
                                  options={opcionesFinFila}
                                  className="mt-1"
                                  value={fila.horaFin}
                                  onChange={(hora) => actualizarFilaHorario(fila.key, { horaFin: hora })}
                                  disabled={guardando || !fila.horaInicio}
                                />
                              </div>
                            </div>
                            {horarioDiaFila && !horarioDiaFila.abierto && (
                              <p className="mt-1 text-xs text-warning">
                                Los {DIAS_SEMANA[fila.diaSemana].toLowerCase()} la cancha está cerrada — no hay horarios
                                para este turno fijo.
                              </p>
                            )}
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={agregarFilaHorario}
                        disabled={guardando}
                        className="tap-fx ui-transition flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-[12.5px] font-semibold text-muted hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]"
                      >
                        <Plus size={13} strokeWidth={2} /> Agregar horario
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="text-xs text-muted">
                      Titular
                      <TitularPicker
                        className="mt-1"
                        aria-label="Titular"
                        titulares={titularesAgrupados}
                        value={titularIdElegido}
                        onChange={setTitularIdElegido}
                        disabled={guardando}
                      />
                    </label>

                    <label className="text-xs text-muted">
                      Día de la semana
                      <Select
                        className="mt-1"
                        value={diaSemana}
                        onChange={(e) => {
                          setDiaSemana(Number(e.target.value));
                          // El horario real puede cambiar de un día a otro
                          // (horarios_semana): una hora ya elegida para el día
                          // anterior podría no existir en las opciones del nuevo.
                          setHoraInicio("");
                          setHoraFin("");
                        }}
                        disabled={guardando}
                      >
                        {DIAS_OPCIONES.map((d) => (
                          <option key={d} value={d}>
                            {DIAS_SEMANA[d]}
                          </option>
                        ))}
                      </Select>
                    </label>
                    {horarioDia && !horarioDia.abierto && (
                      <p className="text-xs text-warning">
                        Los {DIAS_SEMANA[diaSemana].toLowerCase()} la cancha está cerrada — no hay horarios para este
                        turno fijo.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-xs text-muted">
                        Hora inicio
                        <TimePicker aria-label="Hora inicio" options={opcionesHorario}
                          className="mt-1"
                          value={horaInicio}
                          onChange={(hora) => {
                            setHoraInicio(hora);
                            setHoraFin("");
                          }}
                          disabled={guardando || opcionesHorario.length === 0} />
                      </div>
                      <div className="text-xs text-muted">
                        Hora fin
                        <TimePicker aria-label="Hora fin" options={opcionesFin}
                          className="mt-1"
                          value={horaFin}
                          onChange={(hora) => setHoraFin(hora)}
                          disabled={guardando || !horaInicio} />
                      </div>
                    </div>
                  </>
                )}

                {mensaje && (
                  <p className={`text-xs ${mensaje.tipo === "error" ? "text-error" : "text-success"}`}>{mensaje.texto}</p>
                )}
              </div>
              <div className="shrink-0 border-t border-border bg-surface px-4 py-3 sm:px-5">
                <Button type="submit" loading={guardando} className="min-h-11 w-full">
                  {guardando
                    ? "Guardando..."
                    : modoAlta === "nuevo" && horariosNuevos.length > 1
                      ? `Agregar ${horariosNuevos.length} horarios`
                      : "Agregar turno fijo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editarModal && (
        <div
          className="overlay-anim fixed inset-0 z-40 flex items-center justify-center bg-[rgba(5,10,7,0.7)] p-5 backdrop-blur-[3px]"
          onClick={cerrarEditar}
        >
          <div
            className="modal-pop w-full max-w-[340px] rounded-[16px] border border-border bg-surface p-[22px]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Editar titular"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-bold tracking-wide text-text uppercase">Editar titular</p>
              <IconButton aria-label="Cerrar" variant="ghost" size="sm" onClick={cerrarEditar} disabled={guardandoEdicion}>
                <X size={18} strokeWidth={1.75} />
              </IconButton>
            </div>
            <form onSubmit={guardarEdicion} className="mt-3 flex flex-col gap-3">
              <label className="text-xs text-muted">
                Nombre y apellido
                <Input
                  className="mt-1"
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, ""))}
                  disabled={guardandoEdicion}
                />
              </label>
              <label className="text-xs text-muted">
                Teléfono
                <Input
                  className="mt-1"
                  value={editTelefono}
                  error={!!editTelefonoError}
                  onChange={(e) => {
                    setEditTelefono(e.target.value.replace(/[^0-9]/g, ""));
                    setEditTelefonoError(null);
                  }}
                  disabled={guardandoEdicion}
                />
                {editTelefonoError && (
                  <span className="mt-1 block text-xs text-error">
                    {editTelefonoError}
                    <br />
                    <span className="text-[11px] text-muted">{EJEMPLO_TELEFONO_VALIDO}</span>
                  </span>
                )}
              </label>
              {mensajeEdicion && <p className="text-xs text-error">{mensajeEdicion}</p>}
              <Button type="submit" loading={guardandoEdicion} className="mt-1">
                {guardandoEdicion ? "Guardando..." : "Guardar"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {confirmacion && (
        <ConfirmModal
          mensaje={confirmacion.mensaje}
          confirmLabel={guardando ? "Guardando..." : "Confirmar"}
          busy={guardando}
          ariaLabel="Confirmar turno fijo"
          onClose={() => setConfirmacion(null)}
          onConfirm={() => confirmarAlta(confirmacion)}
        />
      )}

      {eliminarHorarioModal && (
        <ConfirmModal
          mensaje={`¿Eliminar el turno fijo de ${eliminarHorarioModal.label} por completo? Esto borra todas sus fechas futuras.${
            eliminarHorarioModal.esUltimoHorario
              ? " Es el único horario de este titular — también se va a eliminar el titular y su link de baja."
              : ""
          }`}
          confirmLabel={eliminandoHorarioId ? "Eliminando..." : "Eliminar"}
          busy={eliminandoHorarioId !== null}
          ariaLabel="Eliminar horario"
          onClose={() => setEliminarHorarioModal(null)}
          onConfirm={confirmarEliminarHorario}
        />
      )}

      {eliminarTitularModal && (
        <ConfirmModal
          mensaje={`¿Eliminar a ${eliminarTitularModal.nombre} por completo, junto con ${
            eliminarTitularModal.cantidadHorarios === 1
              ? "su único horario fijo"
              : `sus ${eliminarTitularModal.cantidadHorarios} horarios fijos`
          }? Esto también elimina su link de baja. Esta acción no se puede deshacer.`}
          confirmLabel={eliminandoTitularId ? "Eliminando..." : "Eliminar titular"}
          busy={eliminandoTitularId !== null}
          ariaLabel="Eliminar titular"
          onClose={() => setEliminarTitularModal(null)}
          onConfirm={confirmarEliminarTitular}
        />
      )}

      {ocurrenciaModal && (
        <ConfirmModal
          mensaje={`¿Cancelar el turno fijo solo para el ${ocurrenciaModal.fecha}? El horario queda libre ese día.`}
          confirmLabel={procesandoOcurrencia ? "Cancelando..." : "Cancelar este día"}
          busy={procesandoOcurrencia}
          ariaLabel="Cancelar este día"
          onClose={() => setOcurrenciaModal(null)}
          onConfirm={confirmarCancelarOcurrencia}
        />
      )}
    </div>
  );
}
