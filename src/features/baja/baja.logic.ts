// Lógica PURA extraída de baja.html (líneas 81, 84-90, 145-152, 164-170). Sin
// llamadas a Supabase, sin JSX, sin estado — todo recibe datos por parámetro.

import type { Json } from "../../types/database.types";
import type { BajaTurnoFijoResultado, TurnoFijoPublicoData, TurnoFijoPublicoValido } from "./baja.types";

// baja.html:81 — mismo orden y mismos textos, indexado por Date.getDay()
// (0=Domingo..6=Sábado). Local a esta feature a propósito: datetime.ts no
// tiene un array equivalente y no hay otro consumidor de este orden.
// Exportado (no solo local al archivo) porque BajaPage también necesita
// mostrar el día del turno fijo (baja.html:202: `DIAS_SEMANA[datos.dia_semana]`)
// — sigue siendo "local a la feature", solo que compartido entre sus propios
// archivos en vez de moverse a datetime.ts.
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// baja.html:84-90 — literal, incluido el `+"T00:00:00"` del legacy para que
// el string "YYYY-MM-DD" se interprete en hora local y no en UTC (evita el
// drift de un día que aparece cerca de medianoche en husos horarios negativos).
export function formatearFechaLarga(fechaISO: string): string {
  const d = new Date(`${fechaISO}T00:00:00`);
  const dia = DIAS_SEMANA[d.getDay()];
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${dia} ${dd}/${mm}`;
}

// baja.html:167-170 — el único código realmente comparado en el legacy es
// "fuera_de_plazo"; cualquier otro valor cae al mismo mensaje genérico del
// `else`. La definición SQL real de baja_turno_fijo_publico confirma que
// existen otros 3 códigos (link_invalido, fecha_no_corresponde,
// fecha_fuera_de_rango) además de fuera_de_plazo, pero el legacy nunca los
// distinguió — todos caen al fallback genérico a propósito, por paridad.
//
// C7 — "4 horas" hardcodeado -> cancelacionHorasMinimas real (configuracion_
// cancha, viaja en la respuesta de obtener_turno_fijo_publico). Un error
// CONFIGURACION_NO_DISPONIBLE (fail-closed nuevo de C7) llega acá como RPC
// error, no como `codigo` de este parámetro — useBajaTurnoFijo ya lo mapea al
// mismo mensaje genérico del `else` (ver confirmarBaja), sin necesidad de un
// caso especial.
export function mapearErrorBajaTurnoFijo(codigo: string | undefined, cancelacionHorasMinimas: number): string {
  if (codigo === "fuera_de_plazo") {
    return `Ya no se puede dar de baja este día: falta menos de ${cancelacionHorasMinimas} horas para el turno.`;
  }
  return "No se pudo procesar la baja. Probá de nuevo o avisá directamente al encargado.";
}

// baja.html:141,147 — "sin_token" y "token_invalido" reusan los mensajes
// EXACTOS del legacy (que en baja.html mostraba ambos con el mismo estilo de
// errorCard, aunque ahí salían del mismo string `error`). "error_carga" es
// texto nuevo: el legacy nunca distinguió un fallo de red/RPC del token
// inválido — la nueva arquitectura sí (useBajaTurnoFijo separa esos 2 casos),
// así que hace falta un mensaje propio. Mismo tono que el resto del sitio
// (ver "No se pudieron cargar las reservas..." en reservations-public).
export function mensajeEstadoCarga(fase: "sin_token" | "token_invalido" | "error_carga"): string {
  if (fase === "sin_token") return "Este link no es válido.";
  if (fase === "token_invalido") return "Este link no es válido o el turno fijo ya no existe.";
  return "No se pudo cargar la información de tu turno. Probá recargar la página.";
}

// baja.html:145-150 — interpretación de la respuesta de
// obtener_turnos_fijos_titular_publico (TF-R2: reemplaza obtener_turno_fijo_publico,
// mismo criterio de interpretación). Único punto donde el Json crudo
// (`Returns: Json` en database.types.ts) cruza a TurnoFijoPublicoData. El
// discriminante `valido` es el único campo que el legacy realmente miraba
// (`!data.valido`) — se mantiene el mismo nivel de confianza, sin validar la
// forma de `turnos`/`ocurrencias` ni de ningún otro campo.
export function parsearTurnoFijoPublico(data: Json): TurnoFijoPublicoData {
  if (data && typeof data === "object" && !Array.isArray(data) && data.valido === true) {
    return data as unknown as TurnoFijoPublicoValido;
  }
  return { valido: false };
}

// baja.html:166-167 — interpretación de la respuesta de baja_turno_fijo_publico.
// El legacy solo lee `data.ok` y, si es falsy, `data.error` — mismo criterio acá,
// sin validar más campos (`ya_estaba` existe en la respuesta real pero el legacy
// nunca lo consume, así que este parser lo ignora).
export function parsearBajaTurnoFijoResultado(data: Json): BajaTurnoFijoResultado {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ok: data.ok === true, error: typeof data.error === "string" ? data.error : undefined };
  }
  return { ok: false };
}
