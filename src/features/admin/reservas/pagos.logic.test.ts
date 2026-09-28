import { describe, expect, it } from "vitest";
import { mensajeErrorMovimientoPago, parametrosMovimiento, previsualizarPago, requiereRecargarPago } from "./pagos.logic";

const E = { precio: 1000000, efectivo: 300000, transferencia: 200000 }; // $10.000; ef $3.000; tr $2.000

describe("previsualizarPago — espejo de registrar_movimiento_pago", () => {
  it("cobro vacío no se puede guardar (nunca se asume el saldo)", () => {
    expect(previsualizarPago(E, "cobro", "", "", "").error).toBe("Ingresá cuánto recibiste.");
  });
  it("cobro parcial y cobro que supera el precio", () => {
    const p = previsualizarPago(E, "cobro", "1000", "", "");
    expect([p.error, p.efectivoFinal, p.saldoFinal]).toEqual([null, 400000, 400000]);
    expect(previsualizarPago(E, "cobro", "5000", "0.01", "").error).toMatch(/no puede superar el precio/);
  });
  it("reintegro: por el mismo medio, <= lo cobrado en ese medio, con motivo", () => {
    expect(previsualizarPago(E, "reintegro", "3000.01", "", "x motivo").error).toMatch(/mismo medio del cobro/);
    expect(previsualizarPago(E, "reintegro", "", "2000.01", "x motivo").error).toMatch(/mismo medio del cobro/);
    expect(previsualizarPago(E, "reintegro", "1000", "", "").error).toBe("El motivo es obligatorio.");
    const ok = previsualizarPago(E, "reintegro", "3000", "2000", "canceló");
    expect([ok.error, ok.deltaEfectivo, ok.deltaTransferencia, ok.efectivoFinal + ok.transferenciaFinal]).toEqual([null, -300000, -200000, 0]);
  });
  it("corrección: valores finales, diferencias por medio, motivo; sin cambios no se guarda", () => {
    expect(previsualizarPago(E, "correccion", "3000", "2000", "motivo").error).toMatch(/iguales a los registrados/);
    const p = previsualizarPago(E, "correccion", "0", "5000", "era transferencia");
    expect([p.error, p.deltaEfectivo, p.deltaTransferencia]).toEqual([null, -300000, 300000]);
    expect(previsualizarPago(E, "correccion", "0", "5000", "").error).toBe("El motivo es obligatorio.");
  });
  it("importes inválidos", () => {
    expect(previsualizarPago(E, "cobro", "1,234", "", "").error).toMatch(/importes válidos/);
  });
});

describe("parametrosMovimiento — pesos con 2 decimales y lo esperado", () => {
  it("convierte exacto", () => {
    expect(parametrosMovimiento(E, "2500,5", "")).toEqual({ efectivo: 2500.5, transferencia: 0, esperadoEfectivo: 3000, esperadoTransferencia: 2000 });
  });
});

describe("errores del servidor", () => {
  it("mensajes claros y cuándo hay que recargar", () => {
    expect(mensajeErrorMovimientoPago({ message: "pago_desactualizado" })).toMatch(/Otro admin u otra pestaña/);
    expect(mensajeErrorMovimientoPago({ message: "reintegro_excede_cobrado" })).toMatch(/mismo medio del cobro/);
    expect(mensajeErrorMovimientoPago({ code: "IK001", message: "x" })).toMatch(/ya se había registrado/);
    expect(mensajeErrorMovimientoPago({ message: "cualquier" })).toMatch(/no se registra dos veces/);
    expect(requiereRecargarPago({ message: "pago_desactualizado" })).toBe(true);
    expect(requiereRecargarPago({ message: "reintegro_excede_cobrado" })).toBe(false);
  });
});
