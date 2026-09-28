import { describe, expect, it } from "vitest";
import {
  calcularPrecioEstimado,
  construirLinkWhatsapp,
  construirMensajeWhatsapp,
  formatearCorta,
  formatearFecha,
  mapearErrorCrearReserva,
  NOMBRE_MAX_LENGTH,
  TELEFONO_MAX_LENGTH,
} from "./reservations.form.logic";

const APERTURA = 480; // 08:00
const PRECIO_HORA = 20000;

describe("mapearErrorCrearReserva", () => {
  it("HORARIO_OCUPADO: mensaje exacto y dispara refresco", () => {
    expect(mapearErrorCrearReserva("HORARIO_OCUPADO", 3)).toEqual({
      texto: "Ese horario ya fue reservado por otra persona. Elegí otro.",
      debeRefrescarDisponibilidad: true,
    });
  });

  it("LIMITE_TELEFONO: mensaje exacto con el límite dado (3), sin refresco", () => {
    expect(mapearErrorCrearReserva("LIMITE_TELEFONO", 3)).toEqual({
      texto: "Ya tenés 3 turnos activos con este teléfono. Esperá a que se confirmen o venzan antes de sacar otro.",
      debeRefrescarDisponibilidad: false,
    });
  });

  // C6 — el número ya no está hardcodeado en el texto: usa el segundo
  // argumento (limiteReservasActivasTelefono), sea cual sea.
  it("LIMITE_TELEFONO: con otro límite configurado (5), el mensaje refleja ese valor", () => {
    expect(mapearErrorCrearReserva("LIMITE_TELEFONO", 5)).toEqual({
      texto: "Ya tenés 5 turnos activos con este teléfono. Esperá a que se confirmen o venzan antes de sacar otro.",
      debeRefrescarDisponibilidad: false,
    });
  });

  it("TELEFONO_BLOQUEADO: mensaje exacto, sin refresco", () => {
    expect(mapearErrorCrearReserva("TELEFONO_BLOQUEADO", 3)).toEqual({
      texto: "No pudimos procesar tu reserva. Comunicate directamente con el canchero.",
      debeRefrescarDisponibilidad: false,
    });
  });

  it("TELEFONO_INVALIDO: mensaje exacto, sin refresco", () => {
    expect(mapearErrorCrearReserva("TELEFONO_INVALIDO", 3)).toEqual({
      texto: "El número de teléfono ingresado no es válido.",
      debeRefrescarDisponibilidad: false,
    });
  });

  it("NOMBRE_INVALIDO (F5-A): mensaje propio con el rango permitido, sin refresco", () => {
    expect(mapearErrorCrearReserva("NOMBRE_INVALIDO", 3)).toEqual({
      texto: "El nombre ingresado no es válido. Usá entre 2 y 80 caracteres.",
      debeRefrescarDisponibilidad: false,
    });
    expect(NOMBRE_MAX_LENGTH).toBe(80);
    expect(TELEFONO_MAX_LENGTH).toBe(20);
  });

  it("FECHA_INVALIDA: mensaje exacto, sin refresco", () => {
    expect(mapearErrorCrearReserva("FECHA_INVALIDA", 3)).toEqual({
      texto: "Esa fecha ya pasó. Elegí otro día.",
      debeRefrescarDisponibilidad: false,
    });
  });

  // C6
  it("ANTICIPACION_MAXIMA_EXCEDIDA: mensaje exacto, sin refresco", () => {
    expect(mapearErrorCrearReserva("ANTICIPACION_MAXIMA_EXCEDIDA", 3)).toEqual({
      texto: "Esa fecha está fuera del rango de anticipación permitido. Elegí un día más cercano.",
      debeRefrescarDisponibilidad: false,
    });
  });

  // C6
  it("ANTICIPACION_MINIMA_NO_CUMPLIDA: mensaje exacto, sin refresco", () => {
    expect(mapearErrorCrearReserva("ANTICIPACION_MINIMA_NO_CUMPLIDA", 3)).toEqual({
      texto: "Ese horario está demasiado próximo. Elegí un horario más adelantado.",
      debeRefrescarDisponibilidad: false,
    });
  });

  it("DURACION_INVALIDA: mensaje exacto, sin refresco", () => {
    expect(mapearErrorCrearReserva("DURACION_INVALIDA", 3)).toEqual({
      texto: "Esa duración no está permitida. Elegí otro horario de fin.",
      debeRefrescarDisponibilidad: false,
    });
  });

  it("FUERA_DE_HORARIO: mensaje exacto, sin refresco", () => {
    expect(mapearErrorCrearReserva("FUERA_DE_HORARIO", 3)).toEqual({
      texto: "Ese horario está fuera del horario de atención de la cancha.",
      debeRefrescarDisponibilidad: false,
    });
  });

  it("HORARIO_YA_PASO: mensaje exacto, sin refresco", () => {
    expect(mapearErrorCrearReserva("HORARIO_YA_PASO", 3)).toEqual({
      texto: "Ese horario ya pasó. Elegí otro.",
      debeRefrescarDisponibilidad: false,
    });
  });

  it("código desconocido: fallback exacto", () => {
    expect(mapearErrorCrearReserva("ALGO_QUE_NO_EXISTE", 3)).toEqual({
      texto: "Hubo un error guardando la reserva. Probá de nuevo.",
      debeRefrescarDisponibilidad: false,
    });
  });

  it("usa includes real, no igualdad estricta: un código con texto alrededor sigue matcheando", () => {
    const mensajePostgrest = 'new row violates check: "HORARIO_OCUPADO" (SQLSTATE P0001)';
    expect(mapearErrorCrearReserva(mensajePostgrest, 3)).toEqual({
      texto: "Ese horario ya fue reservado por otra persona. Elegí otro.",
      debeRefrescarDisponibilidad: true,
    });
  });
});

describe("mapearErrorCrearReserva — códigos de /api/reservar (F5-B)", () => {
  it("TURNSTILE_FALLIDO: pide reintentar, sin refrescar disponibilidad", () => {
    const r = mapearErrorCrearReserva("TURNSTILE_FALLIDO", 3);
    expect(r.texto).toBe("No pudimos verificar que sos una persona. Esperá un momento y probá de nuevo.");
    expect(r.debeRefrescarDisponibilidad).toBe(false);
  });

  it.each([
    [undefined, "unos minutos"],
    [0, "unos minutos"],
    [Number.NaN, "unos minutos"],
    [30, "menos de un minuto"],
    [60, "1 minuto"],
    [61, "2 minutos"],
    [600, "10 minutos"],
    [3600, "1 hora"],
    [3601, "2 horas"],
    [43200, "12 horas"],
  ])("DEMASIADOS_INTENTOS con retryAfter=%s -> 'Esperá %s'", (retryAfter, esperado) => {
    const r = mapearErrorCrearReserva("DEMASIADOS_INTENTOS", 3, retryAfter);
    expect(r.texto).toBe(`Hiciste demasiados intentos. Esperá ${esperado} y volvé a probar.`);
    expect(r.debeRefrescarDisponibilidad).toBe(false);
  });

  it("ERROR_TEMPORAL: mensaje de indisponibilidad transitoria", () => {
    expect(mapearErrorCrearReserva("ERROR_TEMPORAL", 3).texto).toContain("no está disponible por un momento");
  });

  it.each(["PAYLOAD_INVALIDO", "ORIGEN_NO_PERMITIDO"])("%s: pide revisar los datos", (codigo) => {
    expect(mapearErrorCrearReserva(codigo, 3).texto).toBe("Revisá los datos ingresados y probá de nuevo.");
  });

  it("los códigos nuevos no pisan a los de negocio (ni al revés)", () => {
    expect(mapearErrorCrearReserva("HORARIO_OCUPADO", 3).debeRefrescarDisponibilidad).toBe(true);
    expect(mapearErrorCrearReserva("TELEFONO_INVALIDO", 3).texto).toBe("El número de teléfono ingresado no es válido.");
    expect(mapearErrorCrearReserva("algo desconocido", 3).texto).toBe("Hubo un error guardando la reserva. Probá de nuevo.");
  });
});

describe("calcularPrecioEstimado", () => {
  it("horarios vacíos: 0 horas, 0 precio", () => {
    expect(calcularPrecioEstimado("", "", APERTURA, PRECIO_HORA)).toEqual({
      horasSeleccionadas: 0,
      precioEstimado: 0,
    });
  });

  it("duración de 1 hora", () => {
    expect(calcularPrecioEstimado("10:00", "11:00", APERTURA, PRECIO_HORA)).toEqual({
      horasSeleccionadas: 1,
      precioEstimado: 20000,
    });
  });

  it("duración de 3 horas", () => {
    expect(calcularPrecioEstimado("10:00", "13:00", APERTURA, PRECIO_HORA)).toEqual({
      horasSeleccionadas: 3,
      precioEstimado: 60000,
    });
  });

  it("cruce de medianoche (23:00 -> 01:00, 2 horas)", () => {
    expect(calcularPrecioEstimado("23:00", "01:00", APERTURA, PRECIO_HORA)).toEqual({
      horasSeleccionadas: 2,
      precioEstimado: 40000,
    });
  });
});

describe("formatearFecha", () => {
  // Días de semana verificados con Node directo (new Date(fechaISO+"T00:00:00").getDay()),
  // mismo método de parsing que el legacy, para no depender de asumir el calendario a mano.
  it("2026-06-01 (lunes)", () => {
    expect(formatearFecha("2026-06-01")).toBe("Lunes, 1 de junio");
  });

  it("2026-01-01 (jueves)", () => {
    expect(formatearFecha("2026-01-01")).toBe("Jueves, 1 de enero");
  });

  it("2026-12-25 (viernes)", () => {
    expect(formatearFecha("2026-12-25")).toBe("Viernes, 25 de diciembre");
  });
});

describe("formatearCorta", () => {
  it("2026-06-01 (lunes)", () => {
    expect(formatearCorta("2026-06-01")).toBe("LUN 1/6");
  });

  it("2026-01-01 (jueves)", () => {
    expect(formatearCorta("2026-01-01")).toBe("JUE 1/1");
  });

  it("2026-12-25 (viernes)", () => {
    expect(formatearCorta("2026-12-25")).toBe("VIE 25/12");
  });
});

describe("construirMensajeWhatsapp / construirLinkWhatsapp", () => {
  // El expected de este bloque se escribió a mano y se verificó de forma
  // independiente con `node -e` corriendo encodeURIComponent nativo sobre el
  // mismo literal — NUNCA llamando a construirMensajeWhatsapp/construirLinkWhatsapp
  // para generar su propio expected.
  const datos = {
    nombreCancha: "Los Amigos Padel",
    fecha: "2026-06-01",
    horaInicio: "10:00",
    horaFin: "11:00",
    nombre: "Juan Perez",
    telefono: "3775123456",
    precio: 20000,
  };

  const mensajeEsperado =
    "Hola! Quiero confirmar mi turno en Los Amigos Padel.\n" +
    "Día: Lunes, 1 de junio\nHorario: 10:00 a 11:00\n" +
    "Nombre: Juan Perez\nTeléfono: 3775123456\nTotal: $20000";

  it("arma el texto exacto (mismos saltos de línea, mismo formato, sin separador de miles)", () => {
    expect(construirMensajeWhatsapp(datos)).toBe(mensajeEsperado);
  });

  it("arma la URL final exacta, con encodeURIComponent sobre el mensaje completo", () => {
    const urlEsperada =
      "https://wa.me/5493775550100?text=Hola!%20Quiero%20confirmar%20mi%20turno%20en%20Los%20Amigos%20Padel.%0AD%C3%ADa%3A%20Lunes%2C%201%20de%20junio%0AHorario%3A%2010%3A00%20a%2011%3A00%0ANombre%3A%20Juan%20Perez%0ATel%C3%A9fono%3A%203775123456%0ATotal%3A%20%2420000";
    expect(construirLinkWhatsapp("5493775550100", mensajeEsperado)).toBe(urlEsperada);
  });
});
