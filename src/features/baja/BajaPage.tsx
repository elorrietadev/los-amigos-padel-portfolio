// Port de baja.html (función App(), líneas 123-293), rediseñado en PUBLIC-R5
// con la identidad pública nueva (tokens pub-*, PubCard/PubButton, motion-public)
// en vez de los tokens compartidos legacy que tenía hasta ahora. TODA la
// lógica de negocio sigue viviendo en useBajaTurnoFijo/baja.logic/baja.api —
// esto es composición pura, solo cambia lo visual.
import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, MessageCircle, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { PubButton, PubCard } from "../../components/ui-public";
import { PUB_TRANSITION, usarPubReducedMotion } from "../../lib/motion-public";
import { useTheme } from "../../lib/theme";
import { useDatosPublicosCancha } from "../public-shell/useDatosPublicosCancha";
import { Overlay } from "./components/Overlay";
import { DIAS_SEMANA, formatearFechaLarga, mensajeEstadoCarga } from "./baja.logic";
import { useBajaTurnoFijo } from "./useBajaTurnoFijo";

// Grid de ocurrencias — mejora visual aprobada explícitamente sobre el legacy
// (baja.html:213-232 era una sola columna, lista plana). La lógica de estados
// sigue siendo exactamente `o.cancelada`/`o.puede_cancelar`, sin recalcular
// nada: esto solo decide qué clases aplicar según esos mismos 2 booleans.
type EstadoVisualOcurrencia = "disponible" | "cancelada" | "plazo";

function estadoVisualOcurrencia(o: { cancelada: boolean; puede_cancelar: boolean }): EstadoVisualOcurrencia {
  if (o.cancelada) return "cancelada";
  if (!o.puede_cancelar) return "plazo";
  return "disponible";
}

const CLASES_CARD_OCURRENCIA: Record<EstadoVisualOcurrencia, string> = {
  disponible: "border-pub-border bg-pub-surface hover:border-pub-accent/50",
  cancelada: "border-pub-border/50 bg-pub-surface/60 opacity-65",
  plazo: "border-pub-warning/35 bg-pub-surface",
};

export function BajaPage() {
  const {
    estado,
    confirmando,
    cerrandoConfirmar,
    avisoFecha,
    cerrandoAviso,
    enviando,
    exito,
    pedirBaja,
    cancelarConfirmacion,
    confirmarBaja,
    cerrarAviso,
    cerrarExito,
  } = useBajaTurnoFijo();
  // Estado exclusivamente visual: conservar el ID durante el refetch de la baja.
  const [horarioId, setHorarioId] = useState<string | null>(null);
  const [navegacionConTeclado, setNavegacionConTeclado] = useState(false);
  const focoPendiente = useRef(false);
  const reducirMovimiento = usarPubReducedMotion();
  const turnos = estado.fase === "datos" ? estado.datos.turnos : [];
  const horario = turnos.length === 1 ? turnos[0] : turnos.find((t) => t.turno_fijo_id === horarioId);
  const variosHorarios = turnos.length > 1;
  const enfocarPaso = (elemento: HTMLHeadingElement | null) => {
    if (elemento && focoPendiente.current) {
      elemento.focus({ preventScroll: true });
      focoPendiente.current = false;
    }
  };
  const elegirHorario = (id: string | null, desdeTeclado: boolean) => {
    focoPendiente.current = true;
    setNavegacionConTeclado(desdeTeclado);
    setHorarioId(id);
  };
  const { theme, toggleTheme } = useTheme();
  // CFG-F1.1 — nombre/WhatsApp reales de la cancha (datos_publicos_cancha),
  // no el hardcode de canchaConfig.ts.
  const { datos: datosPublicos } = useDatosPublicosCancha();

  // TF-R2 — el horario a mostrar en la confirmación depende de CUÁL turno
  // fijo se está cancelando (antes era el único horario del titular).
  const turnoConfirmando =
    estado.fase === "datos" && confirmando
      ? estado.datos.turnos.find((t) => t.turno_fijo_id === confirmando.turnoFijoId)
      : undefined;

  return (
    <div className="min-h-dvh bg-pub-bg text-pub-text">
      <div className="mx-auto flex max-w-[460px] flex-col px-4 pt-6 pb-16 sm:max-w-[560px] lg:pt-10">
        <div className="mb-6 flex items-center justify-between">
          <a
            href="/"
            className="pub-transition pub-focus-ring inline-flex items-center gap-1.5 rounded-pub-pill border border-pub-border bg-pub-surface-2 px-3.5 py-2 text-[12.5px] font-bold text-pub-text active:scale-[0.94] motion-reduce:active:scale-100"
          >
            <ArrowLeft size={14} strokeWidth={2.2} />
            Inicio
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            className="pub-transition flex h-9 w-9 items-center justify-center rounded-pub-pill border border-pub-border bg-pub-surface text-pub-text active:scale-[0.9] motion-reduce:active:scale-100 pub-focus-ring"
          >
            {theme === "dark" ? <Moon size={16} strokeWidth={1.8} /> : <Sun size={16} strokeWidth={1.8} />}
          </button>
        </div>

        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex items-center gap-2 font-pub-heading text-lg font-bold text-pub-text">
            <span
              className="h-[22px] w-[22px] shrink-0 rounded-full"
              style={{ background: "radial-gradient(circle at 32% 28%, #EFFFA8, var(--color-pub-accent) 55%, #8FBF2E 100%)" }}
              aria-hidden="true"
            />
            {datosPublicos?.nombreCancha ?? ""}
          </div>
          <div className="mt-1 text-[13px] text-pub-muted">Baja de turno fijo</div>
        </div>

        {estado.fase === "cargando" && (
          <div className="flex flex-col gap-2.5">
            <span className="skeleton-shimmer block h-[76px] rounded-pub-lg" aria-hidden="true" />
            <span className="skeleton-shimmer block h-[54px] rounded-pub-lg" aria-hidden="true" />
            <span className="skeleton-shimmer block h-[54px] rounded-pub-lg" aria-hidden="true" />
          </div>
        )}

        {/* sin_token/token_invalido reusan los mensajes exactos del legacy;
            error_carga es el único texto nuevo (ver baja.logic.ts). */}
        {(estado.fase === "sin_token" || estado.fase === "token_invalido" || estado.fase === "error_carga") && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={PUB_TRANSITION.base}>
            <PubCard className="flex flex-col items-center gap-3 p-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pub-warning/15">
                <AlertTriangle size={22} strokeWidth={1.8} className="text-pub-warning" />
              </span>
              <p className="text-[13.5px] text-pub-text-secondary">{mensajeEstadoCarga(estado.fase)}</p>
              {datosPublicos?.whatsappNumero && (
                <a
                  href={`https://wa.me/${datosPublicos.whatsappNumero}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pub-transition pub-focus-ring mt-1 inline-flex items-center gap-1.5 rounded-pub-pill border border-[#25D366]/45 bg-[#25D366]/15 px-4 py-2.5 text-[12.5px] font-bold tracking-wide text-pub-text uppercase active:scale-[0.96] motion-reduce:active:scale-100"
                >
                  <MessageCircle size={14} /> Escribinos por WhatsApp
                </a>
              )}
            </PubCard>
          </motion.div>
        )}

        {estado.fase === "datos" && (
          <>
            {(!variosHorarios || !horario) && (
              <div className="mb-5">
                <h1 className="font-pub-heading text-2xl font-bold text-pub-text">Hola, {estado.datos.nombre} 👋</h1>
                <p className="mt-2 text-[14px] leading-relaxed text-pub-text-secondary">
                  Desde acá podés avisarnos cuando no vas a poder asistir a uno de tus turnos fijos.
                </p>
              </div>
            )}

            {/* Titular sin horarios activos — no cubierto por el legacy
                (baja.html asumía siempre 1 horario). */}
            {estado.datos.turnos.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={PUB_TRANSITION.base}
                className="mt-4"
              >
                <div className="border-y border-pub-border py-6 text-center">
                  <p className="text-[13px] text-pub-muted">No tenés turnos fijos activos en este momento.</p>
                </div>
              </motion.div>
            )}

            <motion.div
              key={horario?.turno_fijo_id ?? "seleccion"}
              initial={navegacionConTeclado ? false : {
                opacity: 0,
                transform: reducirMovimiento ? "none" : "translateY(8px)",
              }}
              animate={{ opacity: 1, transform: reducirMovimiento ? "none" : "translateY(0px)" }}
              transition={PUB_TRANSITION.fast}
            >
              {variosHorarios && !horario && (
                <section aria-labelledby="baja-elegir-horario">
                  <h2 id="baja-elegir-horario" ref={enfocarPaso} tabIndex={-1}
                    className="pub-focus-ring rounded-pub-md font-pub-heading text-[15px] font-semibold">
                    ¿Cuál de tus turnos querés gestionar?
                  </h2>
                  <div className="mt-3 flex flex-col gap-3">
                    {turnos.map((turno) => (
                      <button key={turno.turno_fijo_id} type="button"
                        onClick={(event) => elegirHorario(turno.turno_fijo_id, event.detail === 0)}
                        aria-label={`${DIAS_SEMANA[turno.dia_semana]} ${turno.hora_inicio} a ${turno.hora_fin}`}
                        className="pub-transition pub-focus-ring flex w-full items-center justify-between gap-4 rounded-pub-lg border border-pub-border bg-pub-surface p-5 text-left shadow-sm hover:border-pub-accent/50 hover:bg-pub-surface-2">
                        <span>
                          <span className="block text-[11px] font-bold tracking-widest text-pub-muted uppercase">
                            {DIAS_SEMANA[turno.dia_semana]}
                          </span>
                          <span className="mt-1 block font-pub-heading text-xl font-semibold tabular-nums">
                            {turno.hora_inicio} – {turno.hora_fin}
                          </span>
                        </span>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pub-accent/10 text-pub-accent">
                          <ArrowRight size={18} aria-hidden="true" />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {horario && (
                <section
                  key={horario.turno_fijo_id}
                  aria-label={`${DIAS_SEMANA[horario.dia_semana]} ${horario.hora_inicio} a ${horario.hora_fin}`}
                  className="flex flex-col gap-3"
                >
                  {variosHorarios && (
                    <button type="button" onClick={(event) => elegirHorario(null, event.detail === 0)}
                      className="pub-transition pub-focus-ring -ml-2 mb-1 inline-flex min-h-11 items-center gap-2 self-start rounded-pub-pill px-2 text-[13px] font-semibold text-pub-text-secondary hover:text-pub-text">
                      <ArrowLeft size={16} aria-hidden="true" /> Volver
                    </button>
                  )}
                  <h2 ref={enfocarPaso} tabIndex={-1}
                    className="pub-focus-ring rounded-pub-md font-pub-heading font-bold text-pub-text">
                    <span className={variosHorarios ? "block text-[11px] tracking-widest text-pub-muted uppercase" : "text-[14px] uppercase"}>
                      {DIAS_SEMANA[horario.dia_semana]}{!variosHorarios && " · "}
                    </span>
                    <span className={variosHorarios ? "mt-1 block text-2xl tabular-nums" : "text-[14px] tabular-nums"}>
                      {horario.hora_inicio}–{horario.hora_fin}
                    </span>
                  </h2>
                  <div>
                    <p className="text-[14px] text-pub-text-secondary">Elegí el día en que no vas a poder asistir.</p>
                    <p className="mt-1 text-[12px] text-pub-muted">
                      Podés avisar hasta {estado.datos.cancelacion_horas_minimas} horas antes del turno.
                    </p>
                  </div>

                  {horario.ocurrencias.length === 0 && (
                    <p className="text-center text-[13px] text-pub-muted">
                      No hay próximas fechas para este horario.
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                    {horario.ocurrencias.map((o) => {
                      const estadoVisual = estadoVisualOcurrencia(o);
                      return (
                        <div
                          key={o.fecha}
                          className={`pub-transition flex min-h-[104px] flex-col justify-between gap-3 rounded-pub-md border p-3.5 ${CLASES_CARD_OCURRENCIA[estadoVisual]}`}
                        >
                          <div>
                            <div className="font-pub-heading text-[14.5px] font-semibold text-pub-text">
                              {formatearFechaLarga(o.fecha)}
                            </div>
                            {o.cancelada && (
                              <div className="mt-0.5 text-[11.5px] text-pub-warning">Ya diste de baja este día</div>
                            )}
                            {!o.cancelada && !o.puede_cancelar && (
                              <div className="mt-0.5 text-[11.5px] text-pub-warning">
                                Faltan menos de {estado.datos.cancelacion_horas_minimas} hs
                              </div>
                            )}
                          </div>
                          {!o.cancelada && o.puede_cancelar && (
                            <PubButton
                              variant="destructive"
                              size="sm"
                              className="w-full"
                              onClick={() => pedirBaja(horario.turno_fijo_id, o.fecha)}
                            >
                              No voy
                            </PubButton>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </motion.div>
          </>
        )}

        {/* Confirmación de baja — mejora visual aprobada explícitamente sobre el
            legacy (baja.html:236-263 solo tenía un texto plano + 2 botones
            neutros). Sigue siendo la ÚNICA confirmación: confirmarBaja() solo se
            llama desde el botón "Sí, no voy" de acá mismo, sin pasos intermedios.
            Guard `estado.fase === "datos"` porque `confirmando` solo puede estar
            seteado cuando ese es el estado real. TF-R2 — también depende de
            `turnoConfirmando` (el turno_fijo específico que se está cancelando,
            no el único horario del titular como antes) para leer su
            hora_inicio/hora_fin con seguridad de tipos. */}
        {estado.fase === "datos" && confirmando && turnoConfirmando && (
          <Overlay closing={cerrandoConfirmar} onClose={cancelarConfirmacion}>
            <div className="relative -m-[22px] overflow-hidden rounded-pub-lg border border-pub-danger/40 p-[22px]">
              {/* Glow radial estático (sin animación, no necesita reduced-motion). */}
              <div
                className="pointer-events-none absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-pub-danger/18 blur-3xl"
                aria-hidden="true"
              />

              <div className="relative flex flex-col items-center text-center">
                <div className="check-pop mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-pub-danger/50 bg-pub-danger/10">
                  <AlertTriangle size={22} strokeWidth={1.8} className="text-pub-danger" />
                </div>

                <div className="font-pub-heading text-lg font-bold text-pub-text">¿Seguro que no vas a asistir?</div>

                <div className="mt-3 text-[14.5px] leading-normal text-pub-text-secondary">
                  Vas a dar de baja tu turno del{" "}
                  <span className="font-semibold text-pub-text">{formatearFechaLarga(confirmando.fecha)}</span> de{" "}
                  <span className="font-semibold text-pub-text">
                    {turnoConfirmando.hora_inicio} a {turnoConfirmando.hora_fin}
                  </span>
                  .
                </div>

                <div className="mt-2 text-[12.5px] text-pub-muted">Al confirmar, este turno puntual quedará liberado para que otra persona pueda reservarlo.</div>

                <div className="mt-5 flex w-full gap-2.5">
                  <PubButton
                    variant="outline"
                    className="flex-1"
                    disabled={enviando}
                    onClick={cancelarConfirmacion}
                  >
                    Volver
                  </PubButton>
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={confirmarBaja}
                    aria-busy={enviando || undefined}
                    className="pub-transition inline-flex flex-1 items-center justify-center gap-2 rounded-pub-pill bg-pub-danger px-5 py-3 font-pub-heading text-[13.5px] font-bold tracking-wide text-pub-on-accent uppercase active:scale-[0.96] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)] disabled:active:scale-100"
                  >
                    {enviando ? <span className="spinner" aria-hidden="true" /> : "Sí, no voy"}
                  </button>
                </div>
              </div>
            </div>
          </Overlay>
        )}

        {/* baja.html:265-279 */}
        {avisoFecha && (
          <Overlay closing={cerrandoAviso} onClose={cerrarAviso}>
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pub-warning/15">
                <AlertTriangle size={20} strokeWidth={1.8} className="text-pub-warning" />
              </span>
              <p className="text-[13.5px] text-pub-text-secondary">{avisoFecha}</p>
              <PubButton className="w-full" onClick={cerrarAviso}>
                Entendido
              </PubButton>
            </div>
          </Overlay>
        )}

        {/* baja.html:281-290 — overlay propio, NO reutiliza Overlay (mismo
            comportamiento que el legacy: distinto z-index/blur y sin animación
            de entrada/salida vía data-closing). */}
        {exito && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-pub-bg/90 p-5 backdrop-blur-[4px]">
            <div className="mx-auto flex max-w-[300px] flex-col items-center text-center" role="dialog" aria-modal="true">
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

              <div className="font-pub-heading text-[17px] font-semibold text-pub-text">Listo, quedó avisado</div>
              <div className="mt-1.5 text-[13px] text-pub-muted">
                No vas a ir el {formatearFechaLarga(exito)}. El horario queda libre.
              </div>

              <PubButton variant="outline" className="mt-5 w-full" onClick={cerrarExito}>
                Volver
              </PubButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
