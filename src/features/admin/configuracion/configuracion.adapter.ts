// Adapter de Configuración (C10) — funciones PURAS que traducen entre las
// filas reales de Supabase (horarios_semana, configuracion_cancha, las 4
// tablas *_historico vía los RPC admin_listar_*/admin_set_* de C1/C8) y el
// contrato de presentación ya fijado por ConfiguracionView (configuracion.types.ts,
// ya cerrado — no se toca). Sin Supabase acá: eso vive en
// configuracion.api.ts / useConfiguracion.ts.
//
// Unidades: se exponen las unidades REALES de cada columna (minutos, días,
// horas), nunca convertidas — el comentario de configuracion.types.ts
// ("Unidad provista por el adapter: no se infiere ni convierte") se respeta
// literal: la unidad viaja tal cual la entiende el backend.

import type { Database, Tables } from "../../../types/database.types";
import { DIAS, type ConfigItem, type ConfigValues } from "./configuracion.types";
import { recortarHora } from "../../../lib/datetime";

export type HorarioRow = Database["public"]["Functions"]["admin_listar_horarios_semana"]["Returns"][number];
export type ConfigCanchaRow = Tables<"configuracion_cancha">;
export type DatosPublicosRow = Tables<"datos_publicos_cancha">;
export type PrecioBaseRow =
  Database["public"]["Functions"]["admin_listar_precio_base_vigente"]["Returns"][number];
export type TarifaDuracionRow =
  Database["public"]["Functions"]["admin_listar_tarifas_duracion_vigentes"]["Returns"][number];
export type TarifaFranjaRow =
  Database["public"]["Functions"]["admin_listar_tarifas_franja_vigentes"]["Returns"][number];
export type FechaEspecialRow =
  Database["public"]["Functions"]["admin_listar_fechas_especiales_vigentes"]["Returns"][number];

// dia_semana real (extract(dow from ...): domingo=0..sábado=6) para cada
// posición de DIAS (que arranca en lunes, orden de semana habitual en la UI).
const DIA_DOW = [1, 2, 3, 4, 5, 6, 0] as const;

export function diasSemanaALabels(dow: number[]): string[] {
  return dow
    .map((d) => DIA_DOW.indexOf(d as (typeof DIA_DOW)[number]))
    .filter((i) => i !== -1)
    .sort((a, b) => a - b)
    .map((i) => DIAS[i]);
}

export function labelsADiasSemana(labels: string[]): number[] {
  const dias: number[] = [];
  for (const label of labels) {
    const dow = DIA_DOW[DIAS.indexOf(label)];
    if (dow !== undefined) dias.push(dow);
  }
  return dias;
}

export function primeraFila<T>(rows: T[] | null | undefined): T | null {
  return rows && rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// General — precio base
// ---------------------------------------------------------------------------
export function precioBaseAItems(row: PrecioBaseRow | null): ConfigItem[] {
  if (!row) return [];
  return [
    {
      id: "precio-base",
      titulo: "Precio base",
      tipo: "precio",
      values: { valor: String(row.precio_hora) },
    },
  ];
}

// ---------------------------------------------------------------------------
// Horarios — historizados por fecha efectiva (AUDIT-DAY-FIX): `rows` viene de
// admin_listar_horarios_semana(), la ÚLTIMA fila guardada por día, que puede
// tener `vigente_desde_fecha` en el futuro si el cambio todavía no entró en
// vigencia. `titulo` es el único lugar del contrato de presentación
// (ConfigItem, ya cerrado) donde se puede sumar texto libre, así que ahí se
// deja explícito "Programado desde DD/MM" cuando corresponde — nunca dar a
// entender que guardar cambió el horario de HOY.
// ---------------------------------------------------------------------------
export function formatearDDMM(fechaISO: string): string {
  const [, m, d] = fechaISO.split("-");
  return `${d}/${m}`;
}

// `hoy` explícito (no `new Date()` interno) para que esta función siga
// siendo pura y testeable — mismo criterio que el resto del proyecto
// (esPasado, obtenerLunesOffset, etc.).
export function horariosAItems(rows: HorarioRow[], hoy: string): ConfigItem[] {
  const porDow = new Map(rows.map((r) => [r.dia_semana, r]));
  const items: ConfigItem[] = [];
  DIA_DOW.forEach((dow, i) => {
    const row = porDow.get(dow);
    if (!row) return; // fila faltante (no debería pasar, seed cubre 0-6) — se omite en vez de inventar horario
    const programado = row.vigente_desde_fecha > hoy;
    items.push({
      id: `dia-${dow}`,
      titulo: programado ? `${DIAS[i]} · Programado desde ${formatearDDMM(row.vigente_desde_fecha)}` : DIAS[i],
      tipo: "horario",
      values: {
        cerrado: !row.abierto,
        apertura: recortarHora(row.hora_apertura) || "",
        cierre: recortarHora(row.hora_cierre) || "",
      },
    });
  });
  return items;
}

export function idAHorarioDow(id: string): number {
  return Number(id.slice(4));
}

export function horarioValuesAPatch(values: ConfigValues): Pick<HorarioRow, "abierto" | "hora_apertura" | "hora_cierre"> {
  return {
    abierto: !values.cerrado,
    hora_apertura: values.apertura || "00:00",
    hora_cierre: values.cierre || "00:00",
  };
}

// ---------------------------------------------------------------------------
// Duraciones + Reservas — comparten la misma fila singleton (configuracion_cancha)
// ---------------------------------------------------------------------------
export function configCanchaADuracionesItem(row: ConfigCanchaRow | null): ConfigItem[] {
  if (!row) return [];
  return [
    {
      id: "duraciones",
      titulo: "Duraciones",
      tipo: "duraciones",
      values: {
        minimo: String(row.duracion_minima_minutos),
        maximo: String(row.duracion_maxima_minutos),
      },
    },
  ];
}

export const CAMPOS_RESERVA = [
  {
    id: "anticipacion-minima",
    titulo: "Anticipación mínima",
    unidad: "minutos",
    campo: "anticipacion_minima_minutos",
    minimo: 0,
  },
  {
    id: "anticipacion-maxima",
    titulo: "Anticipación máxima",
    unidad: "días",
    campo: "anticipacion_maxima_dias",
    minimo: 1,
  },
  {
    id: "limite-telefono",
    titulo: "Reservas activas por teléfono",
    unidad: "reservas",
    campo: "limite_reservas_activas_telefono",
    minimo: 1,
  },
  {
    id: "cancelacion-horas",
    titulo: "Plazo mínimo de cancelación",
    unidad: "horas",
    campo: "cancelacion_horas_minimas",
    minimo: 0,
  },
] as const satisfies readonly {
  id: string;
  titulo: string;
  unidad: string;
  campo: keyof ConfigCanchaRow;
  minimo: number;
}[];

export function configCanchaAReservasItems(row: ConfigCanchaRow | null): ConfigItem[] {
  if (!row) return [];
  return CAMPOS_RESERVA.map((campo) => ({
    id: campo.id,
    titulo: campo.titulo,
    tipo: "reserva" as const,
    unidad: campo.unidad,
    values: { valor: String(row[campo.campo]) },
  }));
}

// ---------------------------------------------------------------------------
// Tarifas — por duración y por franja (historial insert-only, C1/C8)
// ---------------------------------------------------------------------------
export function tarifasDuracionAItems(rows: TarifaDuracionRow[]): ConfigItem[] {
  return rows.map((row) => ({
    id: String(row.duracion_minutos),
    titulo: `Descuento de ${row.duracion_minutos} min`,
    tipo: "duracion" as const,
    values: {
      duracion: String(row.duracion_minutos),
      descuento: row.descuento_pct != null ? String(row.descuento_pct) : "",
      activo: row.activo,
    },
  }));
}

export function tarifasFranjaAItems(rows: TarifaFranjaRow[]): ConfigItem[] {
  return rows.map((row) => ({
    id: row.franja_id,
    titulo: "Franja horaria",
    tipo: "franja" as const,
    values: {
      dias: row.dias_semana ? diasSemanaALabels(row.dias_semana) : [],
      apertura: (row.hora_inicio && recortarHora(row.hora_inicio)) || "",
      cierre: (row.hora_fin && recortarHora(row.hora_fin)) || "",
      descuento: row.descuento_pct != null ? String(row.descuento_pct) : "",
      activo: row.activo,
    },
  }));
}

// ---------------------------------------------------------------------------
// Fechas especiales (historial insert-only, C1/C8)
// ---------------------------------------------------------------------------
function formatearTituloFecha(fechaISO: string): string {
  const fecha = new Date(`${fechaISO}T00:00:00`);
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(fecha);
}

export function fechasAItems(rows: FechaEspecialRow[]): ConfigItem[] {
  return rows.map((row) => {
    const tarifa: ConfigValues["tarifa"] =
      row.tarifa_tipo === "precio_hora_fijo" ? "precio" : row.tarifa_tipo === "descuento_pct" ? "descuento" : "ninguna";
    return {
      id: row.fecha,
      titulo: formatearTituloFecha(row.fecha),
      tipo: "fecha" as const,
      values: {
        fecha: row.fecha,
        activo: row.activo,
        cerrado: !!row.cerrado,
        apertura: (row.hora_apertura && recortarHora(row.hora_apertura)) || "",
        cierre: (row.hora_cierre && recortarHora(row.hora_cierre)) || "",
        tarifa,
        descuento: tarifa === "descuento" && row.tarifa_valor != null ? String(row.tarifa_valor) : undefined,
        valor: tarifa === "precio" && row.tarifa_valor != null ? String(row.tarifa_valor) : undefined,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Datos públicos — datos_publicos_cancha (singleton, sin historial, CFG-F1)
// ---------------------------------------------------------------------------
export function datosPublicosAItems(row: DatosPublicosRow | null): ConfigItem[] {
  if (!row) return [];
  return [
    {
      id: "datos-publicos",
      titulo: "Datos públicos",
      tipo: "publico",
      values: {
        nombreCancha: row.nombre_cancha,
        whatsappNumero: row.whatsapp_numero,
        instagramUrl: row.instagram_url ?? "",
        direccion: row.direccion,
        mapaLat: String(row.mapa_lat),
        mapaLng: String(row.mapa_lng),
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Parseo/validación compartida (mismos límites que los CHECK/raise exception
// reales del backend — ver c1/c5/c6/c7/c8_*.sql). El backend sigue siendo la
// autoridad final: esto solo evita un viaje de red para un error obvio.
// ---------------------------------------------------------------------------
export function parseNumero(valor: string | undefined): number | null {
  if (valor === undefined || valor.trim() === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function parseEntero(valor: string | undefined): number | null {
  if (valor === undefined || valor.trim() === "") return null;
  const n = Number(valor);
  return Number.isInteger(n) ? n : null;
}

export function esMultiploDe30(n: number): boolean {
  return n % 30 === 0;
}

// ---------------------------------------------------------------------------
// Errores — traduce los códigos que devuelven los RPC (`raise exception
// 'codigo'`, ver c1/c8_*.sql) y los CHECK constraint de configuracion_cancha
// (violados por un `.update()` directo, ver c5_1/c6_*.sql) a texto legible.
// Mismo patrón que mapearErrorCrearReserva en reservations.form.logic.ts.
// ---------------------------------------------------------------------------
export function mapearErrorConfiguracion(mensaje: string): string {
  if (mensaje.includes("no_autorizado") || mensaje.includes("permission denied")) {
    return "No tenés permisos para modificar la configuración.";
  } else if (mensaje.includes("precio_invalido")) {
    return "El precio debe ser un número mayor o igual a 0.";
  } else if (mensaje.includes("configuracion_cancha_duracion_grid_check")) {
    return "La duración mínima y máxima deben ser múltiplos de 30 minutos.";
  } else if (mensaje.includes("configuracion_cancha_duracion_check")) {
    return "La duración mínima debe ser mayor a 0 y no puede superar a la máxima.";
  } else if (mensaje.includes("configuracion_cancha_anticipacion_check")) {
    return "La anticipación máxima debe ser mayor a 0 días y la mínima no puede ser negativa.";
  } else if (mensaje.includes("configuracion_cancha_limite_check")) {
    return "El límite de reservas activas por teléfono debe ser mayor a 0.";
  } else if (mensaje.includes("configuracion_cancha_cancelacion_check")) {
    return "El plazo mínimo de cancelación no puede ser negativo.";
  } else if (mensaje.includes("duracion_invalida")) {
    return "La duración debe ser un número mayor a 0.";
  } else if (mensaje.includes("descuento_invalido")) {
    return "El descuento debe ser un número entre 0 y 100.";
  } else if (mensaje.includes("dias_semana_invalido")) {
    return "Seleccioná al menos un día para esta franja.";
  } else if (mensaje.includes("horario_invalido")) {
    return "Completá la hora de apertura y cierre.";
  } else if (mensaje.includes("franja_superpuesta")) {
    return "Esta franja se superpone con otra franja activa.";
  } else if (mensaje.includes("fecha_invalida")) {
    return "Elegí una fecha válida.";
  } else if (mensaje.includes("cerrado_invalido")) {
    return "Indicá si el día está cerrado o no.";
  } else if (mensaje.includes("tarifa_tipo_invalido")) {
    return "El tipo de tarifa especial no es válido.";
  } else if (mensaje.includes("tarifa_valor_invalido")) {
    return "El valor de la tarifa especial no es válido.";
  } else if (mensaje.includes("rango_invalido")) {
    return "El rango de fechas no es válido.";
  } else if (mensaje.includes("CONFIGURACION_NO_DISPONIBLE")) {
    return "La configuración de la cancha no está disponible. Probá de nuevo.";
  } else if (mensaje.includes("datos_publicos_cancha_nombre_check")) {
    return "Completá el nombre de la cancha.";
  } else if (mensaje.includes("datos_publicos_cancha_whatsapp_check")) {
    return "El WhatsApp debe tener solo números, con código de país (8 a 15 dígitos).";
  } else if (mensaje.includes("datos_publicos_cancha_direccion_check")) {
    return "Completá la dirección.";
  } else if (mensaje.includes("datos_publicos_cancha_lat_check")) {
    return "La latitud debe ser un número entre -90 y 90.";
  } else if (mensaje.includes("datos_publicos_cancha_lng_check")) {
    return "La longitud debe ser un número entre -180 y 180.";
  }
  return "No se pudo guardar. Revisá los valores e intentá de nuevo.";
}
