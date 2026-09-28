// PublicReservarView — rediseño del flujo de Reservar (PUBLIC-R3), basado en
// el artifact aprobado. Toda la lógica de negocio sigue viviendo en los mismos
// hooks/funciones puras que ya usaba PublicBookingPage.tsx (sin tocar ese
// archivo ni sus componentes, que quedan sin usar pero intactos):
//   - useDisponibilidad/useFranjaOperativa/useConfiguracionReservas/useReservaForm
//   - horasInicioDisponibles/horasFinDisponibles/estaAbierta (reservations.logic.ts)
//   - crear_reserva vía useReservaForm.confirmarReserva (precio autoritativo:
//     nuevaReserva.precio del servidor, nunca uno calculado acá).
//
// "Duración" NO es un concepto nuevo: cada chip de duración es, por dentro,
// una de las horas de fin que ya devuelve horasFinDisponibles() — la misma
// función pura que ya respeta cierre/bloqueos/reservas ocupadas/cruce de
// medianoche. Elegir una duración es, literalmente, llamar a
// seleccionarHoraFin(esaHora); no hay ningún cálculo de disponibilidad nuevo.
//
// PUBLIC-R3.1 — precio mostrado (chips/resumen/sticky): auditado y corregido.
// calcularPrecioEstimado (horas * configCancha.precioHora) NO contempla fecha
// especial > franja > duración > base, que es la prioridad real del motor de
// tarifas (calcular_precio_en_instante). Se reemplaza por useCotizacionReservas,
// que llama a la RPC pública cotizar_reserva — la MISMA función que ya usa
// crear_reserva internamente — sin reimplementar esa lógica en el cliente.
// El precio final sigue siendo 100% autoridad del servidor al confirmar.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Calendar, Check, MessageCircle } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { PubButton, PubCard, PubChip } from "../../components/ui-public";
import { configCancha } from "../../config/canchaConfig";
import { extenderReserva, generarProximosDias, hoyISO, horaToMinutos } from "../../lib/datetime";
import { formatearMoneda } from "../../lib/format";
import { PUB_SELECTION_SPRING, PUB_TRANSITION, pubStaggerContainer, pubStaggerItem } from "../../lib/motion-public";
import {
  formatearCorta,
  formatearFecha,
  NOMBRE_MAX_LENGTH,
  TELEFONO_MAX_LENGTH,
} from "../reservations-public/reservations.form.logic";
import { useConfiguracionReservas } from "../reservations-public/useConfiguracionReservas";
import { useDisponibilidad } from "../reservations-public/useDisponibilidad";
import { useFranjaOperativa } from "../reservations-public/useFranjaOperativa";
import { useReservaForm } from "../reservations-public/useReservaForm";
import { useTurnstile } from "../reservations-public/useTurnstile";
import type { VistaPublica } from "./nav.config";
import { useDatosPublicosCancha } from "./useDatosPublicosCancha";

export interface PublicReservarViewProps {
  onNavegar: (vista: VistaPublica) => void;
}

function formatearDuracion(minutos: number): string {
  if (minutos % 60 === 0) {
    const horas = minutos / 60;
    return horas === 1 ? "1 hora" : `${horas} horas`;
  }
  return `${Math.floor(minutos / 60)}h ${minutos % 60}`;
}

function calcularDuracionMinutos(horaInicio: string, horaFin: string, aperturaMin: number): number {
  const { ini, fin } = extenderReserva(horaInicio, horaFin, aperturaMin);
  return fin - ini;
}

export function PublicReservarView({ onNavegar }: PublicReservarViewProps) {
  const [fecha, setFecha] = useState(hoyISO());
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const disponibilidad = useDisponibilidad(fecha);
  const { franja, loading: franjaLoading, error: franjaError, refrescar: refrescarFranja } = useFranjaOperativa(fecha);
  const { configuracion, loading: configuracionLoading, error: configuracionError, refrescar: refrescarConfiguracion } = useConfiguracionReservas();
  // CFG-F1.1 — nombre/WhatsApp reales de la cancha (datos_publicos_cancha):
  // el mensaje de confirmación por WhatsApp ya no usa el hardcode de
  // canchaConfig.ts. precioHora sigue viniendo de configCancha (CFG-F2).
  const { datos: datosPublicos, loading: datosPublicosLoading, error: datosPublicosError, refrescar: refrescarDatos } = useDatosPublicosCancha();
  const config = {
    ...configCancha,
    nombreCancha: datosPublicos?.nombreCancha ?? "",
    whatsappNumero: datosPublicos?.whatsappNumero ?? "",
  };
  // FINAL-F5-B — verificación anti-bot: el widget vive en la tarjeta de datos
  // (contenedorRef) y "Confirmar" queda bloqueado hasta tener un token válido.
  const turnstile = useTurnstile();
  const form = useReservaForm(fecha, disponibilidad, config, franjaLoading || franjaError ? null : franja, configuracionLoading || configuracionError ? null : configuracion, turnstile);
  const cotizacion = form.cotizacion;
  const precioSeleccionado = form.horaFin ? cotizacion.precios[form.horaFin] : undefined;
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!form.mensaje) return;
    feedbackRef.current?.focus({ preventScroll: true });
    feedbackRef.current?.scrollIntoView({ behavior: "instant", block: "center" });
  }, [form.mensaje]);

  // PUBLIC-R6 — evita el parpadeo reportado al cambiar de día: los hooks de
  // disponibilidad/franja recién marcan `loading=true` en un useEffect, que
  // corre DESPUÉS de este render. Sin esto, hay un frame intermedio donde
  // `fecha` ya cambió pero `franja`/`disponibilidad` todavía son las del día
  // anterior, mostrando fugazmente horarios calculados contra el día viejo.
  // Patrón oficial de React ("Storing information from previous renders"):
  // comparar contra un useState snapshot durante el render mismo, no un
  // useEffect, para que quede resuelto en el mismo commit — safe incluso bajo
  // el doble-render de Strict Mode (a diferencia de mutar un useRef acá).
  const [fechaProcesada, setFechaProcesada] = useState(fecha);
  let cambiandoFecha = false;
  if (fecha !== fechaProcesada) {
    setFechaProcesada(fecha);
    cambiandoFecha = true;
  }
  const [horaInicioProcesada, setHoraInicioProcesada] = useState(form.horaInicio);
  let cambiandoHoraInicio = false;
  if (form.horaInicio !== horaInicioProcesada) {
    setHoraInicioProcesada(form.horaInicio);
    cambiandoHoraInicio = true;
  }

  // PUBLIC-R6 — navegación real por pasos: `pasoVisible` es un cursor de
  // VISTA, separado de los datos reales del form (form.horaInicio/horaFin).
  // "Volver" solo mueve este cursor hacia atrás; nunca borra una selección ya
  // hecha (eso es justamente lo que se pedía dejar de hacer). Cambiar un dato
  // anterior (elegir otro horario de inicio) sigue invalidando lo dependiente
  // (form.seleccionarHoraInicio ya limpia horaFin) y ahí sí el cursor avanza
  // de nuevo — invalidación real, no un efecto colateral de retroceder.
  const [pasoVisible, setPasoVisible] = useState(1);
  if (cambiandoFecha && pasoVisible !== 1) {
    setPasoVisible(1);
  }

  const cargando = disponibilidad.loading || franjaLoading || configuracionLoading || datosPublicosLoading || cambiandoFecha;
  const errorDisponibilidad = disponibilidad.error || franjaError || configuracionError || datosPublicosError;
  const precioValido = !cotizacion.loading && !cotizacion.error && Number.isFinite(precioSeleccionado);
  const cotizando = cotizacion.loading || cambiandoHoraInicio;
  const dias = configuracion ? generarProximosDias(configuracion.anticipacionMaximaDias) : [];
  const hoy = hoyISO();
  const aperturaMin = franja && !franja.cerrado ? horaToMinutos(franja.horaApertura!) : 0;

  // Estas dos gatillan qué SECCIÓN se muestra (no si hay datos): al volver,
  // form.horaInicio/horaFin siguen teniendo el valor ya elegido (se ve
  // reflejado en el chip activo), solo se oculta la sección siguiente.
  const mostrarDuracion = pasoVisible >= 2;
  const mostrarDatos = pasoVisible >= 3;

  const stepIndex = pasoVisible;
  const stepNames: Record<number, string> = { 1: "Elegí día y horario", 2: "Elegí la duración", 3: "Confirmá tus datos" };

  // Auto-scroll suave hacia la sección siguiente al elegir hora/duración —
  // nunca por una respuesta async (cotización/franja/etc.): el único disparo
  // es `scrollDestinoRef`, que solo se carga sincrónicamente dentro de
  // elegirHoraInicio/elegirHoraFin, nunca desde un efecto atado a datos que
  // lleguen del servidor.
  const duracionSectionRef = useRef<HTMLElement | null>(null);
  const datosSectionRef = useRef<HTMLDivElement | null>(null);
  const scrollDestinoRef = useRef<"duracion" | "datos" | null>(null);

  useEffect(() => {
    const destino = scrollDestinoRef.current;
    if (!destino) return;
    scrollDestinoRef.current = null;
    const el = destino === "duracion" ? duracionSectionRef.current : datosSectionRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const rect = el.getBoundingClientRect();
    const suficientementeVisible = rect.top >= 160 && rect.bottom <= window.innerHeight;
    if (suficientementeVisible) return;
    const prefiereMenosMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollIntoView({ behavior: prefiereMenosMovimiento ? "auto" : "smooth", block: "start" });
  }, [pasoVisible]);

  function volver() {
    if (pasoVisible === 3) {
      setPasoVisible(2);
      return;
    }
    if (pasoVisible === 2) {
      setPasoVisible(1);
      return;
    }
    onNavegar("home");
  }

  // Reclickear la misma hora ya elegida (típicamente al volver) solo avanza
  // la vista, sin invalidar la duración que ya estaba elegida contra ella.
  // Elegir una hora distinta sí es "cambiar un dato anterior": ahí
  // form.seleccionarHoraInicio invalida horaFin (ya lo hacía) y el cursor
  // vuelve a avanzar, mostrando duración de nuevo.
  function elegirHoraInicio(hora: string) {
    if (cargando || errorDisponibilidad) return;
    const cambiaHoraInicio = hora !== form.horaInicio;
    if (cambiaHoraInicio) {
      form.seleccionarHoraInicio(hora);
    }
    // Cambiar de verdad el horario invalida la duración ya elegida (si la
    // había): el cursor vuelve exactamente a paso 2, aunque viniera de paso 3.
    // Reclickear la MISMA hora (volver + reafirmar) nunca retrocede el cursor.
    const nuevoPaso = cambiaHoraInicio ? 2 : Math.max(pasoVisible, 2);
    if (nuevoPaso !== pasoVisible) scrollDestinoRef.current = "duracion";
    setPasoVisible(nuevoPaso);
  }

  function elegirHoraFin(hora: string) {
    if (cargando || errorDisponibilidad || cotizacion.loading || cotizacion.error || !Number.isFinite(cotizacion.precios[hora])) return;
    form.seleccionarHoraFin(hora);
    const nuevoPaso = Math.max(pasoVisible, 3);
    if (nuevoPaso !== pasoVisible) scrollDestinoRef.current = "datos";
    setPasoVisible(nuevoPaso);
  }

  const duraciones = form.horaInicio
    ? form.horasFinDisponibles.map((horaFinCandidata) => {
        const minutos = calcularDuracionMinutos(form.horaInicio, horaFinCandidata, aperturaMin);
        return {
          horaFin: horaFinCandidata,
          label: formatearDuracion(minutos),
          precio: cotizacion.precios[horaFinCandidata],
          activo: horaFinCandidata === form.horaFin,
        };
      })
    : [];

  if (form.exito) {
    // confirmarReserva ya vació horaInicio/horaFin/nombre/telefono — "Reservar
    // otro turno" también tiene que devolver el cursor de vista a paso 1,
    // si no queda mostrando la sección de datos vacía sobre un form recién
    // reseteado.
    function reiniciarFlujo() {
      form.cerrarExito();
      setPasoVisible(1);
    }
    return <PantallaExito exito={form.exito} onOtraReserva={reiniciarFlujo} onNavegar={onNavegar} />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-30 flex flex-col gap-3 border-b border-pub-border bg-pub-bg/95 px-4 py-3.5 backdrop-blur-sm lg:px-10">
        <button
          type="button"
          onClick={volver}
          className="pub-transition pub-focus-ring inline-flex w-fit items-center gap-2 rounded-pub-pill border border-pub-border bg-pub-surface-2 px-4 py-2 text-[13px] font-bold text-pub-text active:scale-[0.94] motion-reduce:active:scale-100"
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          Volver
        </button>
        <div>
          <h1 className="font-pub-heading text-[19px] font-bold text-pub-text">Elegí tu turno</h1>
          <div className="mt-1.5 h-[5px] overflow-hidden rounded-pub-pill bg-pub-surface-2">
            <div
              className="pub-transition h-full rounded-pub-pill"
              style={{ width: `${Math.round((stepIndex / 3) * 100)}%`, background: "linear-gradient(90deg, var(--color-pub-secondary), var(--color-pub-accent))" }}
            />
          </div>
          <div className="mt-1.5 text-[11.5px] font-bold tracking-wide text-pub-secondary uppercase">
            Paso {stepIndex} de 3 · {stepNames[stepIndex]}
          </div>
        </div>
      </div>

      <div className="flex-1 pb-[calc(120px+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-[560px] min-w-0 flex-col gap-5 px-4 py-5 lg:py-7">
          {(disponibilidad.error || configuracionError || franjaError || datosPublicosError) && (
            <div role="alert" className="rounded-pub-md border border-pub-danger/40 bg-pub-danger/10 p-3 text-[13px] font-medium text-pub-danger">
              No se pudo cargar la disponibilidad completa.
              <button type="button" className="pub-focus-ring ml-2 underline" onClick={() => {
                void disponibilidad.refrescar({ forzar: true }); refrescarFranja(); refrescarConfiguracion();
                if (datosPublicosError) refrescarDatos();
              }}>Reintentar disponibilidad</button>
            </div>
          )}

          <motion.div variants={pubStaggerContainer} initial="initial" animate="animate" className="flex min-w-0 flex-col gap-5">
            <motion.div variants={pubStaggerItem}>
              <div className="mb-2 flex items-center gap-2">
                <NumeroPaso n={1} />
                <span className="font-pub-heading text-[13px] font-semibold text-pub-text">Elegí el día</span>
              </div>
              <motion.div layoutScroll className="dias-scroll -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1.5">
                {dias.map((d) => {
                  const activo = fecha === d.iso;
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => setFecha(d.iso)}
                      aria-pressed={activo}
                      className={`pub-transition pub-focus-ring relative flex h-[68px] w-[60px] shrink-0 flex-col justify-center rounded-pub-md border text-center active:scale-[0.95] motion-reduce:active:scale-100 ${
                        activo ? "border-pub-accent" : "border-pub-border bg-pub-surface hover:border-pub-border-strong"
                      }`}
                    >
                      {activo && (
                        <motion.span
                          layoutId="dia-chip-activo"
                          transition={PUB_SELECTION_SPRING}
                          className="absolute inset-0 -z-10 rounded-pub-md bg-pub-accent-muted"
                        />
                      )}
                      <div className={`text-[10.5px] font-bold uppercase tracking-wide ${activo ? "text-pub-accent" : "text-pub-muted"}`}>
                        {d.iso === hoy ? "HOY" : d.diaSemana}
                      </div>
                      <div className={`font-pub-heading mt-0.5 text-[20px] leading-tight font-bold tabular-nums ${activo ? "text-pub-accent" : "text-pub-text"}`}>
                        {d.diaNum}
                      </div>
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-label="Elegir otra fecha"
                  onClick={() => setMostrarCalendario((v) => !v)}
                  className="pub-transition pub-focus-ring flex h-[68px] w-14 shrink-0 items-center justify-center rounded-pub-md border border-pub-border bg-pub-surface active:scale-[0.95] motion-reduce:active:scale-100"
                >
                  <Calendar size={18} strokeWidth={1.8} className="text-pub-text-secondary" />
                </button>
              </motion.div>
              {mostrarCalendario && (
                <input
                  type="date"
                  min={hoy}
                  value={fecha}
                  onChange={(e) => {
                    setFecha(e.target.value);
                    setMostrarCalendario(false);
                  }}
                  className="pub-focus-ring mt-2 w-full rounded-pub-md border border-pub-border bg-pub-surface-2 p-2.5 text-[13.5px] text-pub-text"
                />
              )}
            </motion.div>

            <motion.div variants={pubStaggerItem}>
              <PubCard className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-pub-heading text-[13px] font-semibold text-pub-text">Horario de inicio</span>
                </div>

                <motion.div layout="size" transition={PUB_TRANSITION.base} className="overflow-hidden">
                  <motion.div
                    key={cargando ? "cargando" : fecha}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={PUB_TRANSITION.fast}
                  >
                    {cargando ? (
                      <div className="grid grid-cols-4 gap-2">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <span key={i} className="skeleton-shimmer h-11 rounded-pub-md" aria-hidden="true" />
                        ))}
                      </div>
                    ) : errorDisponibilidad ? (
                      <p className="text-[13px] text-pub-muted">Los horarios estarán disponibles cuando termine la carga correctamente.</p>
                    ) : form.cerrado ? (
                      <p className="text-[13px] text-pub-muted">La cancha está cerrada este día. Elegí otra fecha arriba.</p>
                    ) : form.horasInicioDisponibles.length === 0 ? (
                      <p className="text-[13px] text-pub-muted">Sin turnos disponibles. Probá seleccionando otro día.</p>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {form.horasInicioDisponibles.map((hora) => (
                          <PubChip
                            key={hora}
                            active={hora === form.horaInicio}
                            onClick={() => elegirHoraInicio(hora)}
                            className="min-h-11 min-w-0 justify-center px-1! text-[13px]! tabular-nums"
                          >
                            {hora}
                          </PubChip>
                        ))}
                      </div>
                    )}
                  </motion.div>
                </motion.div>

              </PubCard>
            </motion.div>

            <MotionConfig reducedMotion="user">
              <motion.section
                ref={duracionSectionRef}
                tabIndex={-1}
                aria-labelledby="duracion-titulo"
                layout="size"
                transition={PUB_TRANSITION.fast}
                className="scroll-mt-44 overflow-hidden border-y border-pub-border py-5"
              >
                <motion.div layout="position" transition={PUB_TRANSITION.fast}>
                  <div className="mb-2 min-h-4 text-[11px] leading-4 text-pub-muted">
                    {mostrarDuracion ? (
                      <>Seleccionaste: <span className="font-semibold text-pub-text-secondary">{formatearCorta(fecha)} · {form.horaInicio}</span></>
                    ) : (
                      "Completá tu turno"
                    )}
                  </div>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-pub-pill text-[11px] font-extrabold ${mostrarDuracion ? "bg-pub-accent text-pub-on-accent" : "bg-pub-surface-2 text-pub-muted"}`}>2</span>
                    <h2 id="duracion-titulo" className={`font-pub-heading text-[14px] font-semibold ${mostrarDuracion ? "text-pub-text" : "text-pub-muted"}`}>Duración</h2>
                  </div>
                  {!mostrarDuracion ? (
                    <p className="py-2 text-[13px] leading-relaxed text-pub-muted">
                      Elegí primero un horario de inicio para ver duraciones y precio.
                    </p>
                  ) : (
                    <motion.div
                      key={form.horaInicio}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={PUB_TRANSITION.fast}
                    >
                      {duraciones.length === 0 ? (
                        <p className="text-[13px] text-pub-muted">No hay duraciones disponibles desde ese horario. Probá con otro horario de inicio.</p>
                      ) : (
                        <div className="flex flex-wrap justify-center gap-2">
                          {cotizando && <span className="sr-only" role="status">Calculando precios…</span>}
                          {duraciones.map((d) => (
                            <PubChip
                              key={d.horaFin}
                              active={d.activo}
                              disabled={cargando || errorDisponibilidad || cotizando || cotizacion.error || d.precio == null}
                              onClick={() => elegirHoraFin(d.horaFin)}
                              className={`basis-[calc(50%-4px)] grow-0 shrink-0 min-w-0 flex-col! items-center! justify-center gap-0.5! px-3.5! py-1.5! text-center whitespace-normal! ${
                                d.activo
                                  ? "shadow-[0_0_16px_-3px_var(--color-pub-accent)]"
                                  : "border-pub-border-strong/70! bg-pub-surface-2! shadow-pub-sm"
                              }`}
                            >
                              <span className="font-pub-heading text-[16px] leading-5 font-semibold text-pub-text">{d.label}</span>
                              {cotizando ? (
                                <span className="skeleton-shimmer mt-0.5 inline-block h-[14px] w-11 rounded-pub-sm" aria-hidden="true" />
                              ) : (
                                <span
                                  className={`font-pub-heading text-[14px] leading-4 font-bold tabular-nums ${d.activo ? "text-pub-accent" : "text-pub-text-secondary"}`}
                                >
                                  {cotizacion.error || d.precio == null ? "No disponible" : formatearMoneda(d.precio)}
                                </span>
                              )}
                            </PubChip>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                  {mostrarDuracion && cotizacion.error && (
                    <p role="alert" className="mt-2 text-[12px] font-medium text-pub-danger">
                      No pudimos calcular el precio.
                      <button type="button" className="pub-focus-ring ml-2 underline" onClick={cotizacion.refrescar}>Reintentar precio</button>
                    </p>
                  )}
                </motion.div>
              </motion.section>
            </MotionConfig>

            {mostrarDatos && (
              <motion.div
                ref={datosSectionRef}
                tabIndex={-1}
                role="region" aria-label="Tus datos"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={PUB_TRANSITION.base}
                className="scroll-mt-44 flex flex-col gap-4"
              >
                <RecapSeleccion
                  fecha={fecha}
                  form={form}
                  aperturaMin={aperturaMin}
                  precio={precioSeleccionado}
                  loading={cotizacion.loading}
                  error={cotizacion.error}
                />
                <section className="flex flex-col gap-3 py-2">
                  <div className="flex items-center gap-2">
                    <NumeroPaso n={3} />
                    <span className="font-pub-heading text-[13px] font-semibold text-pub-text">Tus datos</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="r3-nombre" className="text-[11px] font-bold tracking-wide text-pub-muted uppercase">
                      Nombre y apellido
                    </label>
                    <input
                      id="r3-nombre"
                      type="text"
                      autoComplete="off"
                      value={form.nombre}
                      maxLength={NOMBRE_MAX_LENGTH}
                      onChange={(e) => form.actualizarNombre(e.target.value)}
                      placeholder="Tu nombre y apellido"
                      className="pub-focus-ring rounded-pub-md border border-pub-border bg-pub-surface-2 p-3 text-base text-pub-text"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="r3-telefono" className="text-[11px] font-bold tracking-wide text-pub-muted uppercase">
                      Teléfono
                    </label>
                    <input
                      id="r3-telefono"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="off"
                      value={form.telefono}
                      maxLength={TELEFONO_MAX_LENGTH}
                      onChange={(e) => form.actualizarTelefono(e.target.value)}
                      placeholder="Tu WhatsApp para confirmar"
                      className="pub-focus-ring rounded-pub-md border border-pub-border bg-pub-surface-2 p-3 text-base text-pub-text"
                    />
                  </div>
                  {/* Turnstile "interaction-only": invisible salvo que Cloudflare pida un desafío. */}
                  <div ref={turnstile.contenedorRef} data-testid="turnstile-contenedor" />
                  {turnstile.estado === "cargando" && !turnstile.token && (
                    <p role="status" className="text-[12px] text-pub-muted">
                      Verificando tu conexión…
                    </p>
                  )}
                  {turnstile.estado === "error" && (
                    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-pub-danger">
                      <span>No pudimos completar la verificación de seguridad.</span>
                      <button
                        type="button"
                        onClick={turnstile.reiniciar}
                        className="pub-focus-ring rounded-pub-sm underline underline-offset-2"
                      >
                        Reintentar
                      </button>
                    </div>
                  )}
                  {form.mensaje && (
                    <div ref={feedbackRef} tabIndex={-1} role="alert" className="scroll-mt-44 scroll-mb-40 text-[13px] font-medium text-pub-danger">
                      {form.mensaje.texto}
                    </div>
                  )}
                  {form.reservaIncierta && (
                    <div className="space-y-3 text-[13px]">
                      <a className="pub-focus-ring block underline" href={`https://wa.me/${config.whatsappNumero}?text=${encodeURIComponent(`Hola, necesito verificar si quedó mi reserva del ${form.reservaIncierta.fecha}, ${form.reservaIncierta.horaInicio} a ${form.reservaIncierta.horaFin}, a nombre de ${form.reservaIncierta.nombre}. No recibí confirmación.`)}`} target="_blank" rel="noreferrer">Consultar mi reserva por WhatsApp</a>
                      <button type="button" className="pub-focus-ring underline" onClick={form.habilitarReintento}>Ya verifiqué que no se creó: habilitar nuevo intento</button>
                    </div>
                  )}
                </section>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>

      {mostrarDatos && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={PUB_TRANSITION.base}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-pub-border bg-pub-bg/95 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur-sm"
        >
          <div className="mx-auto flex max-w-[560px] flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-[140px] flex-1">
              <div className="text-[11px] leading-relaxed font-semibold text-pub-text-secondary">
                {formatearCorta(fecha)} · {form.horaInicio}–{form.horaFin}
              </div>
              <div className="font-pub-heading text-[21px] leading-tight font-extrabold">
                <PrecioAnimado precio={precioSeleccionado} loading={cotizacion.loading} error={cotizacion.error} size="lg" />
              </div>
            </div>
            <PubButton
              className="grow min-[390px]:grow-0"
              onClick={form.confirmarReserva}
              loading={form.guardando}
              disabled={form.guardando || form.incierta || cargando || errorDisponibilidad || !precioValido || !form.formCompleto || !datosPublicos || !turnstile.token}
            >
              Confirmar reserva
            </PubButton>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function NumeroPaso({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-pub-pill bg-pub-accent text-[11px] font-extrabold text-pub-on-accent">
      {n}
    </span>
  );
}

interface PrecioAnimadoProps {
  precio: number | undefined;
  loading?: boolean;
  error?: boolean;
  // PUBLIC-R6 — "lg" para los lugares donde el precio debe ser la pieza
  // tipográfica dominante (recap, barra sticky de confirmación): mismo
  // componente/misma lógica de pop al cambiar, solo cambia el tamaño.
  size?: "md" | "lg";
}

function PrecioAnimado({ precio, loading, error, size = "md" }: PrecioAnimadoProps) {
  const [pop, setPop] = useState(false);
  const anterior = useRef(precio);

  useEffect(() => {
    if (precio != null && anterior.current !== precio) {
      anterior.current = precio;
      setPop(true);
      const t = setTimeout(() => setPop(false), 300);
      return () => clearTimeout(t);
    }
  }, [precio]);

  const tamano = size === "lg" ? "text-[19px]" : "";
  const altoSkeleton = size === "lg" ? "h-[19px]" : "h-[15px]";

  // PUBLIC-R6 — antes reemplazaba el precio por el texto "Calculando…",
  // protagonismo que se pidió sacar: ahora un skeleton sutil (mismo alto que
  // el número real, sin remontar el bloque) mientras llega la cotización
  // vigente, sin mostrar el precio previo como si ya fuera válido.
  if (loading)
    return (
      <span className="inline-flex items-center">
        <span className={`skeleton-shimmer inline-block w-20 rounded-pub-sm ${altoSkeleton}`} aria-hidden="true" />
        <span className="sr-only" role="status">Calculando precio…</span>
      </span>
    );
  if (error || precio == null)
    return <span className={`font-pub-heading font-bold text-pub-danger ${tamano}`}>Precio no disponible</span>;

  return (
    <span className={`font-pub-heading font-extrabold text-pub-accent ${tamano} ${pop ? "pub-price-pop" : ""}`}>
      {formatearMoneda(precio)}
    </span>
  );
}

interface RecapSeleccionProps {
  fecha: string;
  form: ReturnType<typeof useReservaForm>;
  aperturaMin: number;
  precio: number | undefined;
  loading: boolean;
  error: boolean;
}

function RecapSeleccion({ fecha, form, aperturaMin, precio, loading, error }: RecapSeleccionProps) {
  const minutos = calcularDuracionMinutos(form.horaInicio, form.horaFin, aperturaMin);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-pub-border pb-4">
      <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-pub-text-secondary">
        <Check size={14} className="shrink-0 text-pub-secondary" />
        <span className="leading-relaxed">
          {formatearCorta(fecha)} · <b className="text-pub-text">{form.horaInicio}–{form.horaFin}</b> ·{" "}
          {formatearDuracion(minutos)}
        </span>
      </div>
      <PrecioAnimado precio={precio} loading={loading} error={error} size="lg" />
    </div>
  );
}

interface PantallaExitoProps {
  exito: NonNullable<ReturnType<typeof useReservaForm>["exito"]>;
  onOtraReserva: () => void;
  onNavegar: (vista: VistaPublica) => void;
}

function PantallaExito({ exito, onOtraReserva, onNavegar }: PantallaExitoProps) {
  const tituloRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    tituloRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: PUB_TRANSITION.base.ease }}
        className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-pub-success/15"
      >
        <motion.span
          initial={{ opacity: 0.6, scale: 0.8 }}
          animate={{ opacity: 0, scale: 1.7 }}
          transition={{ duration: 0.7, delay: 0.15, ease: PUB_TRANSITION.base.ease }}
          className="absolute inset-0 rounded-full border-2 border-pub-success"
        />
        <Check size={30} strokeWidth={2.4} className="text-pub-success" />
      </motion.div>

      <h1 ref={tituloRef} tabIndex={-1} className="font-pub-heading text-[21px] font-bold text-pub-text">¡Turno reservado!</h1>
      <p className="max-w-[280px] text-[13px] text-pub-muted">
        Tu turno queda reservado por 15 minutos. Te estamos abriendo WhatsApp para confirmar los detalles.
      </p>

      <div className="mt-4 flex w-full flex-col gap-2 rounded-pub-lg border border-pub-border bg-pub-surface p-4 text-left">
        <FilaResumen label="Fecha" valor={formatearFecha(exito.fecha)} />
        <FilaResumen label="Horario" valor={`${exito.horaInicio} a ${exito.horaFin}`} />
        <FilaResumen label="Precio" valor={formatearMoneda(exito.precio)} destacado />
      </div>

      <a
        href={exito.link}
        className="pub-transition pub-focus-ring mt-5 flex w-full items-center justify-center gap-2 rounded-pub-pill bg-pub-accent px-5 py-3.5 font-pub-heading text-[14px] font-bold tracking-wide text-pub-on-accent uppercase active:scale-[0.96] motion-reduce:active:scale-100"
      >
        <MessageCircle size={16} /> Abrir WhatsApp ahora
      </a>
      <button
        type="button"
        onClick={onOtraReserva}
        className="pub-transition pub-focus-ring mt-2.5 w-full rounded-pub-pill border border-pub-border bg-transparent px-5 py-3 text-[13.5px] font-semibold text-pub-text active:scale-[0.96] motion-reduce:active:scale-100"
      >
        Reservar otro turno
      </button>
      <button type="button" onClick={() => onNavegar("home")} className="pub-focus-ring mt-3 rounded-pub-sm text-[12.5px] font-semibold text-pub-secondary">
        Volver al inicio
      </button>
    </div>
  );
}

function FilaResumen({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-pub-muted">{label}</span>
      <span className={`font-bold ${destacado ? "text-pub-accent text-[16px]" : "text-pub-text"}`}>{valor}</span>
    </div>
  );
}
