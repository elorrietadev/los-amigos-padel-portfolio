import { describe, expect, it } from "vitest";
import { fechaContableDe, horaContableDe, rangoMesContable, rangoSemanaContable } from "./fechaContable";

// Independiente de la zona del proceso: siempre Buenos Aires.
describe("fecha contable (America/Argentina/Buenos_Aires)", () => {
  it("lunes 00:20 en BA es lunes, aunque en UTC ya sea otra hora", () => {
    const t = new Date("2026-09-21T03:20:00Z").getTime(); // lun 21/09 00:20 BA
    expect(fechaContableDe(t)).toBe("2026-09-21");
    expect(horaContableDe(t)).toBe("00:20");
  });
  it("domingo 23:50 en BA sigue siendo domingo (en UTC ya es lunes)", () => {
    const t = new Date("2026-09-21T02:50:00Z").getTime();
    expect(fechaContableDe(t)).toBe("2026-09-20");
  });
  it("semana lunes-domingo: el cambio domingo->lunes cambia de semana", () => {
    const dom = new Date("2026-09-21T02:59:00Z").getTime(); // dom 20/09 23:59 BA
    const lun = new Date("2026-09-21T03:00:00Z").getTime(); // lun 21/09 00:00 BA
    expect(rangoSemanaContable(dom)).toEqual({ inicio: "2026-09-14", fin: "2026-09-20" });
    expect(rangoSemanaContable(lun)).toEqual({ inicio: "2026-09-21", fin: "2026-09-27" });
    expect(rangoSemanaContable(lun, -1)).toEqual({ inicio: "2026-09-14", fin: "2026-09-20" });
  });
  it("mes contable, incluido febrero", () => {
    expect(rangoMesContable(new Date("2026-02-10T12:00:00-03:00").getTime())).toEqual({ inicio: "2026-02-01", fin: "2026-02-28" });
    expect(rangoMesContable(new Date("2028-02-10T12:00:00-03:00").getTime())).toEqual({ inicio: "2028-02-01", fin: "2028-02-29" });
  });
});
