// PublicInformacionView (PUBLIC-R2, rediseñada en PUBLIC-R5). Precio/duración
// salen de la misma configuración real que usa Reservar (useConfiguracionReservas
// + usePrecioBasePublico, PUBLIC-R7) — nada hardcodeado de nuevo.
//
// Horario semanal (PUBLIC-R5): R2 solo podía mostrar con certeza el de HOY
// (franja_operativa resuelve por fecha, fecha especial incluida) y por eso
// evitaba inventar "todos los días de X a Y" — ese texto podía dejar de ser
// cierto en cuanto un admin desactivara un día o le cambiara el horario desde
// Configuración (ver C4/C10). El contrato público mínimo para resolver esto
// YA EXISTÍA sin usarse: horarios_semana_publica (vista, grants a
// anon/authenticated desde c4_horarios_operativos.sql) — no hizo falta tocar
// el backend, solo conectarla (useHorariosSemana) y agruparla para mostrar
// (agruparHorariosSemana, en horariosSemana.logic.ts). "Hoy" se mantiene
// aparte porque sigue siendo el único dato que refleja una fecha especial
// vigente, cosa que el horario semanal nunca puede saber.
import { CalendarClock, Clock, MapPin, MessageCircle, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { construirLinkComoLlegar, contenidoPublico } from "../../config/contenidoPublico";
import { hoyISO } from "../../lib/datetime";
import { formatearMoneda } from "../../lib/format";
import { pubStaggerContainer, pubStaggerItem } from "../../lib/motion-public";
// lucide-react no tiene ícono de Instagram (logos de marca fuera de su set) —
// se reusa el mismo SVG oficial que ya usa InstagramCard.tsx.
import { IconInstagram } from "../reservations-public/components/icons";
import { useConfiguracionReservas } from "../reservations-public/useConfiguracionReservas";
import { useFranjaOperativa } from "../reservations-public/useFranjaOperativa";
import { usePrecioBasePublico } from "../reservations-public/usePrecioBasePublico";
import { useDatosPublicosCancha } from "./useDatosPublicosCancha";
import { agruparHorariosSemana } from "./horariosSemana.logic";
import { useHorariosSemana } from "./useHorariosSemana";

export function PublicInformacionView() {
  const { franja, loading: franjaLoading } = useFranjaOperativa(hoyISO());
  const { configuracion, loading: configLoading } = useConfiguracionReservas();
  const { precio: precioBase, loading: precioBaseLoading, error: precioBaseError } = usePrecioBasePublico();
  const { dias: diasSemana, loading: horariosLoading, error: horariosError } = useHorariosSemana();
  // CFG-F1 — dirección/mapa/WhatsApp/Instagram salen de datos_publicos_cancha
  // (backend real, administrable), no de config/contenidoPublico.ts.
  const { datos: datosPublicos, loading: datosPublicosLoading, error: datosPublicosError } = useDatosPublicosCancha();
  const grupos = agruparHorariosSemana(diasSemana);
  const linkMaps = datosPublicos ? construirLinkComoLlegar(datosPublicos.mapaLat, datosPublicos.mapaLng) : "";

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-6 lg:py-12">
      <div>
        <h1 className="font-pub-heading text-[21px] font-bold text-pub-text lg:text-[28px]">Información</h1>
        <p className="mt-1 text-[12.5px] text-pub-muted lg:text-[14px]">Todo lo que necesitás saber antes de ir.</p>
      </div>

      <motion.div variants={pubStaggerContainer} initial="initial" animate="animate" className="grid gap-3 lg:grid-cols-2">
        <motion.div variants={pubStaggerItem} className="lg:col-span-2">
          <section className="flex flex-col gap-3 border-b border-pub-border py-5">
            <CardTitle icon={Clock} label="Horarios" />

            <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-pub-accent pl-3 py-2.5 text-[13px]">
              <span className="font-bold tracking-wide text-pub-accent uppercase">Hoy</span>
              {franjaLoading ? (
                <span className="skeleton-shimmer h-4 w-24 rounded-pub-sm" aria-hidden="true" />
              ) : franja && !franja.cerrado ? (
                <span className="font-bold text-pub-text">
                  {franja.horaApertura} a {franja.horaCierre} hs
                </span>
              ) : franja?.cerrado ? (
                <span className="font-bold text-pub-warning">Cerrado</span>
              ) : (
                <span className="text-pub-muted">Te confirmamos el horario al reservar.</span>
              )}
            </div>

            {horariosLoading ? (
              <div className="flex flex-col gap-1.5">
                <span className="skeleton-shimmer h-4 w-full rounded-pub-sm" aria-hidden="true" />
                <span className="skeleton-shimmer h-4 w-4/5 rounded-pub-sm" aria-hidden="true" />
              </div>
            ) : horariosError || grupos.length === 0 ? (
              <p className="text-[12.5px] text-pub-muted">
                No pudimos cargar el horario semanal completo. Consultanos por WhatsApp.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {grupos.map((g) => (
                  <div key={g.etiquetaDias} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px]">
                    <span className="text-pub-muted">{g.etiquetaDias}</span>
                    <span className={`font-semibold ${g.abierto ? "text-pub-text" : "text-pub-warning"}`}>
                      {g.abierto ? `${g.horaApertura} a ${g.horaCierre} hs` : "Cerrado"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-pub-muted">
              El horario de una fecha puntual puede variar por un feriado o evento especial — el de "Hoy" arriba ya lo tiene en cuenta.
            </p>
          </section>
        </motion.div>

        <motion.div variants={pubStaggerItem}>
          <section className="flex h-full flex-col gap-3 border-b border-pub-border py-5">
            <CardTitle icon={Wallet} label="Precio y duración" />
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px]">
              <span className="text-pub-muted">Por hora</span>
              <span className="font-bold text-pub-text">
                {precioBaseLoading || precioBaseError || precioBase == null ? "—" : formatearMoneda(precioBase)}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px]">
              <span className="text-pub-muted">Duración del turno</span>
              <span className="font-bold text-pub-text">
                {configLoading || !configuracion ? "—" : `${configuracion.duracionMinima}–${configuracion.duracionMaxima} min`}
              </span>
            </div>
          </section>
        </motion.div>

        <motion.div variants={pubStaggerItem}>
          <section className="flex h-full flex-col gap-3 border-b border-pub-border py-5">
            <CardTitle icon={MapPin} label="Ubicación" />
            {datosPublicosLoading ? (
              <span className="skeleton-shimmer h-4 w-2/3 rounded-pub-sm" aria-hidden="true" />
            ) : datosPublicosError || !datosPublicos ? (
              <p className="text-[12.5px] text-pub-muted">No pudimos cargar la dirección. Consultanos por WhatsApp.</p>
            ) : (
              <>
                <div className="text-[13px] text-pub-text-secondary">{datosPublicos.direccion}</div>
                <a
                  href={linkMaps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pub-transition mt-1 rounded-pub-md border border-pub-border py-2.5 text-center text-[11.5px] font-bold tracking-wide text-pub-text uppercase active:scale-[0.96] pub-focus-ring"
                >
                  Cómo llegar
                </a>
              </>
            )}
          </section>
        </motion.div>

        <motion.div variants={pubStaggerItem} className="lg:col-span-2">
          <section className="flex h-full flex-col gap-3 border-b border-pub-border py-5">
            <CardTitle icon={MessageCircle} label="Contacto" />
            {datosPublicosLoading ? (
              <span className="skeleton-shimmer h-10 w-full rounded-pub-md" aria-hidden="true" />
            ) : datosPublicosError || !datosPublicos ? (
              <p className="text-[12.5px] text-pub-muted">No pudimos cargar los datos de contacto.</p>
            ) : (
              <div className="flex gap-2">
                <a
                  href={`https://wa.me/${datosPublicos.whatsappNumero}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pub-transition flex flex-1 items-center justify-center gap-1.5 rounded-pub-md border border-[#25D366]/45 bg-[#25D366]/15 py-2.5 text-[11.5px] font-bold tracking-wide text-pub-text uppercase active:scale-[0.96] pub-focus-ring"
                >
                  <MessageCircle size={14} /> WhatsApp
                </a>
                {datosPublicos.instagramUrl && (
                  <a
                    href={datosPublicos.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pub-transition flex flex-1 items-center justify-center gap-1.5 rounded-pub-md border border-pub-border py-2.5 text-[11.5px] font-bold tracking-wide text-pub-text uppercase active:scale-[0.96] pub-focus-ring"
                  >
                    <IconInstagram size={14} /> Instagram
                  </a>
                )}
              </div>
            )}
          </section>
        </motion.div>

        <motion.div variants={pubStaggerItem} className="lg:col-span-2">
          <section className="flex h-full flex-col gap-3 border-b border-pub-border py-5">
            <CardTitle icon={Clock} label="Reglas de la cancha" />
            <ul className="flex flex-col gap-1.5 pl-4 text-[13px] text-pub-text-secondary">
              {contenidoPublico.reglas.map((regla) => (
                <li key={regla} className="list-disc">
                  {regla}
                </li>
              ))}
            </ul>
          </section>
        </motion.div>

        <motion.div variants={pubStaggerItem} className="lg:col-span-2">
          <a
            href="/baja/"
            className="pub-transition flex items-center gap-3 py-4 hover:text-pub-secondary pub-focus-ring"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pub-md bg-pub-surface-2">
              <CalendarClock size={16} strokeWidth={1.8} className="text-pub-secondary" />
            </span>
            <div className="flex-1">
              <div className="text-[12.5px] font-bold text-pub-text">¿Tenés un turno fijo?</div>
              <div className="text-[11px] text-pub-muted">Gestionar baja</div>
            </div>
          </a>
        </motion.div>
      </motion.div>
    </div>
  );
}

function CardTitle({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <div className="flex items-center gap-2 font-pub-heading text-[11.5px] font-semibold tracking-wide text-pub-muted uppercase">
      <Icon size={14} strokeWidth={1.8} className="text-pub-accent" />
      {label}
    </div>
  );
}
