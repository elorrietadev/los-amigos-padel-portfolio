// PublicHomeView — Home pública nueva (PUBLIC-R2), basada en el artifact
// aprobado. Todo dato mostrado sale de configuración/hooks reales
// (useConfiguracionReservas/useFranjaOperativa/useDisponibilidad vía
// usePublicHoy, usePrecioBasePublico) — nada hardcodeado de nuevo. El
// catálogo todavía no tiene backend público (PUBLIC-R4): acá solo se navega
// hacia una vista de categorías genérica, sin precios/productos.
//
// Un solo componente responsive (no una versión "mobile" y otra "desktop"
// separadas): en `lg` la grilla reordena hero/Hoy/datos rápidos a 3
// columnas — igual contenido, otra composición, evitando la landing
// estirada. El header con logo+toggle de tema es propio de esta vista solo
// en mobile: en desktop esa marca/toggle ya los da PublicTopNav.
import { CalendarClock, ChevronRight, ImageOff, MapPin, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { PadelBallLogo, PubButton, PubCard, PubChip } from "../../components/ui-public";
import { construirLinkComoLlegar } from "../../config/contenidoPublico";
import { formatearMoneda } from "../../lib/format";
import { pubStaggerContainer, pubStaggerItem } from "../../lib/motion-public";
import { useTheme } from "../../lib/theme";
import { obtenerUrlImagenProducto } from "../catalogo-public/catalogo.api";
import { productosDestacados } from "../catalogo-public/catalogo.logic";
import type { ProductoPublico } from "../catalogo-public/catalogo.types";
import { useCatalogoPublico } from "../catalogo-public/useCatalogoPublico";
import { usePrecioBasePublico } from "../reservations-public/usePrecioBasePublico";
import { useDatosPublicosCancha } from "./useDatosPublicosCancha";
import type { VistaPublica } from "./nav.config";
import { usePublicHoy, type PublicHoy } from "./usePublicHoy";

export interface PublicHomeViewProps {
  onNavegar: (vista: VistaPublica) => void;
}

export function PublicHomeView({ onNavegar }: PublicHomeViewProps) {
  const hoy = usePublicHoy();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="mx-auto flex w-full max-w-[1100px] min-w-0 flex-col gap-6 px-4 py-5 lg:gap-8 lg:px-10 lg:py-10">
      <div className="flex items-center justify-between lg:hidden">
        <div className="flex items-center gap-1 font-pub-heading text-[15px] font-semibold text-pub-text min-[360px]:gap-1.5 min-[360px]:text-base">
          <PadelBallLogo size={40} className="-my-0.5 -ml-1" />
          LOS AMIGOS <b className="font-extrabold text-pub-accent">PADEL</b>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          className="pub-transition flex h-9 w-9 items-center justify-center rounded-pub-pill border border-pub-border bg-pub-surface text-pub-text active:scale-[0.9] motion-reduce:active:scale-100 pub-focus-ring"
        >
          {theme === "dark" ? <Moon size={16} strokeWidth={1.8} /> : <Sun size={16} strokeWidth={1.8} />}
        </button>
      </div>

      <motion.div variants={pubStaggerContainer} initial="initial" animate="animate" className="grid gap-5 lg:grid-cols-3 lg:gap-6">
        <motion.div variants={pubStaggerItem} className="lg:col-span-2">
          <div className="relative overflow-hidden rounded-pub-lg border border-pub-border bg-pub-surface p-5 shadow-pub-sm min-[390px]:p-6 lg:flex lg:h-full lg:flex-col lg:justify-center lg:p-9">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-20 -right-14 h-56 w-56 rounded-full lg:-top-24 lg:-right-20 lg:h-72 lg:w-72"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in srgb, var(--color-pub-accent) 20%, transparent) 0%, transparent 70%)",
              }}
            />
            <div className="relative flex flex-col items-start gap-5 lg:gap-6">
              <div>
                <h1 className="max-w-[14ch] font-pub-heading text-[28px] leading-[1.12] font-bold text-balance text-pub-text min-[390px]:text-[32px] lg:text-[42px]">
                  Reservá tu cancha <span className="text-pub-accent">en segundos</span>
                </h1>
                <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-pub-text-secondary lg:text-[15.5px]">
                  Elegí el día, el horario y confirmá tu turno.
                </p>
              </div>
              <EstadoBadge hoy={hoy} />
              <div className="flex w-full flex-wrap items-center gap-4">
                <PubButton size="lg" className="flex-1 lg:flex-initial" onClick={() => onNavegar("reservar")}>
                  Reservar ahora
                </PubButton>
                <button
                  type="button"
                  onClick={() => onNavegar("catalogo")}
                  className="pub-transition pub-focus-ring hidden items-center gap-1 rounded-pub-sm text-[13px] font-bold text-pub-text-secondary hover:text-pub-accent lg:inline-flex"
                >
                  Ver catálogo <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={pubStaggerItem} className="flex flex-col gap-4">
          <HoyCard hoy={hoy} onNavegar={onNavegar} />
          <DatosRapidos hoy={hoy} />
        </motion.div>

        <motion.div variants={pubStaggerItem} className="lg:col-span-3">
          <CatalogoPreview onNavegar={onNavegar} />
        </motion.div>

        <motion.div variants={pubStaggerItem} className="lg:col-span-2">
          <UbicacionContacto />
        </motion.div>

        <motion.div variants={pubStaggerItem}>
          <TurnoFijoRow />
        </motion.div>
      </motion.div>
    </div>
  );
}

function EstadoBadge({ hoy }: { hoy: PublicHoy }) {
  if (hoy.loading) {
    return (
      <span className="skeleton-shimmer inline-block h-[34px] w-[190px] rounded-pub-pill" aria-hidden="true" />
    );
  }
  if (hoy.error) {
    return (
      <span className="inline-flex w-fit items-center gap-2 rounded-pub-pill border border-pub-border bg-pub-surface-2 px-3.5 py-2 text-xs font-semibold text-pub-text-secondary">
        Te confirmamos el horario al reservar
      </span>
    );
  }
  const texto = hoy.cerrado
    ? "Cerrado hoy"
    : hoy.abierta
      ? `Abierto ahora${hoy.franja?.horaCierre ? ` · cierra ${hoy.franja.horaCierre}` : ""}`
      : `Cerrado ahora${hoy.franja?.horaApertura ? ` · abre ${hoy.franja.horaApertura}` : ""}`;
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-pub-pill border border-pub-border bg-pub-surface-2 px-3.5 py-2 text-xs font-semibold text-pub-text-secondary">
      <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${hoy.abierta ? "bg-pub-success" : "bg-pub-terra"}`} aria-hidden="true" />
      {texto}
    </span>
  );
}

function HoyCard({ hoy, onNavegar }: { hoy: PublicHoy; onNavegar: (vista: VistaPublica) => void }) {
  return (
    <PubCard className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-pub-heading text-[11.5px] font-semibold tracking-wide text-pub-muted uppercase">Hoy</span>
        <button
          type="button"
          onClick={() => onNavegar("reservar")}
          className="rounded-pub-sm text-xs font-bold text-pub-secondary pub-focus-ring"
        >
          Ver todos los horarios ›
        </button>
      </div>

      {hoy.loading ? (
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton-shimmer h-11 flex-1 rounded-pub-md" aria-hidden="true" />
          ))}
        </div>
      ) : hoy.cerrado || hoy.error || hoy.horarios.length === 0 ? (
        <PubButton variant="outline" onClick={() => onNavegar("reservar")}>
          {hoy.cerrado ? "Ver otros días disponibles" : "Ver horarios disponibles"}
        </PubButton>
      ) : (
        <div className="flex gap-2">
          {hoy.horarios.map((hora, i) => (
            <PubChip
              key={hora}
              active={i === 0}
              onClick={() => onNavegar("reservar")}
              className="flex-1 justify-center"
              aria-label={`Reservar el horario de las ${hora}`}
            >
              {hora}
            </PubChip>
          ))}
        </div>
      )}
      {!hoy.loading && !hoy.error && !hoy.cerrado && hoy.horarios.length > 0 && <span className="text-center text-[10.5px] text-pub-muted">Próximo turno libre</span>}
    </PubCard>
  );
}

function DatosRapidos({ hoy }: { hoy: PublicHoy }) {
  // PUBLIC-R7 — precio_base_vigente real en vez de configCancha.precioHora
  // (podía divergir del precio configurado desde Configuración). Sin
  // fallback silencioso: si todavía está cargando o falló, esta celda
  // simplemente no aparece (mismo criterio que "Duración"/"Horario" abajo,
  // que ya se omiten cuando no tienen dato real).
  const precioBase = usePrecioBasePublico();
  const horarioHoy =
    !hoy.loading && !hoy.error && !hoy.cerrado && hoy.franja
      ? `Hoy ${hoy.franja.horaApertura}–${hoy.franja.horaCierre}`
      : hoy.cerrado
        ? "Cerrado hoy"
        : null;

  const stats: Array<{ label: string; value: string }> = [];
  if (!precioBase.loading && !precioBase.error && precioBase.precio != null) {
    stats.push({ label: "Por hora", value: `Desde ${formatearMoneda(precioBase.precio)}` });
  }
  if (hoy.configuracion) {
    stats.push({ label: "Duración", value: `${hoy.configuracion.duracionMinima}–${hoy.configuracion.duracionMaxima} min` });
  }
  if (horarioHoy) {
    stats.push({ label: "Horario", value: horarioHoy });
  }

  if (stats.length === 0) return null;

  return (
    <div className="flex overflow-hidden rounded-pub-lg border border-pub-border bg-pub-surface">
      {stats.map((s, i) => (
        <div key={s.label} className={`min-w-0 flex-1 px-2 py-3.5 text-center ${i < stats.length - 1 ? "border-r border-pub-border" : ""}`}>
          <div className="font-pub-heading text-[13px] leading-snug font-bold text-pub-text">{s.value}</div>
          <div className="mt-1 text-[10px] tracking-wide text-pub-muted uppercase">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// PUBLIC-R4 — preview con productos reales visibles (nunca placeholders):
// destacados primero, completando con los demás visibles hasta 3 si hace
// falta. Mientras carga o si falla, la tarjeta sigue navegando a Catálogo
// igual (el error real, si lo hay, se muestra allá) — acá alcanza con no
// mentir con datos ficticios mientras tanto.
function CatalogoPreview({ onNavegar }: { onNavegar: (vista: VistaPublica) => void }) {
  const { productos, loading } = useCatalogoPublico();
  const destacados = productosDestacados(productos);
  const preview = (destacados.length > 0 ? destacados : productos).slice(0, 3);

  // Toda la tarjeta navega a Catálogo: <button> real (no un div con onClick)
  // para que sea accesible por teclado y se anuncie como control interactivo.
  return (
    <button
      type="button"
      onClick={() => onNavegar("catalogo")}
      className="pub-transition flex w-full flex-col gap-3 border-y border-pub-border py-5 text-left hover:bg-pub-surface/50 pub-focus-ring"
    >
      <div className="flex items-baseline justify-between">
        <span className="font-pub-heading text-[11.5px] font-semibold tracking-wide text-pub-muted uppercase">En la cancha</span>
        <span className="text-xs font-bold text-pub-secondary">Ver catálogo ›</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 divide-x divide-pub-border">
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton-shimmer h-[74px] rounded-pub-md" aria-hidden="true" />
          ))}
        </div>
      ) : preview.length === 0 ? (
        <p className="text-[11px] text-pub-muted">Muy pronto vas a poder ver acá todo lo que tenemos disponible.</p>
      ) : (
        <div className="grid grid-cols-3 divide-x divide-pub-border">
          {preview.map((p) => (
            <ProductoPreviewTile key={p.id} producto={p} />
          ))}
        </div>
      )}
    </button>
  );
}

function ProductoPreviewTile({ producto }: { producto: ProductoPublico }) {
  // PUBLIC-R7 — mismo fallback que ProductoPublicoCard en Catálogo: si
  // imagen_path ya no resuelve a un archivo real, mostrar el mismo ImageOff
  // de "sin imagen" en vez del ícono roto nativo del navegador.
  const [imagenRota, setImagenRota] = useState(false);
  const mostrarImagen = producto.imagenPath && !imagenRota;
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 px-2 py-3 text-center">
      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-pub-sm bg-pub-surface">
        {mostrarImagen ? (
          <img
            src={obtenerUrlImagenProducto(producto.imagenPath!)}
            alt={producto.nombre}
            className="h-full w-full object-cover"
            onError={() => setImagenRota(true)}
          />
        ) : (
          <ImageOff size={14} strokeWidth={1.7} className="text-pub-muted" aria-hidden="true" />
        )}
      </div>
      <span className="w-full truncate text-[10.5px] font-bold text-pub-text">{producto.nombre}</span>
    </div>
  );
}

// CFG-F1 — dirección/mapa/WhatsApp salen de datos_publicos_cancha (backend
// real, administrable desde Configuración), no de un hardcode del bundle.
function UbicacionContacto() {
  const { datos, loading, error } = useDatosPublicosCancha();

  if (loading) {
    return (
      <section className="flex flex-col gap-3 py-4">
        <span className="skeleton-shimmer h-4 w-36 rounded-pub-sm" aria-hidden="true" />
        <span className="skeleton-shimmer h-4 w-full rounded-pub-sm" aria-hidden="true" />
        <div className="flex gap-2">
          <span className="skeleton-shimmer h-10 flex-1 rounded-pub-md" aria-hidden="true" />
          <span className="skeleton-shimmer h-10 flex-1 rounded-pub-md" aria-hidden="true" />
        </div>
      </section>
    );
  }

  if (error || !datos) {
    return (
      <section className="flex flex-col gap-3 py-4">
        <span className="font-pub-heading text-[11.5px] font-semibold tracking-wide text-pub-muted uppercase">
          Ubicación y contacto
        </span>
        <p className="text-[12.5px] text-pub-muted">No pudimos cargar estos datos. Probá de nuevo más tarde.</p>
      </section>
    );
  }

  const linkMaps = construirLinkComoLlegar(datos.mapaLat, datos.mapaLng);
  const linkWhatsapp = `https://wa.me/${datos.whatsappNumero}`;

  return (
    <section className="flex flex-col gap-3 py-4">
      <span className="font-pub-heading text-[11.5px] font-semibold tracking-wide text-pub-muted uppercase">
        Ubicación y contacto
      </span>
      <div className="flex items-center gap-2 text-[13px] text-pub-text-secondary">
        <MapPin size={15} strokeWidth={1.8} className="shrink-0 text-pub-accent" />
        {datos.direccion}
      </div>
      <div className="flex gap-2">
        <a
          href={linkMaps}
          target="_blank"
          rel="noopener noreferrer"
          className="pub-transition flex-1 rounded-pub-md border border-pub-border py-2.5 text-center text-[11.5px] font-bold tracking-wide text-pub-text uppercase active:scale-[0.96] pub-focus-ring"
        >
          Cómo llegar
        </a>
        <a
          href={linkWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="pub-transition flex-1 rounded-pub-md border border-[#25D366]/45 bg-[#25D366]/15 py-2.5 text-center text-[11.5px] font-bold tracking-wide text-pub-text uppercase active:scale-[0.96] pub-focus-ring"
        >
          WhatsApp
        </a>
      </div>
    </section>
  );
}

function TurnoFijoRow() {
  return (
    <a
      href="/baja/"
      className="pub-transition flex h-full items-center gap-3 border-t border-pub-border py-4 hover:text-pub-secondary pub-focus-ring"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pub-md bg-pub-surface-2">
        <CalendarClock size={16} strokeWidth={1.8} className="text-pub-secondary" />
      </span>
      <div className="flex-1">
        <div className="text-[12.5px] font-bold text-pub-text">¿Tenés un turno fijo?</div>
        <div className="text-[11px] text-pub-muted">Gestionar baja</div>
      </div>
      <ChevronRight size={16} className="shrink-0 text-pub-muted" aria-hidden="true" />
    </a>
  );
}
