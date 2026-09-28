import { useEffect, useRef, useState } from "react";
import { ImageOff, Loader2, Upload, X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { borrarImagenProducto, obtenerUrlImagenProducto, subirImagenProducto } from "./productos.api";
import { IMAGEN_PRODUCTO_TIPOS_PERMITIDOS, validarImagenProducto } from "./productos.logic";

export interface ImagenProductoFieldProps {
  imagenPath: string | null;
  onCambiar: (path: string | null) => void;
  disabled?: boolean;
  onSubiendo?: (subiendo: boolean) => void;
}

export function ImagenProductoField({ imagenPath, onCambiar, disabled = false, onSubiendo }: ImagenProductoFieldProps) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  const inputRef = useRef<HTMLInputElement>(null);

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo dos veces seguidas
    if (!archivo) return;

    const errorValidacion = validarImagenProducto(archivo);
    if (errorValidacion) {
      setError(errorValidacion);
      return;
    }

    setError(null);
    setSubiendo(true);
    onSubiendo?.(true);
    try {
      const { path, error: errorSubida } = await subirImagenProducto(archivo);
      if (!montado.current) {
        if (path) await borrarImagenProducto(path);
        return;
      }
      if (errorSubida || !path) {
        if (path) await borrarImagenProducto(path);
        setError("No se pudo subir la imagen. Probá de nuevo.");
        return;
      }
      // El formulario conserva la propiedad del temporal hasta guardar.
      onCambiar(path);
    } catch {
      if (montado.current) setError("No se pudo subir la imagen. Probá de nuevo.");
    } finally {
      if (montado.current) { setSubiendo(false); onSubiendo?.(false); }
    }
  }

  function quitarImagen() {
    onCambiar(null);
    setError(null);
  }

  const deshabilitado = disabled || subiendo;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted">Imagen del catálogo</span>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
          {subiendo ? (
            <Loader2 size={18} className="animate-spin text-muted" aria-hidden="true" />
          ) : imagenPath ? (
            <img
              src={obtenerUrlImagenProducto(imagenPath)}
              alt="Vista previa de la imagen del producto"
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageOff size={18} className="text-muted" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={deshabilitado}
            >
              <Upload size={13} strokeWidth={2.25} />
              {imagenPath ? "Reemplazar" : "Subir imagen"}
            </Button>
            {imagenPath && (
              <Button type="button" variant="ghost" size="sm" onClick={quitarImagen} disabled={deshabilitado}>
                <X size={13} strokeWidth={2.25} />
                Quitar
              </Button>
            )}
          </div>
          <span className="text-[11px] text-muted">JPG, PNG o WebP, hasta 3 MB.</span>
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGEN_PRODUCTO_TIPOS_PERMITIDOS.join(",")}
        onChange={alElegirArchivo}
        disabled={deshabilitado}
        className="hidden"
        aria-label="Elegir imagen del producto"
      />
    </div>
  );
}
