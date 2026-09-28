/** Modelos de presentación; no son contratos de base de datos.
 * Los valores editables son strings para conservar vacío/decimales mientras se escribe.
 * El adapter futuro deberá convertir unidades y validar según el contrato confirmado.
 */
export type ConfigSection =
  | "general"
  | "horarios"
  | "duraciones"
  | "tarifas"
  | "reservas"
  | "fechas"
  | "publico";
export type ConfigFormKind =
  | "precio"
  | "horario"
  | "duraciones"
  | "duracion"
  | "franja"
  | "reserva"
  | "fecha"
  | "publico";
export interface ConfigValues {
  valor?: string;
  minimo?: string;
  maximo?: string;
  apertura?: string;
  cierre?: string;
  duracion?: string;
  descuento?: string;
  dias?: string[];
  activo?: boolean;
  cerrado?: boolean;
  fecha?: string;
  tarifa?: "ninguna" | "descuento" | "precio";
  /** CFG-F1 — datos públicos de contacto/ubicación (tipo "publico"). */
  nombreCancha?: string;
  whatsappNumero?: string;
  instagramUrl?: string;
  direccion?: string;
  mapaLat?: string;
  mapaLng?: string;
}
export interface ConfigItem {
  id: string;
  titulo: string;
  tipo: ConfigFormKind;
  values: ConfigValues;
  /** Unidad provista por el adapter: no se infiere ni convierte. */
  unidad?: string;
}
export type ConfigData = Record<ConfigSection, ConfigItem[]>;
export interface ConfigEdit {
  section: ConfigSection;
  item: ConfigItem;
  nuevo?: boolean;
}
export interface ConfigSectionState {
  fase: "loading" | "loaded" | "error";
  mensaje?: string;
}
export interface ConfiguracionViewProps {
  data?: ConfigData;
  estados?: Partial<Record<ConfigSection, ConfigSectionState>>;
  onGuardar?: (edit: ConfigEdit) => Promise<void>;
  onReintentar?: (section: ConfigSection) => void;
  /** Advertencias externas, por identificador. Ausente = impacto desconocido. */
  impactos?: Record<string, string[]>;
  mensajeExito?: string;
}
export const CONFIG_SECTIONS: {
  value: ConfigSection;
  label: string;
  descripcion: string;
}[] = [
  {
    value: "general",
    label: "General",
    descripcion: "El punto de partida de tus reservas.",
  },
  {
    value: "horarios",
    label: "Horarios",
    descripcion: "Tu semana, día por día.",
  },
  {
    value: "duraciones",
    label: "Duraciones",
    descripcion: "Tiempo mínimo y máximo de cada reserva.",
  },
  {
    value: "tarifas",
    label: "Tarifas",
    descripcion: "Descuentos para cada forma de jugar.",
  },
  {
    value: "reservas",
    label: "Reservas",
    descripcion: "Anticipación, límites y cancelaciones.",
  },
  {
    value: "fechas",
    label: "Fechas especiales",
    descripcion: "Excepciones a tu semana habitual.",
  },
  {
    value: "publico",
    label: "Datos públicos",
    descripcion: "Contacto y ubicación que ve el público.",
  },
];
export const DIAS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
export const dinero = (value = "") =>
  value === ""
    ? "—"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(Number(value));
export const horario = (v: ConfigValues) =>
  `${v.apertura || "—"} → ${v.cierre || "—"}`;
export const cruzaMedianoche = (v: ConfigValues) =>
  Boolean(v.apertura && v.cierre && v.cierre < v.apertura);
