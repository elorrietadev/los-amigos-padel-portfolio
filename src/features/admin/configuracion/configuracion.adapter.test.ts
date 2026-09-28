import { describe, expect, it } from "vitest";
import {
  CAMPOS_RESERVA,
  configCanchaADuracionesItem,
  configCanchaAReservasItems,
  datosPublicosAItems,
  diasSemanaALabels,
  esMultiploDe30,
  fechasAItems,
  horarioValuesAPatch,
  horariosAItems,
  idAHorarioDow,
  labelsADiasSemana,
  mapearErrorConfiguracion,
  parseEntero,
  parseNumero,
  precioBaseAItems,
  primeraFila,
  tarifasDuracionAItems,
  tarifasFranjaAItems,
  type ConfigCanchaRow,
  type DatosPublicosRow,
  type FechaEspecialRow,
  type HorarioRow,
  type TarifaDuracionRow,
  type TarifaFranjaRow,
} from "./configuracion.adapter";

describe("diasSemanaALabels / labelsADiasSemana", () => {
  it("mapea dow de Postgres (domingo=0) a etiquetas en orden lunes..domingo", () => {
    expect(diasSemanaALabels([1, 3, 0])).toEqual(["Lunes", "Miércoles", "Domingo"]);
  });
  it("es inversa de labelsADiasSemana", () => {
    const labels = ["Viernes", "Sábado", "Domingo"];
    expect(diasSemanaALabels(labelsADiasSemana(labels)).sort()).toEqual([...labels].sort());
  });
  it("labelsADiasSemana descarta etiquetas desconocidas", () => {
    expect(labelsADiasSemana(["Lunes", "Feriado"])).toEqual([1]);
  });
});

describe("horariosAItems / idAHorarioDow / horarioValuesAPatch", () => {
  const HOY = "2026-09-19";
  const filas: HorarioRow[] = [
    { dia_semana: 0, abierto: true, hora_apertura: "08:00:00", hora_cierre: "01:00:00", vigente_desde_fecha: "2000-01-01" },
    { dia_semana: 1, abierto: false, hora_apertura: "08:00:00", hora_cierre: "01:00:00", vigente_desde_fecha: "2000-01-01" },
  ];
  it("ordena lunes..domingo y recorta segundos", () => {
    const items = horariosAItems(filas, HOY);
    expect(items.map((i) => i.titulo)).toEqual(["Lunes", "Domingo"]);
    expect(items[0].values).toEqual({ cerrado: true, apertura: "08:00", cierre: "01:00" });
    expect(items[1].id).toBe("dia-0");
  });
  it("omite días sin fila en vez de inventar un horario", () => {
    expect(horariosAItems([filas[0]], HOY)).toHaveLength(1);
  });
  it("agrega 'Programado desde DD/MM' al título si vigente_desde_fecha es futuro", () => {
    const items = horariosAItems(
      [{ dia_semana: 2, abierto: true, hora_apertura: "10:00:00", hora_cierre: "22:00:00", vigente_desde_fecha: "2026-09-20" }],
      HOY,
    );
    expect(items[0].titulo).toBe("Martes · Programado desde 20/09");
  });
  it("idAHorarioDow lee el dow desde el id generado", () => {
    expect(idAHorarioDow("dia-3")).toBe(3);
  });
  it("horarioValuesAPatch invierte cerrado -> abierto", () => {
    expect(horarioValuesAPatch({ cerrado: false, apertura: "09:00", cierre: "22:00" })).toEqual({
      abierto: true,
      hora_apertura: "09:00",
      hora_cierre: "22:00",
    });
  });
});

describe("precioBaseAItems", () => {
  it("sin fila vigente no muestra nada (nunca inventa un precio demo)", () => {
    expect(precioBaseAItems(null)).toEqual([]);
  });
  it("mapea precio_hora a values.valor como string", () => {
    expect(precioBaseAItems({ id: 1, precio_hora: 20000, vigente_desde: "2026-01-01" })).toEqual([
      { id: "precio-base", titulo: "Precio base", tipo: "precio", values: { valor: "20000" } },
    ]);
  });
});

const configCancha: ConfigCanchaRow = {
  id: 1,
  duracion_minima_minutos: 60,
  duracion_maxima_minutos: 180,
  anticipacion_maxima_dias: 14,
  anticipacion_minima_minutos: 0,
  limite_reservas_activas_telefono: 3,
  cancelacion_horas_minimas: 4,
  actualizado: "2026-01-01T00:00:00Z",
  actualizado_por: null,
};

describe("configCanchaADuracionesItem / configCanchaAReservasItems", () => {
  it("sin fila no muestra nada", () => {
    expect(configCanchaADuracionesItem(null)).toEqual([]);
    expect(configCanchaAReservasItems(null)).toEqual([]);
  });
  it("mapea duración mínima/máxima", () => {
    expect(configCanchaADuracionesItem(configCancha)[0].values).toEqual({ minimo: "60", maximo: "180" });
  });
  it("expone las 4 columnas de reservas con su unidad real (sin convertir a horas)", () => {
    const items = configCanchaAReservasItems(configCancha);
    expect(items).toHaveLength(CAMPOS_RESERVA.length);
    expect(items.find((i) => i.id === "anticipacion-minima")).toEqual({
      id: "anticipacion-minima",
      titulo: "Anticipación mínima",
      tipo: "reserva",
      unidad: "minutos",
      values: { valor: "0" },
    });
    expect(items.find((i) => i.id === "cancelacion-horas")?.unidad).toBe("horas");
  });
});

describe("tarifasDuracionAItems / tarifasFranjaAItems", () => {
  it("una duración inactiva llega con descuento vacío, no null literal", () => {
    const rows: TarifaDuracionRow[] = [
      { id: 1, duracion_minutos: 90, activo: false, descuento_pct: null as unknown as number, vigente_desde: "2026-01-01" },
    ];
    expect(tarifasDuracionAItems(rows)[0].values).toEqual({ duracion: "90", descuento: "", activo: false });
  });
  it("una franja activa mapea días/horario/descuento", () => {
    const rows: TarifaFranjaRow[] = [
      {
        id: 1,
        franja_id: "f1",
        activo: true,
        dias_semana: [1, 2, 3, 4, 5],
        hora_inicio: "08:00:00",
        hora_fin: "16:00:00",
        descuento_pct: 15,
        vigente_desde: "2026-01-01",
      },
    ];
    const item = tarifasFranjaAItems(rows)[0];
    expect(item.id).toBe("f1");
    expect(item.values.dias).toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]);
    expect(item.values.descuento).toBe("15");
  });
});

describe("fechasAItems", () => {
  it("tarifa_tipo null -> 'ninguna', sin descuento/valor", () => {
    const rows: FechaEspecialRow[] = [
      {
        id: 1,
        fecha: "2026-12-25",
        activo: true,
        cerrado: true,
        hora_apertura: null as unknown as string,
        hora_cierre: null as unknown as string,
        tarifa_tipo: null as unknown as string,
        tarifa_valor: null as unknown as number,
        nota: null as unknown as string,
        vigente_desde: "2026-01-01",
      },
    ];
    const item = fechasAItems(rows)[0];
    expect(item.id).toBe("2026-12-25");
    expect(item.values.tarifa).toBe("ninguna");
    expect(item.values.cerrado).toBe(true);
    expect(item.values.descuento).toBeUndefined();
  });
  it("tarifa_tipo precio_hora_fijo -> 'precio' con valor", () => {
    const rows: FechaEspecialRow[] = [
      {
        id: 2,
        fecha: "2027-01-01",
        activo: true,
        cerrado: false,
        hora_apertura: "16:00:00",
        hora_cierre: "02:00:00",
        tarifa_tipo: "precio_hora_fijo",
        tarifa_valor: 25000,
        nota: null as unknown as string,
        vigente_desde: "2026-01-01",
      },
    ];
    const item = fechasAItems(rows)[0];
    expect(item.values.tarifa).toBe("precio");
    expect(item.values.valor).toBe("25000");
    expect(item.values.descuento).toBeUndefined();
  });
});

describe("datosPublicosAItems", () => {
  it("sin fila no muestra nada", () => {
    expect(datosPublicosAItems(null)).toEqual([]);
  });
  it("mapea nombre/whatsapp/instagram/direccion/mapa a strings", () => {
    const row: DatosPublicosRow = {
      id: 1,
      nombre_cancha: "Los amigos padel",
      whatsapp_numero: "5493775550100",
      instagram_url: "https://www.instagram.com/losamigos_padel",
      direccion: "Monte Caseros, Corrientes",
      mapa_lat: -30.242812,
      mapa_lng: -57.655903,
      actualizado: "2026-01-01T00:00:00Z",
      actualizado_por: null,
    };
    expect(datosPublicosAItems(row)).toEqual([
      {
        id: "datos-publicos",
        titulo: "Datos públicos",
        tipo: "publico",
        values: {
          nombreCancha: "Los amigos padel",
          whatsappNumero: "5493775550100",
          instagramUrl: "https://www.instagram.com/losamigos_padel",
          direccion: "Monte Caseros, Corrientes",
          mapaLat: "-30.242812",
          mapaLng: "-57.655903",
        },
      },
    ]);
  });
  it("instagram_url null llega como string vacío, no null literal", () => {
    const row: DatosPublicosRow = {
      id: 1,
      nombre_cancha: "Los amigos padel",
      whatsapp_numero: "5493775550100",
      instagram_url: null,
      direccion: "Monte Caseros, Corrientes",
      mapa_lat: -30.242812,
      mapa_lng: -57.655903,
      actualizado: "2026-01-01T00:00:00Z",
      actualizado_por: null,
    };
    expect(datosPublicosAItems(row)[0].values.instagramUrl).toBe("");
  });
});

describe("parseEntero / parseNumero / esMultiploDe30", () => {
  it("parseEntero rechaza decimales y vacío", () => {
    expect(parseEntero("60")).toBe(60);
    expect(parseEntero("60.5")).toBeNull();
    expect(parseEntero("")).toBeNull();
    expect(parseEntero(undefined)).toBeNull();
  });
  it("parseNumero acepta decimales", () => {
    expect(parseNumero("15.5")).toBe(15.5);
    expect(parseNumero("abc")).toBeNull();
  });
  it("esMultiploDe30", () => {
    expect(esMultiploDe30(90)).toBe(true);
    expect(esMultiploDe30(45)).toBe(false);
  });
});

describe("primeraFila", () => {
  it("toma la primera fila o null", () => {
    expect(primeraFila([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 });
    expect(primeraFila([])).toBeNull();
    expect(primeraFila(null)).toBeNull();
  });
});

describe("mapearErrorConfiguracion", () => {
  it("traduce códigos de los RPC admin_set_*", () => {
    expect(mapearErrorConfiguracion("no_autorizado")).toMatch(/permisos/);
    expect(mapearErrorConfiguracion("franja_superpuesta")).toMatch(/superpone/);
    expect(mapearErrorConfiguracion("dias_semana_invalido")).toMatch(/día/);
  });
  it("traduce violaciones de CHECK de configuracion_cancha", () => {
    expect(
      mapearErrorConfiguracion(
        'new row for relation "configuracion_cancha" violates check constraint "configuracion_cancha_duracion_grid_check"',
      ),
    ).toMatch(/múltiplos de 30/);
  });
  it("traduce violaciones de CHECK de datos_publicos_cancha", () => {
    expect(
      mapearErrorConfiguracion(
        'new row for relation "datos_publicos_cancha" violates check constraint "datos_publicos_cancha_whatsapp_check"',
      ),
    ).toMatch(/solo números/);
    expect(
      mapearErrorConfiguracion(
        'new row for relation "datos_publicos_cancha" violates check constraint "datos_publicos_cancha_lat_check"',
      ),
    ).toMatch(/latitud/);
  });
  it("mensaje desconocido cae al fallback genérico", () => {
    expect(mapearErrorConfiguracion("algo_que_no_existe")).toBe(
      "No se pudo guardar. Revisá los valores e intentá de nuevo.",
    );
  });
});
