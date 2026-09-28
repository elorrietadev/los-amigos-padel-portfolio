import { describe, expect, it } from "vitest";
import {
  formatearFechaLarga,
  mapearErrorBajaTurnoFijo,
  mensajeEstadoCarga,
  parsearBajaTurnoFijoResultado,
  parsearTurnoFijoPublico,
} from "./baja.logic";

describe("formatearFechaLarga", () => {
  it("día normal", () => {
    // 2026-06-01 es lunes
    expect(formatearFechaLarga("2026-06-01")).toBe("Lunes 01/06");
  });

  it("aplica ceros a la izquierda en día y mes", () => {
    // 2026-01-04 es domingo
    expect(formatearFechaLarga("2026-01-04")).toBe("Domingo 04/01");
  });

  it("cambio de mes: último día de enero vs. primer día de febrero", () => {
    expect(formatearFechaLarga("2026-01-31")).toBe("Sábado 31/01");
    expect(formatearFechaLarga("2026-02-01")).toBe("Domingo 01/02");
  });

  it("cambio de año: 31/12 vs. 01/01", () => {
    expect(formatearFechaLarga("2025-12-31")).toBe("Miércoles 31/12");
    expect(formatearFechaLarga("2026-01-01")).toBe("Jueves 01/01");
  });

  it("no sufre drift por timezone: la fecha 'YYYY-MM-DD' se interpreta en hora local, no UTC", () => {
    // Si se interpretara en UTC (sin el "T00:00:00" del legacy), en husos
    // horarios negativos (América) esta fecha caería un día antes.
    expect(formatearFechaLarga("2026-09-05")).toBe("Sábado 05/09");
  });
});

describe("mapearErrorBajaTurnoFijo", () => {
  it("fuera_de_plazo devuelve el mensaje específico con el plazo configurado (4hs)", () => {
    expect(mapearErrorBajaTurnoFijo("fuera_de_plazo", 4)).toBe(
      "Ya no se puede dar de baja este día: falta menos de 4 horas para el turno.",
    );
  });

  // C7 — el número ya no está hardcodeado: usa el segundo argumento
  // (cancelacionHorasMinimas), sea cual sea.
  it("fuera_de_plazo con otro plazo configurado (6hs), el mensaje refleja ese valor", () => {
    expect(mapearErrorBajaTurnoFijo("fuera_de_plazo", 6)).toBe(
      "Ya no se puede dar de baja este día: falta menos de 6 horas para el turno.",
    );
  });

  it("código desconocido cae al mensaje genérico", () => {
    expect(mapearErrorBajaTurnoFijo("codigo_inventado", 4)).toBe(
      "No se pudo procesar la baja. Probá de nuevo o avisá directamente al encargado.",
    );
  });

  it("undefined cae al mensaje genérico", () => {
    expect(mapearErrorBajaTurnoFijo(undefined, 4)).toBe(
      "No se pudo procesar la baja. Probá de nuevo o avisá directamente al encargado.",
    );
  });

  it("string vacío cae al mensaje genérico", () => {
    expect(mapearErrorBajaTurnoFijo("", 4)).toBe(
      "No se pudo procesar la baja. Probá de nuevo o avisá directamente al encargado.",
    );
  });
});

describe("mensajeEstadoCarga", () => {
  it("sin_token reusa el texto exacto del legacy", () => {
    expect(mensajeEstadoCarga("sin_token")).toBe("Este link no es válido.");
  });

  it("token_invalido reusa el texto exacto del legacy", () => {
    expect(mensajeEstadoCarga("token_invalido")).toBe("Este link no es válido o el turno fijo ya no existe.");
  });

  it("error_carga usa el texto nuevo (el legacy no distinguía este caso)", () => {
    expect(mensajeEstadoCarga("error_carga")).toBe("No se pudo cargar la información de tu turno. Probá recargar la página.");
  });
});

describe("parsearTurnoFijoPublico", () => {
  it("valido:true con shape real del servidor (TF-R2: turnos[]) se castea a TurnoFijoPublicoValido", () => {
    const data = {
      valido: true,
      nombre: "Juan",
      cancelacion_horas_minimas: 4,
      turnos: [
        {
          turno_fijo_id: "11111111-1111-1111-1111-111111111111",
          dia_semana: 1,
          hora_inicio: "18:00",
          hora_fin: "19:00",
          ocurrencias: [{ fecha: "2026-06-01", cancelada: false, puede_cancelar: true }],
        },
      ],
    };
    expect(parsearTurnoFijoPublico(data)).toEqual(data);
  });

  it("titular con varios turnos fijos (TF-R2) se preserva tal cual", () => {
    const data = {
      valido: true,
      nombre: "Juan",
      cancelacion_horas_minimas: 4,
      turnos: [
        { turno_fijo_id: "a", dia_semana: 1, hora_inicio: "18:00", hora_fin: "19:00", ocurrencias: [] },
        { turno_fijo_id: "b", dia_semana: 3, hora_inicio: "20:00", hora_fin: "21:00", ocurrencias: [] },
      ],
    };
    const resultado = parsearTurnoFijoPublico(data);
    expect(resultado.valido).toBe(true);
    expect(resultado.valido && resultado.turnos).toHaveLength(2);
  });

  it("campos extra sin consumidor no rompen el parseo", () => {
    const data = { valido: true, nombre: "x", cancelacion_horas_minimas: 4, turnos: [], extra: "ignorado" };
    const resultado = parsearTurnoFijoPublico(data);
    expect(resultado.valido).toBe(true);
  });

  it("valido:false se devuelve tal cual", () => {
    expect(parsearTurnoFijoPublico({ valido: false })).toEqual({ valido: false });
  });

  it("data null (token inexistente / error de red) cae a invalido", () => {
    expect(parsearTurnoFijoPublico(null)).toEqual({ valido: false });
  });

  it("data con forma inesperada (no objeto) cae a invalido", () => {
    expect(parsearTurnoFijoPublico("texto inesperado")).toEqual({ valido: false });
    expect(parsearTurnoFijoPublico(42)).toEqual({ valido: false });
  });

  it("array (nunca debería pasar, pero es un valor Json válido) cae a invalido", () => {
    expect(parsearTurnoFijoPublico([1, 2, 3])).toEqual({ valido: false });
  });
});

describe("parsearBajaTurnoFijoResultado", () => {
  it("ok:true (con ya_estaba, ignorado) se interpreta como éxito sin error", () => {
    expect(parsearBajaTurnoFijoResultado({ ok: true, ya_estaba: false })).toEqual({ ok: true, error: undefined });
  });

  it("ok:false con error fuera_de_plazo preserva el código", () => {
    expect(parsearBajaTurnoFijoResultado({ ok: false, error: "fuera_de_plazo" })).toEqual({
      ok: false,
      error: "fuera_de_plazo",
    });
  });

  it("ok:false con otros códigos reales del servidor preserva el código tal cual", () => {
    expect(parsearBajaTurnoFijoResultado({ ok: false, error: "link_invalido" })).toEqual({
      ok: false,
      error: "link_invalido",
    });
  });

  it("data null (error de red) se interpreta como ok:false sin código", () => {
    expect(parsearBajaTurnoFijoResultado(null)).toEqual({ ok: false });
  });

  it("data con forma inesperada cae a ok:false", () => {
    expect(parsearBajaTurnoFijoResultado("texto inesperado")).toEqual({ ok: false });
  });
});
