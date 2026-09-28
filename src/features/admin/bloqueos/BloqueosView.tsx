// BloqueosView — bloquear/desbloquear horarios (C4) + lista negra de
// teléfonos (C5). Puerto de admin.html: 2559-2566/2618-2631 (form "Bloquear
// horario" + lista "Horarios bloqueados"), bloquearHorario (2069-2088),
// 2605-2615/2633-2645 (form "Lista negra de teléfonos" + lista "Teléfonos
// bloqueados"), bloquearTelefono/desbloquearTelefono (1059-1070).
//
// R2 — "Descargar último backup" (E7) se mudó a BackupView, destino de
// navegación propio: el legacy lo tenía acá porque "bloquear" era la única
// pestaña con lugar de sobra, no porque tuviera relación real con horarios
// bloqueados. Ver backup/BackupView.tsx (misma función, mismo estado, sin
// tocar backup.api.ts ni la RPC). No hay nada de backup en este archivo.
//
// R4 — rediseño puramente visual: los dos dominios (horarios/teléfonos) ya
// no van todos apilados en una sola página larga, sino detrás de un
// segmented control "Horarios | Teléfonos" (Motion en la píldora activa,
// mismo patrón que la Sidebar). Los 2 ChipSelector de horario se reemplazan
// por Select (misma fuente de opciones: generarOpcionesHorario/
// opcionesFinDesde, sin reimplementar esa regla). Ninguna lógica de
// alta/baja cambia.
//
// Un bloqueo de horario es una fila más de `reservas` (bloqueado:true,
// confirmada:true, nombre:"Bloqueado", telefono:"-", precio:0) — reusa
// reservas.api.ts/reservas.logic.ts. Un teléfono bloqueado es una fila de la
// tabla propia `telefonos_bloqueados` (PK=telefono, sin relación con
// `reservas`) — reusa telefonosBloqueados.api.ts/useTelefonosBloqueados.ts.
// Ninguna de las dos instancias (useReservasProximas/useTelefonosBloqueados)
// se comparte con otras vistas ni se levanta a AdminShell (a diferencia de
// turnosFijos en C3): acá no hace falta — Agenda y Reservas ya refrescan la
// tabla `reservas` completa por su cuenta al reactivarse (B8), y nadie más
// consume teléfonos bloqueados.
//
// SIN chequeo de solape en el cliente — paridad exacta con el legacy
// (bloquearHorario nunca lo tuvo). Desde E4.3.3, `reservas` tiene un EXCLUDE
// constraint server-side (reservas_sin_solape_confirmadas) que sí rechaza un
// horario ya ocupado/bloqueado — alSubmit traduce ese error (código Postgres
// 23P01, exclusion_violation) a un mensaje legible en vez de agregar un
// chequeo previo acá. La RPC pública `crear_reserva` ya valida
// `telefonos_bloqueados` server-side (código TELEFONO_BLOQUEADO, ver
// reservations.form.logic.ts) — esta vista es únicamente el CRUD admin sobre
// esa lista, no toca esa RPC.
//
// Como TurnosFijosView (y a diferencia de Agenda/Reservas, B8), esta vista NO
// queda montada con `hidden` entre cambios de tab — AdminShell la monta/
// desmonta como al resto de los placeholders (sin polling ni estado costoso
// que preservar).

import { TimePicker } from "../../../components/ui/TimePicker";
import { DatePicker } from "../../../components/ui/DatePicker";
import { motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { generarOpcionesHorario, hoyISO, opcionesFinDesde } from "../../../lib/datetime";
import { useFranjaOperativa } from "../../reservations-public/useFranjaOperativa";
import { cancelarReserva, crearBloqueo } from "../reservas/reservas.api";
import { formatearBadgeFecha, mensajeErrorReserva, procesarReservas, quitarPorId } from "../reservas/reservas.logic";
import { useReservasProximas } from "../reservas/useReservasProximas";
import { bloquearTelefono, desbloquearTelefono } from "./telefonosBloqueados.api";
import { useTelefonosBloqueados } from "./useTelefonosBloqueados";

export interface BloqueosViewProps {
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
}

interface MensajeForm {
  tipo: "error" | "ok";
  texto: string;
}

// admin.html:2593 — offset mínimo de 30' entre inicio y fin (a diferencia de
// los 60' de Turnos Fijos, ver TurnosFijosView.tsx).
const OFFSET_MIN_MINUTOS = 30;

type Tab = "horarios" | "telefonos";
const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "horarios", label: "Horarios" },
  { key: "telefonos", label: "Teléfonos" },
];
const SPRING_TAB = { type: "spring", stiffness: 500, damping: 34, mass: 0.7 } as const;

export function BloqueosView({ mostrarToast }: BloqueosViewProps) {
  const [tab, setTab] = useState<Tab>("horarios");

  const bloqueos = useReservasProximas();
  const [fecha, setFecha] = useState(hoyISO());
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [mensaje, setMensaje] = useState<MensajeForm | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [desbloqueandoId, setDesbloqueandoId] = useState<string | null>(null);

  const telefonosBloqueados = useTelefonosBloqueados();
  const [nuevoTelefono, setNuevoTelefono] = useState("");
  const [motivo, setMotivo] = useState("");
  const [mensajeTelefono, setMensajeTelefono] = useState<MensajeForm | null>(null);
  const [guardandoTelefono, setGuardandoTelefono] = useState(false);
  const [desbloqueandoTelefono, setDesbloqueandoTelefono] = useState<string | null>(null);

  // Mismo criterio que ReservasView con proximas.error: un fallo de carga
  // (no de mutación) se avisa por toast, no rompe el render.
  useEffect(() => {
    if (bloqueos.error) mostrarToast("No se pudieron cargar los horarios bloqueados. Probá de nuevo.", "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueos.error]);

  useEffect(() => {
    if (telefonosBloqueados.error) {
      mostrarToast("No se pudieron cargar los teléfonos bloqueados. Probá de nuevo.", "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telefonosBloqueados.error]);

  // CFG-F2 — horario REAL del día elegido (fecha especial vigente si la hay,
  // si no horario semanal), reemplaza los 08:00/01:00 hardcodeados de
  // configCancha: si `fecha` está cerrada (horarios_semana o fecha especial),
  // no hay ningún horario que ofrecer — nunca un fallback silencioso.
  const { franja, loading: franjaLoading } = useFranjaOperativa(fecha);
  const opcionesHorario =
    franja && !franja.cerrado && franja.horaApertura && franja.horaCierre
      ? generarOpcionesHorario(franja.horaApertura, franja.horaCierre)
      : [];
  const opcionesFin =
    franja && !franja.cerrado && franja.horaApertura && franja.horaCierre
      ? opcionesFinDesde(horaInicio, franja.horaApertura, franja.horaCierre, OFFSET_MIN_MINUTOS)
      : [];

  const bloqueosProximos = bloqueos.data.filter((r) => r.bloqueado);

  // admin.html:2069-2088 (bloquearHorario) — SIN chequeo de solape contra
  // reservas ni otros bloqueos, a propósito (ver cabecera del archivo).
  async function alSubmit(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    if (!fecha || !horaInicio || !horaFin) {
      setMensaje({ tipo: "error", texto: "Completá fecha, inicio y fin." });
      return;
    }

    setGuardando(true);
    const { data: nuevo, error } = await crearBloqueo(fecha, horaInicio, horaFin);
    if (error || !nuevo) {
      setGuardando(false);
      // E4.3.3 — 23P01 (exclusion_violation) es el EXCLUDE constraint de
      // reservas_sin_solape_confirmadas rechazando el bloqueo; se traduce a
      // un mensaje legible en vez de mostrar el error crudo de Postgres.
      const texto =
        error?.code === "23P01"
          ? "El horario se superpone con una reserva o bloqueo existente."
          : "No se pudo bloquear el horario.";
      setMensaje({ tipo: "error", texto });
      return;
    }

    // Reusa procesarReservas (no un mapper nuevo) para pasar de la fila cruda
    // del insert a ReservaProcesada — `bloqueado: true` hace que
    // esReservaVigente() siempre la clasifique como vigente (lib/datetime.ts),
    // así que `vigentes[0]` siempre existe acá.
    const { vigentes } = procesarReservas([nuevo], Date.now());
    bloqueos.actualizarLocal((prev) => [...prev, vigentes[0]!]);

    setGuardando(false);
    setHoraInicio("");
    setHoraFin("");
    setMensaje({ tipo: "ok", texto: "Horario bloqueado." });
  }

  // admin.html:2628 (Desbloquear) — sin ConfirmModal, a diferencia de cancelar
  // una reserva real: paridad legacy (llamada directa al click).
  async function desbloquear(id: string) {
    if (desbloqueandoId) return;
    setDesbloqueandoId(id);
    const { error } = await cancelarReserva(id);
    if (error) {
      mostrarToast(mensajeErrorReserva(error, "desbloquear"), "error");
    } else {
      bloqueos.actualizarLocal((prev) => quitarPorId(prev, id));
    }
    setDesbloqueandoId(null);
  }

  // admin.html:1059-1065 (bloquearTelefono) — a diferencia del form de
  // horario, el legacy avisa ambos resultados (éxito/error) por TOAST, no con
  // un mensaje inline; se mantiene así. Única mejora deliberada y aprobada:
  // teléfono vacío muestra un error inline en vez de un no-op silencioso
  // (mismo criterio ya aplicado en el resto del proyecto) — es validación de
  // cliente, no un resultado de la API, así que no compite con el toast.
  async function alSubmitTelefono(e: FormEvent) {
    e.preventDefault();
    setMensajeTelefono(null);
    if (!nuevoTelefono) {
      setMensajeTelefono({ tipo: "error", texto: "Ingresá un teléfono." });
      return;
    }

    setGuardandoTelefono(true);
    const { data: nuevo, error } = await bloquearTelefono(nuevoTelefono, motivo || null);
    setGuardandoTelefono(false);
    if (error || !nuevo) {
      // Mensaje genérico exacto del legacy — no se inspecciona el código de
      // error (23505, PK duplicada) para distinguirlo de otros fallos.
      mostrarToast("No se pudo bloquear (¿ya estaba bloqueado?).", "error");
      return;
    }

    telefonosBloqueados.agregarLocal(nuevo);
    setNuevoTelefono("");
    setMotivo("");
    mostrarToast("Teléfono bloqueado.", "ok");
  }

  // admin.html:1067-1070 (desbloquearTelefono). Mejora deliberada y aprobada
  // respecto del legacy: un error ahora avisa por toast (el legacy fallaba en
  // silencio, sin ningún feedback).
  async function alDesbloquearTelefono(telefono: string) {
    if (desbloqueandoTelefono) return;
    setDesbloqueandoTelefono(telefono);
    const { error } = await desbloquearTelefono(telefono);
    if (error) {
      mostrarToast("No se pudo desbloquear el teléfono.", "error");
    } else {
      telefonosBloqueados.quitarLocal(telefono);
    }
    setDesbloqueandoTelefono(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Tipo de bloqueo" className="inline-flex gap-1 self-start rounded-pill border border-border bg-surface-2 p-1">
        {TABS.map((t) => {
          const activo = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => setTab(t.key)}
              className={`relative rounded-pill px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                activo ? "text-on-accent" : "text-muted hover:text-text"
              }`}
            >
              {activo && (
                <motion.span
                  layoutId="bloqueos-tab-pill"
                  transition={SPRING_TAB}
                  className="absolute inset-0 rounded-pill bg-accent"
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "horarios" && (
        <>
          <Card className="p-3.5">
            <div className="mb-2.5 text-[13px] font-bold tracking-wide text-text uppercase">Bloquear horario</div>
            <form onSubmit={alSubmit} className="flex flex-col gap-3">
              <div className="text-xs text-muted">
                Fecha
                <DatePicker
                  aria-label="Fecha"
                  min={hoyISO()}
                  className="mt-1"
                  value={fecha}
                  onChange={(nuevaFecha) => {
                    setFecha(nuevaFecha);
                    // El horario real puede cambiar de un día a otro
                    // (horarios_semana/fecha especial) — una hora ya elegida
                    // para el día anterior podría no existir en las opciones
                    // del nuevo día.
                    setHoraInicio("");
                    setHoraFin("");
                  }}
                />
              </div>
              {!franjaLoading && franja?.cerrado && (
                <p className="text-xs text-warning">La cancha está cerrada ese día — no hay horarios para bloquear.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="text-xs text-muted">
                  Hora inicio
                  <TimePicker aria-label="Hora inicio" options={opcionesHorario}
                    className="mt-1"
                    value={horaInicio}
                    disabled={opcionesHorario.length === 0}
                    onChange={(hora) => {
                      setHoraInicio(hora);
                      setHoraFin("");
                    }} />
                </div>
                <div className="text-xs text-muted">
                  Hora fin
                  <TimePicker aria-label="Hora fin" options={opcionesFin} className="mt-1" value={horaFin} onChange={(hora) => setHoraFin(hora)} disabled={!horaInicio} />
                </div>
              </div>
              {mensaje && (
                <p className={`text-xs ${mensaje.tipo === "error" ? "text-error" : "text-success"}`}>{mensaje.texto}</p>
              )}
              <Button type="submit" loading={guardando} className="self-start">
                Bloquear horario
              </Button>
            </form>
          </Card>

          <Card className="p-3.5">
            <div className="mb-2.5 text-[13px] font-bold tracking-wide text-text uppercase">Horarios bloqueados</div>
            {bloqueosProximos.length === 0 && <p className="text-sm text-muted">No hay horarios bloqueados.</p>}
            <div className="flex flex-col gap-2">
              {bloqueosProximos.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{formatearBadgeFecha(r.fecha)}</Badge>
                    <span className="text-body-sm font-semibold whitespace-nowrap text-text">
                      {r.horaInicio}-{r.horaFin}
                    </span>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => desbloquear(r.id)} loading={desbloqueandoId === r.id}>
                    {desbloqueandoId === r.id ? "Desbloqueando..." : "Desbloquear"}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === "telefonos" && (
        <>
          <Card className="p-3.5">
            <div className="mb-2.5 text-[13px] font-bold tracking-wide text-text uppercase">Lista negra de teléfonos</div>
            <p className="mb-2.5 text-xs text-muted">Un teléfono bloqueado no va a poder sacar turnos nuevos.</p>
            <form onSubmit={alSubmitTelefono} className="flex flex-col gap-3">
              <label className="text-xs text-muted">
                Teléfono
                <Input
                  className="mt-1"
                  placeholder="Ej: 3775123456"
                  value={nuevoTelefono}
                  onChange={(e) => setNuevoTelefono(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </label>
              <label className="text-xs text-muted">
                Motivo (opcional)
                <Input
                  className="mt-1"
                  placeholder="Ej: no se presentó varias veces"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
              {mensajeTelefono && (
                <p className={`text-xs ${mensajeTelefono.tipo === "error" ? "text-error" : "text-success"}`}>
                  {mensajeTelefono.texto}
                </p>
              )}
              <Button type="submit" loading={guardandoTelefono} className="self-start">
                Bloquear teléfono
              </Button>
            </form>
          </Card>

          <Card className="p-3.5">
            <div className="mb-2.5 text-[13px] font-bold tracking-wide text-text uppercase">Teléfonos bloqueados</div>
            {telefonosBloqueados.data.length === 0 && <p className="text-sm text-muted">No hay teléfonos bloqueados.</p>}
            <div className="flex flex-col gap-2">
              {telefonosBloqueados.data.map((tb) => (
                <div
                  key={tb.telefono}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-2.5"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="neutral">{tb.telefono}</Badge>
                    {tb.motivo && <span className="truncate text-body-sm text-muted">{tb.motivo}</span>}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => alDesbloquearTelefono(tb.telefono)}
                    loading={desbloqueandoTelefono === tb.telefono}
                  >
                    {desbloqueandoTelefono === tb.telefono ? "Desbloqueando..." : "Desbloquear"}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
