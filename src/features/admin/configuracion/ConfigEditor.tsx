import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { IconButton } from "../../../components/ui/IconButton";
import { ConfirmModal } from "../components/ConfirmModal";
import { useDialogFocus } from "../components/useDialogFocus";
import {
  DatosPublicosForm,
  FechaEspecialForm,
  HorarioDiaForm,
  NumberField,
  TarifaDuracionForm,
  TarifaFranjaForm,
} from "./ConfigForms";
import {
  dinero,
  type ConfigEdit,
  type ConfigValues,
} from "./configuracion.types";

export function ConfigEditor({
  edit,
  onClose,
  onGuardar,
  impactos = [],
}: {
  edit: ConfigEdit;
  onClose: () => void;
  onGuardar: (edit: ConfigEdit) => Promise<void>;
  impactos?: string[];
}) {
  const [value, setValue] = useState<ConfigValues>(() => ({
    ...edit.item.values,
    dias: [...(edit.item.values.dias ?? [])],
  }));
  const [confirmando, setConfirmando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const focus = useDialogFocus(onClose, busy || confirmando);
  const reduced = useReducedMotion();
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  const props = { value, onChange: setValue, disabled: busy };
  async function guardar() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onGuardar({ ...edit, item: { ...edit.item, values: value } });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar. Revisá los valores e intentá de nuevo.",
      );
      setConfirmando(false);
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-2 sm:items-center sm:p-5"
        onClick={() => {
          if (!busy && !confirmando) onClose();
        }}
      >
        <motion.div
          {...focus}
          role="dialog"
          aria-modal="true"
          aria-label={`${edit.nuevo ? "Agregar" : "Editar"} ${edit.item.titulo}`}
          aria-busy={busy}
          inert={confirmando || undefined}
          initial={{
            opacity: 0,
            transform: reduced ? "none" : "translateY(12px)",
          }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[calc(100dvh-16px)] w-full max-w-[480px] overflow-y-auto rounded-xl border border-border bg-surface-elevated p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-lg sm:max-h-[calc(100dvh-40px)] sm:p-6"
        >
          <div className="mb-5 flex items-start justify-between gap-2">
            <div>
              <p className="mb-1 text-label font-semibold uppercase tracking-widest text-muted">
                Configuración de la cancha
              </p>
              <h2 className="break-words font-heading text-section-title text-text">
                {edit.item.titulo}
              </h2>
            </div>
            <IconButton
              aria-label="Cerrar formulario"
              onClick={onClose}
              disabled={busy}
            >
              <X size={19} />
            </IconButton>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              setConfirmando(true);
            }}
            className="space-y-4"
          >
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              {edit.item.tipo === "precio" && (
                <NumberField
                  {...props}
                  label="Precio base por hora ($)"
                  field="valor"
                />
              )}
              {edit.item.tipo === "horario" && <HorarioDiaForm {...props} />}
              {edit.item.tipo === "duraciones" && (
                <>
                  <NumberField
                    {...props}
                    label="Duración mínima (minutos)"
                    field="minimo"
                  />
                  <NumberField
                    {...props}
                    label="Duración máxima (minutos)"
                    field="maximo"
                  />
                </>
              )}
              {edit.item.tipo === "duracion" && (
                <TarifaDuracionForm {...props} />
              )}
              {edit.item.tipo === "franja" && <TarifaFranjaForm {...props} />}
              {edit.item.tipo === "reserva" && (
                <NumberField
                  {...props}
                  label={`${edit.item.titulo}${edit.item.unidad ? ` (${edit.item.unidad})` : ""}`}
                  field="valor"
                />
              )}
              {edit.item.tipo === "fecha" && <FechaEspecialForm {...props} />}
              {edit.item.tipo === "publico" && <DatosPublicosForm {...props} />}
            </fieldset>
            {error && (
              <p
                role="alert"
                className="rounded-md bg-error-muted p-3 text-body-sm text-error"
              >
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" loading={busy}>
                Guardar
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
      {confirmando && (
        <ConfirmModal
          ariaLabel="Confirmar cambio de configuración"
          confirmVariant="primary"
          closeLabel="Cancelar"
          confirmLabel={busy ? "Guardando…" : "Confirmar cambio"}
          busy={busy}
          zIndexClassName="z-[60]"
          onClose={() => setConfirmando(false)}
          onConfirm={guardar}
          mensaje={
            <>
              <strong className="block mb-3">
                {edit.item.tipo === "precio"
                  ? `Vas a cambiar el precio base de ${dinero(edit.item.values.valor)} a ${dinero(value.valor)}.`
                  : `¿Confirmar los cambios en ${edit.item.titulo.toLowerCase()}?`}
              </strong>
              <span className="block text-muted">
                {edit.item.tipo === "precio"
                  ? "Esto afectará las nuevas reservas. Las reservas existentes no cambiarán."
                  : "Revisá los valores antes de confirmar el cambio."}
              </span>
              {impactos.map((aviso, index) => (
                <span
                  key={index}
                  className="mt-3 block rounded-md bg-warning-muted p-3 text-warning"
                >
                  {aviso}
                </span>
              ))}
            </>
          }
        />
      )}
    </>,
    document.body,
  );
}
