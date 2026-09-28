import { describe, expect, it } from "vitest";
import { agruparHorariosSemana } from "./horariosSemana.logic";
import type { HorarioSemanaDia } from "../reservations-public/reservations.types";

function dia(diaSemana: number, overrides: Partial<HorarioSemanaDia> = {}): HorarioSemanaDia {
  return { diaSemana, abierto: true, horaApertura: "08:00", horaCierre: "01:00", ...overrides };
}

describe("agruparHorariosSemana", () => {
  it("junta los 7 días en un solo grupo cuando todos comparten el mismo horario", () => {
    const dias = [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d));
    expect(agruparHorariosSemana(dias)).toEqual([
      { etiquetaDias: "Lunes a Domingo", abierto: true, horaApertura: "08:00", horaCierre: "01:00" },
    ]);
  });

  it("separa un fin de semana con horario distinto del resto", () => {
    const dias = [
      dia(1),
      dia(2),
      dia(3),
      dia(4),
      dia(5),
      dia(6, { horaApertura: "09:00", horaCierre: "02:00" }),
      dia(0, { horaApertura: "09:00", horaCierre: "02:00" }),
    ];
    expect(agruparHorariosSemana(dias)).toEqual([
      { etiquetaDias: "Lunes a Viernes", abierto: true, horaApertura: "08:00", horaCierre: "01:00" },
      { etiquetaDias: "Sábado y Domingo", abierto: true, horaApertura: "09:00", horaCierre: "02:00" },
    ]);
  });

  it("un día cerrado corta el grupo aunque el horario de apertura/cierre sea igual", () => {
    const dias = [1, 2, 3, 4, 5].map((d) => dia(d));
    dias.push(dia(6, { abierto: false, horaApertura: null, horaCierre: null }));
    dias.push(dia(0, { abierto: false, horaApertura: null, horaCierre: null }));
    expect(agruparHorariosSemana(dias)).toEqual([
      { etiquetaDias: "Lunes a Viernes", abierto: true, horaApertura: "08:00", horaCierre: "01:00" },
      { etiquetaDias: "Sábado y Domingo", abierto: false, horaApertura: null, horaCierre: null },
    ]);
  });

  it("un solo día distinto queda en su propio grupo, sin ' a '/' y '", () => {
    const dias = [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d));
    dias[0] = dia(0, { horaApertura: "10:00", horaCierre: "23:00" }); // domingo distinto
    // reordenar: domingo queda último en Lunes->Domingo, así que el grupo
    // distinto de 1 elemento es el último de la lista.
    expect(agruparHorariosSemana(dias)).toEqual([
      { etiquetaDias: "Lunes a Sábado", abierto: true, horaApertura: "08:00", horaCierre: "01:00" },
      { etiquetaDias: "Domingo", abierto: true, horaApertura: "10:00", horaCierre: "23:00" },
    ]);
  });

  it("días faltantes (fetch parcial) simplemente no aparecen", () => {
    expect(agruparHorariosSemana([dia(1), dia(3)])).toEqual([
      { etiquetaDias: "Lunes", abierto: true, horaApertura: "08:00", horaCierre: "01:00" },
      { etiquetaDias: "Miércoles", abierto: true, horaApertura: "08:00", horaCierre: "01:00" },
    ]);
  });

  it("array vacío devuelve array vacío", () => {
    expect(agruparHorariosSemana([])).toEqual([]);
  });
});
