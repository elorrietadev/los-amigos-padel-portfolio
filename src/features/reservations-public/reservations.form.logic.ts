// Lógica PURA del formulario de reserva pública, extraída de index.html
// (líneas 198-220 y 411-466 al momento de la extracción). Sin React, sin
// timers, sin window.location, sin llamadas a Supabase.

import { extenderReserva } from "../../lib/datetime";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_ABREV = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// index.html:202-205
export function formatearFecha(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`);
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

// index.html:206-209
export function formatearCorta(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`);
  return `${DIAS_ABREV[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

// index.html:411-414 — reusa extenderReserva de lib/datetime.ts, no la duplica.
export function calcularPrecioEstimado(
  horaInicio: string,
  horaFin: string,
  aperturaMin: number,
  precioHora: number,
): { horasSeleccionadas: number; precioEstimado: number } {
  const horasSeleccionadas =
    horaInicio && horaFin
      ? (extenderReserva(horaInicio, horaFin, aperturaMin).fin -
          extenderReserva(horaInicio, horaFin, aperturaMin).ini) /
        60
      : 0;
  const precioEstimado = horasSeleccionadas > 0 ? horasSeleccionadas * precioHora : 0;
  return { horasSeleccionadas, precioEstimado };
}

// FINAL-F5-A — topes de los campos de texto públicos. NOMBRE_MAX_LENGTH espeja el
// límite del servidor (crear_reserva rechaza con NOMBRE_INVALIDO más de 80
// caracteres o menos de 2); TELEFONO_MAX_LENGTH es solo dígitos (un número real
// tiene 10-13; el servidor acepta hasta 30 caracteres crudos antes de normalizar).
export const NOMBRE_MAX_LENGTH = 80;
export const TELEFONO_MAX_LENGTH = 20;

export interface ResultadoErrorCrearReserva {
  texto: string;
  // Preserva que, de los 7 códigos, SOLO HORARIO_OCUPADO dispara un refresco
  // silencioso de disponibilidad en el legacy (index.html:441-442). Se expone
  // acá para que useReservaForm no tenga que repetir el mismo `includes()`.
  debeRefrescarDisponibilidad: boolean;
}

// index.html:438-457 — mismo orden, mismos mensajes, mismo `includes()`, mismo
// fallback. Los 10 códigos no son substring uno del otro en el set actual
// (verificado, incluidos los 2 agregados en C6 y NOMBRE_INVALIDO de F5-A), así que el orden no es
// semánticamente forzado hoy — se preserva idéntico al legacy de todas
// formas, sin convertir a switch/mapa/igualdad estricta.
//
// C6 — `limiteReservasActivasTelefono` (antes hardcodeado a 3 en el texto)
// llega como parámetro: por construcción, quien llama a esta función (dentro
// de confirmarReserva en useReservaForm) solo puede llegar acá con
// configuracionReservas ya cargado (si no, el formulario nunca queda
// "completo" — ver guarda en useReservaForm), así que no hace falta un
// fallback silencioso.
export function mapearErrorCrearReserva(
  mensaje: string,
  limiteReservasActivasTelefono: number,
  // FINAL-F5-B — solo con DEMASIADOS_INTENTOS (segundos que informa /api/reservar).
  retryAfterSegundos?: number,
): ResultadoErrorCrearReserva {
  if (mensaje.includes("HORARIO_OCUPADO")) {
    return {
      texto: "Ese horario ya fue reservado por otra persona. Elegí otro.",
      debeRefrescarDisponibilidad: true,
    };
  } else if (mensaje.includes("LIMITE_TELEFONO")) {
    return {
      texto: `Ya tenés ${limiteReservasActivasTelefono} turnos activos con este teléfono. Esperá a que se confirmen o venzan antes de sacar otro.`,
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("TELEFONO_BLOQUEADO")) {
    return {
      texto: "No pudimos procesar tu reserva. Comunicate directamente con el canchero.",
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("TELEFONO_INVALIDO")) {
    // E4.3.2 — normalize_phone() rechazó el teléfono (longitud imposible tras
    // limpiar separadores/54/0 de forma determinística). No se intenta
    // explicar el detalle técnico, solo pedir que lo revise.
    return {
      texto: "El número de teléfono ingresado no es válido.",
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("NOMBRE_INVALIDO")) {
    // FINAL-F5-A — nombre vacío, de 1 letra, de más de 80 o con caracteres no
    // permitidos (el servidor es la autoridad; el input ya limita el largo).
    return {
      texto: `El nombre ingresado no es válido. Usá entre 2 y ${NOMBRE_MAX_LENGTH} caracteres.`,
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("FECHA_INVALIDA")) {
    return { texto: "Esa fecha ya pasó. Elegí otro día.", debeRefrescarDisponibilidad: false };
  } else if (mensaje.includes("ANTICIPACION_MAXIMA_EXCEDIDA")) {
    // C6 — defensa por si la config de anticipación cambia (o se llama la RPC
    // directo) entre que se cargó el selector de fechas y que se confirmó la
    // reserva; en el flujo normal no se llega acá porque el selector ya no
    // ofrece fechas fuera del rango configurado.
    return {
      texto: "Esa fecha está fuera del rango de anticipación permitido. Elegí un día más cercano.",
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("ANTICIPACION_MINIMA_NO_CUMPLIDA")) {
    return {
      texto: "Ese horario está demasiado próximo. Elegí un horario más adelantado.",
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("DURACION_INVALIDA")) {
    // C5 — ya no se hardcodea "entre 1 y 3 horas": la duración permitida es
    // configurable (configuracion_cancha) y este mapeo no tiene acceso a esos
    // valores. El mensaje queda genérico a propósito.
    return {
      texto: "Esa duración no está permitida. Elegí otro horario de fin.",
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("FUERA_DE_HORARIO")) {
    return {
      texto: "Ese horario está fuera del horario de atención de la cancha.",
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("HORARIO_YA_PASO")) {
    return { texto: "Ese horario ya pasó. Elegí otro.", debeRefrescarDisponibilidad: false };
  } else if (mensaje.includes("DIA_CERRADO")) {
    // C4 — defensa por si el día se cierra (fecha especial o cambio de
    // horarios_semana) entre que se cargó la franja y que se confirmó la
    // reserva; en el flujo normal ya no se llega acá porque
    // horasInicioDisponibles queda vacío para un día cerrado.
    return { texto: "La cancha está cerrada ese día. Elegí otra fecha.", debeRefrescarDisponibilidad: false };
  } else if (mensaje.includes("TURNSTILE_FALLIDO")) {
    // FINAL-F5-B — token ausente/inválido/vencido/reutilizado o hostname/action que
    // no corresponden. useReservaForm ya reinició el widget: se pide reintentar.
    return {
      texto: "No pudimos verificar que sos una persona. Esperá un momento y probá de nuevo.",
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("DEMASIADOS_INTENTOS")) {
    return {
      texto: `Hiciste demasiados intentos. Esperá ${textoEspera(retryAfterSegundos)} y volvé a probar.`,
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("VERIFICACION_NO_DISPONIBLE")) {
    return { texto: "La verificación de seguridad no respondió. No se envió la reserva a la cancha. Volvé a verificar e intentá nuevamente.", debeRefrescarDisponibilidad: false };
  } else if (mensaje.includes("ERROR_TEMPORAL")) {
    return {
      texto: "El sistema de reservas no está disponible por un momento. Probá de nuevo en unos segundos.",
      debeRefrescarDisponibilidad: false,
    };
  } else if (mensaje.includes("PAYLOAD_INVALIDO") || mensaje.includes("ORIGEN_NO_PERMITIDO")) {
    // Defensa: el formulario ya valida lo mismo; solo llega acá con un cliente adulterado.
    return {
      texto: "Revisá los datos ingresados y probá de nuevo.",
      debeRefrescarDisponibilidad: false,
    };
  } else {
    return {
      texto: "Hubo un error guardando la reserva. Probá de nuevo.",
      debeRefrescarDisponibilidad: false,
    };
  }
}

// Redondea hacia arriba a minutos; sin dato o dato inválido, un texto genérico.
function textoEspera(segundos: number | undefined): string {
  if (segundos === undefined || !Number.isFinite(segundos) || segundos <= 0) return "unos minutos";
  if (segundos < 60) return "menos de un minuto";
  const min = Math.ceil(segundos / 60);
  if (min < 60) return min === 1 ? "1 minuto" : `${min} minutos`;
  const h = Math.ceil(min / 60);
  return h === 1 ? "1 hora" : `${h} horas`;
}

export interface DatosMensajeWhatsapp {
  nombreCancha: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  nombre: string;
  telefono: string;
  // Nota: quien llame a esta función decide qué precio pasar (estimado antes
  // de crear la reserva, autoritativo del servidor después) — esta función
  // solo formatea el número que recibe, tal cual, sin separador de miles
  // (index.html nunca usa toLocaleString acá, a diferencia de otras pantallas).
  precio: number;
}

// index.html:461-465 (el texto, antes de encodeURIComponent) — copiado literal:
// mismos saltos de línea, mismos dos puntos, mismo "Total: $" sin separador de
// miles, mismo orden de campos.
export function construirMensajeWhatsapp(datos: DatosMensajeWhatsapp): string {
  return (
    `Hola! Quiero confirmar mi turno en ${datos.nombreCancha}.\n` +
    `Día: ${formatearFecha(datos.fecha)}\nHorario: ${datos.horaInicio} a ${datos.horaFin}\n` +
    `Nombre: ${datos.nombre}\nTeléfono: ${datos.telefono}\nTotal: $${datos.precio}`
  );
}

// index.html:461,466 — encodeURIComponent se aplica acá (sobre el mensaje
// completo), igual que en el legacy, justo antes de armar la URL final.
export function construirLinkWhatsapp(whatsappNumero: string, mensaje: string): string {
  return `https://wa.me/${whatsappNumero}?text=${encodeURIComponent(mensaje)}`;
}
