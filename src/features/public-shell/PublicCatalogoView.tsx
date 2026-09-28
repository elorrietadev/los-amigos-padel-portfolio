// PublicCatalogoView (PUBLIC-R4) — catálogo público real, conectado a
// productos reales vía useCatalogoPublico (vista productos_publicos,
// filtrada server-side por mostrar_en_catalogo=true AND activo=true —
// nunca un producto oculto llega siquiera a este cliente). Reemplaza el
// placeholder de categorías genéricas de PUBLIC-R2.
//
// Deliberadamente SIN carrito/comprar/reservar-producto ni stock numérico:
// es un catálogo informativo (qué hay y a cuánto), no un e-commerce — el
// pedido real sigue siendo en el mostrador de la cancha.
//
// stock=0 -> se MUESTRA igual, con badge "Sin stock" (no se oculta). Ocultar
// haría que un producto apareciera y desapareciera del catálogo cada vez que
// se repone/agota, lo cual es más confuso que informativo para alguien que
// ya vio el producto en una visita anterior; mostrarlo con el aviso es más
// transparente (evita que alguien venga specialmente a buscar algo que no
// está) y es una decisión de catálogo (mostrar_en_catalogo), no de stock.
import { ImageOff, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { PubCard } from "../../components/ui-public";
import { formatearMoneda } from "../../lib/format";
import { pubStaggerContainer, pubStaggerItem } from "../../lib/motion-public";
import { obtenerUrlImagenProducto } from "../catalogo-public/catalogo.api";
import { agruparPorCategoria } from "../catalogo-public/catalogo.logic";
import type { ProductoPublico } from "../catalogo-public/catalogo.types";
import { useCatalogoPublico } from "../catalogo-public/useCatalogoPublico";

export function PublicCatalogoView() {
  const { productos, loading, error } = useCatalogoPublico();
  const grupos = agruparPorCategoria(productos);

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-5 px-4 py-6 lg:py-12">
      <div>
        <h1 className="font-pub-heading text-[21px] font-bold text-pub-text lg:text-[28px]">Catálogo</h1>
        <p className="mt-1 text-[12.5px] text-pub-muted lg:text-[14px]">Lo que tenemos disponible en la cancha.</p>
      </div>

      {error && (
        <div role="alert" className="rounded-pub-md border border-pub-danger/40 bg-pub-danger/10 p-3 text-[13px] font-medium text-pub-danger">
          No se pudo cargar el catálogo. Probá recargar la página.
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="skeleton-shimmer aspect-[3/4] rounded-pub-lg" aria-hidden="true" />
          ))}
        </div>
      ) : !error && productos.length === 0 ? (
        <p className="text-[13px] text-pub-muted">Todavía no cargamos productos en el catálogo. Volvé a pasar pronto.</p>
      ) : (
        <motion.div variants={pubStaggerContainer} initial="initial" animate="animate" className="flex flex-col gap-6">
          {grupos.map((grupo) => (
            <div key={grupo.categoria} className="flex flex-col gap-3">
              <h2 className="font-pub-heading text-[13px] font-bold tracking-wide text-pub-text-secondary uppercase">
                {grupo.categoria}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {grupo.productos.map((producto) => (
                  <ProductoPublicoCard key={producto.id} producto={producto} />
                ))}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function ProductoPublicoCard({ producto }: { producto: ProductoPublico }) {
  // PUBLIC-R7 — imagen_path puede apuntar a un archivo que ya no existe en el
  // bucket (borrado/movido desde el admin sin actualizar el producto): sin
  // este fallback, el navegador mostraba el ícono roto nativo en vez del
  // mismo ImageOff que ya se usa para "sin imagen".
  const [imagenRota, setImagenRota] = useState(false);
  const mostrarImagen = producto.imagenPath && !imagenRota;
  return (
    <motion.div variants={pubStaggerItem}>
      <PubCard className="flex h-full flex-col overflow-hidden">
        <div className="relative aspect-square w-full bg-pub-surface-2">
          {mostrarImagen ? (
            <img
              src={obtenerUrlImagenProducto(producto.imagenPath!)}
              alt={producto.nombre}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setImagenRota(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageOff size={22} strokeWidth={1.6} className="text-pub-muted" aria-hidden="true" />
            </div>
          )}
          {producto.destacado && (
            <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-pub-pill bg-pub-accent px-2 py-0.5 text-[9.5px] font-extrabold tracking-wide text-pub-on-accent uppercase">
              <Sparkles size={10} strokeWidth={2.5} /> Destacado
            </span>
          )}
          {!producto.enStock && (
            <span className="absolute top-1.5 right-1.5 rounded-pub-pill border border-pub-border bg-pub-bg/90 px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-pub-muted uppercase">
              Sin stock
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-2.5">
          <span className="text-[12.5px] font-bold text-pub-text">{producto.nombre}</span>
          {producto.descripcionPublica && (
            <p className="line-clamp-2 text-[11px] text-pub-muted">{producto.descripcionPublica}</p>
          )}
          <span className="mt-auto pt-1 text-[13.5px] font-extrabold text-pub-accent">
            {formatearMoneda(producto.precioVenta)}
          </span>
        </div>
      </PubCard>
    </motion.div>
  );
}
