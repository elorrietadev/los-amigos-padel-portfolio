import { TimePicker } from "../../../components/ui/TimePicker";
import { formatearISO, minutosToHora } from "../../../lib/datetime";
import { DatePicker } from "../../../components/ui/DatePicker";
import type { ReactNode } from "react";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { formatearDDMM } from "./configuracion.adapter";
import {
  DIAS,
  cruzaMedianoche,
  type ConfigValues,
} from "./configuracion.types";

export interface ConfigFormProps {
  value: ConfigValues;
  onChange: (value: ConfigValues) => void;
  disabled?: boolean;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-body-sm font-medium text-text-secondary">
      {label}
      {children}
    </label>
  );
}
export function NumberField({
  label,
  field,
  value,
  onChange,
  disabled,
}: ConfigFormProps & { label: string; field: keyof ConfigValues }) {
  return (
    <Field label={label}>
      <Input
        type="number"
        step="any"
        required
        value={String(value[field] ?? "")}
        onChange={(e) => onChange({ ...value, [field]: e.target.value })}
        disabled={disabled}
      />
    </Field>
  );
}
export function TextField({
  label,
  field,
  value,
  onChange,
  disabled,
  required = true,
}: ConfigFormProps & { label: string; field: keyof ConfigValues; required?: boolean }) {
  return (
    <Field label={label}>
      <Input
        type="text"
        required={required}
        value={String(value[field] ?? "")}
        onChange={(e) => onChange({ ...value, [field]: e.target.value })}
        disabled={disabled}
      />
    </Field>
  );
}
function ActiveField({ value, onChange, disabled }: ConfigFormProps) {
  return (
    <SegmentedControl
      ariaLabel="Estado de la regla"
      options={[
        { value: "si", label: "Activa" },
        { value: "no", label: "Inactiva" },
      ]}
      value={value.activo ? "si" : "no"}
      onChange={(v) => onChange({ ...value, activo: v === "si" })}
      disabled={disabled}
      size="lg"
    />
  );
}
// The former native time input allowed every minute; this is its full UI domain,
// not a schedule or a new opening/closing rule.
const MINUTOS_DEL_DIA = Array.from({ length: 1440 }, (_, minute) => minutosToHora(minute));

function TimeFields(props: ConfigFormProps) {
  const { value, onChange, disabled } = props;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <TimePicker
            label="Hora apertura"
            options={MINUTOS_DEL_DIA}
            required
            value={value.apertura ?? ""}
            onChange={(apertura) => onChange({ ...value, apertura })}
            disabled={disabled}
          />
        </div>
        <div>
          <TimePicker
            label="Hora cierre"
            options={MINUTOS_DEL_DIA}
            required
            value={value.cierre ?? ""}
            onChange={(cierre) => onChange({ ...value, cierre })}
            disabled={disabled}
          />
        </div>
      </div>
      {cruzaMedianoche(value) && (
        <p className="text-body-sm text-info">
          El cierre corresponde al día siguiente.
        </p>
      )}
    </>
  );
}
// AUDIT-DAY-FIX — admin_set_horario_semana programa el cambio para mañana
// por default (nunca hoy): este aviso es fijo, no depende de qué día quedó
// guardado antes (eso ya lo muestra el título del item, ver horariosAItems).
// `mañana` se calcula acá mismo (componente de presentación, no la lógica
// pura del adapter) con el mismo criterio de zona horaria que el resto del
// front admin (reloj del navegador, sin conversión explícita — igual que
// hoyISO()).
function mananaDDMM(): string {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  return formatearDDMM(formatearISO(manana));
}
export function HorarioDiaForm(props: ConfigFormProps & { mostrarAvisoVigencia?: boolean }) {
  const { value, onChange, disabled, mostrarAvisoVigencia = true } = props;
  return (
    <>
      <SegmentedControl
        ariaLabel="Estado del día"
        options={[
          { value: "abierto", label: "Abierto" },
          { value: "cerrado", label: "Cerrado" },
        ]}
        value={value.cerrado ? "cerrado" : "abierto"}
        onChange={(v) => onChange({ ...value, cerrado: v === "cerrado" })}
        disabled={disabled}
        size="lg"
      />
      {!value.cerrado && <TimeFields {...props} />}
      {mostrarAvisoVigencia && (
        <p className="text-body-sm text-text-secondary">
          Este cambio entra en vigencia a partir de mañana ({mananaDDMM()}), nunca hoy. Para un cambio excepcional de
          solo hoy, usá Fechas especiales.
        </p>
      )}
    </>
  );
}
export function TarifaDuracionForm(props: ConfigFormProps) {
  return (
    <>
      <NumberField {...props} label="Duración (minutos)" field="duracion" />
      <NumberField {...props} label="Descuento (%)" field="descuento" />
      <ActiveField {...props} />
    </>
  );
}
export function TarifaFranjaForm(props: ConfigFormProps) {
  const { value, onChange, disabled } = props;
  return (
    <>
      <fieldset>
        <legend className="mb-2 text-body-sm text-text-secondary">
          Días aplicables
        </legend>
        <div className="grid grid-cols-7 gap-1">
          {DIAS.map((dia, index) => (
            <button
              key={dia}
              type="button"
              aria-label={dia}
              aria-pressed={value.dias?.includes(dia) ?? false}
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...value,
                  dias: value.dias?.includes(dia)
                    ? value.dias.filter((d) => d !== dia)
                    : [...(value.dias ?? []), dia],
                })
              }
              className={`min-h-11 rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${value.dias?.includes(dia) ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"}`}
            >
              {["L", "M", "X", "J", "V", "S", "D"][index]}
            </button>
          ))}
        </div>
      </fieldset>
      <TimeFields {...props} />
      <NumberField {...props} label="Descuento (%)" field="descuento" />
      <ActiveField {...props} />
    </>
  );
}
// CFG-F1 — contacto/ubicación de la cancha. Instagram es el único campo
// opcional (no todas las canchas quieren mostrarlo); el resto son datos que
// hoy YA se muestran en el sitio público, así que no tiene sentido dejarlos
// vacíos.
export function DatosPublicosForm(props: ConfigFormProps) {
  return (
    <>
      <TextField {...props} label="Nombre de la cancha" field="nombreCancha" />
      <TextField {...props} label="WhatsApp (solo números, con código de país)" field="whatsappNumero" />
      <TextField {...props} label="Instagram (URL)" field="instagramUrl" required={false} />
      <TextField {...props} label="Dirección" field="direccion" />
      <div className="grid grid-cols-2 gap-3">
        <NumberField {...props} label="Latitud" field="mapaLat" />
        <NumberField {...props} label="Longitud" field="mapaLng" />
      </div>
    </>
  );
}
export function FechaEspecialForm(props: ConfigFormProps) {
  const { value, onChange, disabled } = props;
  return (
    <>
      <div>
        <DatePicker
          label="Fecha"
          required
          value={value.fecha ?? ""}
          onChange={(fecha) => onChange({ ...value, fecha })}
          disabled={disabled}
        />
      </div>
      <ActiveField {...props} />
      <HorarioDiaForm {...props} mostrarAvisoVigencia={false} />
      {!value.cerrado && (
        <>
          <Field label="Tarifa especial">
            <Select
              value={value.tarifa ?? "ninguna"}
              onChange={(e) =>
                onChange({
                  ...value,
                  tarifa: e.target.value as ConfigValues["tarifa"],
                })
              }
              disabled={disabled}
            >
              <option value="ninguna">Sin tarifa especial</option>
              <option value="descuento">Descuento %</option>
              <option value="precio">Precio por hora fijo</option>
            </Select>
          </Field>
          {value.tarifa === "descuento" && (
            <NumberField {...props} label="Descuento (%)" field="descuento" />
          )}
          {value.tarifa === "precio" && (
            <NumberField {...props} label="Precio por hora ($)" field="valor" />
          )}
        </>
      )}
    </>
  );
}
