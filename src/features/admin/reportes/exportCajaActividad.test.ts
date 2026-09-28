// Tests de orquestación — FINAL-F6. `generarArchivo` inyectado reemplaza
// construir+descargar. La reconciliación completa contra una base real (DB =
// Caja = Resumen = hojas) está en reconciliacion.contable.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportarCajaActividad } from "./exportCajaActividad";
import {
  obtenerDevolucionesReporte,
  obtenerMovimientosReporte,
  obtenerReservasActividad,
  obtenerVentasReporteCompleto,
} from "./reportes.api";
import type { DatosReporte } from "./reportes.types";

vi.mock("./reportes.api", () => ({
  obtenerMovimientosReporte: vi.fn(),
  obtenerVentasReporteCompleto: vi.fn(),
  obtenerDevolucionesReporte: vi.fn(),
  obtenerReservasActividad: vi.fn(),
}));

const RANGO = { desde: "2026-01-01", hasta: "2026-01-31" };
const AHORA = new Date("2026-01-15T12:00:00-03:00").getTime();

beforeEach(() => {
  vi.clearAllMocks();
});

type Fuente = "movimientos" | "ventas" | "devoluciones" | "reservas";
function mockearFuentes(overrides: Partial<Record<Fuente, { data: unknown; error: unknown }>> = {}) {
  const vacio = { data: [], error: null };
  vi.mocked(obtenerMovimientosReporte).mockResolvedValue((overrides.movimientos ?? vacio) as never);
  vi.mocked(obtenerVentasReporteCompleto).mockResolvedValue((overrides.ventas ?? vacio) as never);
  vi.mocked(obtenerDevolucionesReporte).mockResolvedValue((overrides.devoluciones ?? vacio) as never);
  vi.mocked(obtenerReservasActividad).mockResolvedValue((overrides.reservas ?? vacio) as never);
}

describe("exportarCajaActividad — todo o nada", () => {
  it("las 4 fuentes OK: genera el archivo una sola vez", async () => {
    mockearFuentes();
    const generarArchivo = vi.fn();
    const resultado = await exportarCajaActividad(RANGO, AHORA, "Los Amigos Pádel", generarArchivo);
    expect(resultado.ok).toBe(true);
    expect(generarArchivo).toHaveBeenCalledTimes(1);
    expect(obtenerMovimientosReporte).toHaveBeenCalledWith("2026-01-01", "2026-01-31");
  });

  it.each(["movimientos", "ventas", "devoluciones", "reservas"] as const)("falla %s: no genera archivo", async (fuente) => {
    mockearFuentes({ [fuente]: { data: null, error: { message: "boom" } } });
    const generarArchivo = vi.fn();
    const resultado = await exportarCajaActividad(RANGO, AHORA, "Los Amigos Pádel", generarArchivo);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBeTruthy();
    expect(generarArchivo).not.toHaveBeenCalled();
  });
});

describe("el Resumen se calcula sobre las MISMAS filas del detalle", () => {
  it("seña de un turno futuro entra por su fecha contable; devolución de una venta vieja resta en su fecha", async () => {
    mockearFuentes({
      movimientos: {
        data: [
          { id: "m1", reserva_id: "r1", operacion_id: "00000000-0000-0000-0000-000000000001", creado: "2026-01-10T10:00:00-03:00", fecha: "2026-01-10", medio: "transferencia", importe: 5000, tipo: "cobro", motivo: null, actor_id: null, reserva_fecha: "2026-02-20", reserva_hora_inicio: "20:00:00", reserva_hora_fin: "21:00:00", reserva_nombre: "Seña futura", reserva_turno_fijo: false },
          { id: "m2", reserva_id: null, operacion_id: "00000000-0000-0000-0000-000000000002", creado: "2026-01-11T10:00:00-03:00", fecha: "2026-01-11", medio: "efectivo", importe: 3000, tipo: "saldo_migrado", motivo: "x", actor_id: null, reserva_fecha: "2025-12-20", reserva_hora_inicio: "20:00:00", reserva_hora_fin: "21:00:00", reserva_nombre: "Viejo", reserva_turno_fijo: false },
        ],
        error: null,
      },
      devoluciones: {
        data: [{ id: "d1", creado: "2026-01-12T10:00:00-03:00", fecha: "2026-01-12", cantidad: 1, medio_reembolso: "efectivo", motivo: null, venta_items: { precio_unitario_snapshot: 1000, productos: { nombre: "Agua" }, ventas: { id: "v-vieja", fecha: "2025-12-30", creado: "2025-12-30T10:00:00-03:00" } } }],
        error: null,
      },
    });
    let datos: DatosReporte | null = null;
    await exportarCajaActividad(RANGO, AHORA, "X", (d) => { datos = d; });
    const d = datos as unknown as DatosReporte;
    expect(d.resumen.reservasTransferencia).toBe(500000);
    expect(d.resumen.devolucionesEfectivo).toBe(100000);
    expect(d.resumen.netoTotal).toBe(400000);
    expect(d.resumen.saldoMigradoExcluido).toBe(300000);
    expect(d.filasPagos).toHaveLength(1);
    expect(d.filasDevoluciones[0].fechaVenta).toBe("2025-12-30");
  });
});
