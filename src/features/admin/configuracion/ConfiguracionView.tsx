import { useState } from "react";
import { ShieldAlert, SlidersHorizontal } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { ConfirmModal } from "../components/ConfirmModal";
import { Toast, type ToastData } from "../components/Toast";
import { ConfiguracionTabs } from "./ConfiguracionTabs";
import { ConfigEditor } from "./ConfigEditor";
import {
  GeneralConfigSection,
  HorariosConfigSection,
  DuracionesConfigSection,
  TarifasConfigSection,
  ReservasConfigSection,
  FechasEspecialesConfigSection,
  DatosPublicosConfigSection,
} from "./ConfigSections";
import {
  CONFIG_SECTIONS,
  type ConfigEdit,
  type ConfigSection,
  type ConfigFormKind,
  type ConfiguracionViewProps,
} from "./configuracion.types";
import "./configuracion.css";

const SECTIONS = {
  general: GeneralConfigSection,
  horarios: HorariosConfigSection,
  duraciones: DuracionesConfigSection,
  tarifas: TarifasConfigSection,
  reservas: ReservasConfigSection,
  fechas: FechasEspecialesConfigSection,
  publico: DatosPublicosConfigSection,
};
const NEW_TITLES = {
  duracion: "Descuento por duración",
  franja: "Franja horaria",
  fecha: "Fecha especial",
};

export function ConfiguracionView({
  data,
  estados,
  onGuardar,
  onReintentar,
  impactos,
  mensajeExito = "Cambios guardados.",
}: ConfiguracionViewProps) {
  const [section, setSection] = useState<ConfigSection>("general");
  const [edit, setEdit] = useState<ConfigEdit | null>(null);
  const [toggle, setToggle] = useState<ConfigEdit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastData | null>(null);
  const reduced = useReducedMotion();
  const state = estados?.[section];
  const info = CONFIG_SECTIONS.find((s) => s.value === section)!;
  const Section = SECTIONS[section];
  async function guardar(change: ConfigEdit) {
    if (!onGuardar) return;
    await onGuardar(change);
    setToast({ tipo: "ok", texto: mensajeExito });
  }
  function add(tipo: ConfigFormKind) {
    if (tipo !== "duracion" && tipo !== "franja" && tipo !== "fecha") return;
    setToast(null);
    setEdit({
      section,
      nuevo: true,
      item: {
        id: "",
        tipo,
        titulo: NEW_TITLES[tipo],
        values: { activo: true, cerrado: false, tarifa: "ninguna", dias: [] },
      },
    });
  }
  return (
    <div className="config-view max-w-[1280px] space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning-muted px-4 py-3.5 text-body-sm text-warning">
        <ShieldAlert size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          <strong className="font-semibold">Configuración sensible.</strong> Los
          cambios pueden afectar los precios y horarios disponibles para nuevas
          reservas.
        </p>
      </div>
      <ConfiguracionTabs
        value={section}
        onChange={(value) => {
          setSection(value);
          setToast(null);
        }}
      />
      <motion.section
        key={section}
        aria-label={info.label}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="space-y-5"
      >
        <div>
          <h2 className="font-heading text-section-title font-semibold text-text">
            {info.label === "Reservas"
              ? "Reservas y cancelaciones"
              : info.label}
          </h2>
          <p className="mt-1 text-body-sm text-muted">{info.descripcion}</p>
        </div>
        {state?.fase === "loading" ? (
          <Card role="status" aria-busy="true" className="p-6">
            <p className="text-body-sm text-muted">Cargando configuración…</p>
            <div aria-hidden="true" className="mt-5 space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-14 rounded-md bg-surface-2" />
              ))}
            </div>
          </Card>
        ) : state?.fase === "error" ? (
          <Card role="alert" className="space-y-4 p-6">
            <p className="text-body-sm text-error">
              {state.mensaje || "No se pudo cargar esta sección."}
            </p>
            {onReintentar && (
              <Button variant="secondary" onClick={() => onReintentar(section)}>
                Reintentar
              </Button>
            )}
          </Card>
        ) : !data ? (
          <Card className="flex flex-col items-start gap-4 p-6 sm:p-8">
            <span className="rounded-lg bg-surface-2 p-3 text-muted">
              <SlidersHorizontal size={28} />
            </span>
            <h3 className="font-heading text-section-title text-text">
              Configuración aún no conectada
            </h3>
            <p className="max-w-lg text-body-sm leading-relaxed text-muted">
              Los valores de la cancha estarán disponibles aquí cuando se
              habilite esta sección. No se realizaron cambios en la
              configuración.
            </p>
          </Card>
        ) : (
          <Section
            items={data[section]}
            onEdit={(item) => {
              setToast(null);
              setEdit({ section, item });
            }}
            onAdd={add}
            onToggle={(item) => {
              setToast(null);
              setError("");
              setToggle({
                section,
                item: {
                  ...item,
                  values: { ...item.values, activo: !item.values.activo },
                },
              });
            }}
            readOnly={!onGuardar}
          />
        )}
      </motion.section>
      {edit && onGuardar && (
        <ConfigEditor
          edit={edit}
          onClose={() => setEdit(null)}
          onGuardar={guardar}
          impactos={impactos?.[edit.item.id]}
        />
      )}
      {toggle && onGuardar && (
        <ConfirmModal
          ariaLabel="Confirmar estado de la regla"
          confirmVariant="primary"
          closeLabel="Cancelar"
          confirmLabel={busy ? "Guardando…" : "Confirmar cambio"}
          busy={busy}
          onClose={() => setToggle(null)}
          onConfirm={async () => {
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await guardar(toggle);
              setToggle(null);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "No se pudo cambiar el estado.",
              );
            } finally {
              setBusy(false);
            }
          }}
          mensaje={
            <>
              <strong className="block">
                ¿{toggle.item.values.activo ? "Activar" : "Desactivar"}{" "}
                {toggle.item.titulo.toLowerCase()}?
              </strong>
              <span className="mt-2 block text-muted">
                El cambio se aplicará a nuevas reservas.
              </span>
              {impactos?.[toggle.item.id]?.map((text, i) => (
                <span key={i} className="mt-3 block text-warning">
                  {text}
                </span>
              ))}
              {error && (
                <span role="alert" className="mt-3 block text-error">
                  {error}
                </span>
              )}
            </>
          }
        />
      )}
      <Toast toast={toast} />
      {toast && (
        <Button size="sm" variant="ghost" onClick={() => setToast(null)}>
          Cerrar aviso
        </Button>
      )}
    </div>
  );
}
