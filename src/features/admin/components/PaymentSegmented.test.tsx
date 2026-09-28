/** @vitest-environment jsdom */
// PaymentSegmented (R6) — el componente es puramente controlado (no guarda
// estado propio de modo/montos), así que estos tests verifican que expone los
// 3 segmentos con su estado activo (aria-pressed) y que cada interacción
// dispara exactamente el callback esperado, sin calcular nada por su cuenta
// (el autocálculo bidireccional sigue siendo responsabilidad de quien lo usa,
// ver VenderView.test.tsx para esa cobertura de extremo a extremo).

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentSegmented, type PaymentSegmentedProps } from "./PaymentSegmented";

afterEach(() => {
  cleanup();
});

function renderSegmented(overrides: Partial<PaymentSegmentedProps> = {}) {
  const props = {
    modo: "efectivo" as const,
    onModoChange: vi.fn(),
    montoEfectivo: "0",
    montoTransferencia: "0",
    onMontoEfectivoChange: vi.fn(),
    onMontoTransferenciaChange: vi.fn(),
    ...overrides,
  };
  render(<PaymentSegmented {...props} />);
  return props;
}

describe("PaymentSegmented", () => {
  it("renderiza los 3 segmentos y marca el activo con aria-pressed", () => {
    renderSegmented({ modo: "transferencia" });

    expect(screen.getByRole("button", { name: "Efectivo" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Transferencia" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Mixto" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("en efectivo/transferencia no muestra los inputs de mixto", () => {
    renderSegmented({ modo: "efectivo" });
    expect(screen.queryByLabelText("Monto en efectivo")).toBeNull();
    expect(screen.queryByLabelText("Monto en transferencia")).toBeNull();
  });

  it("clickear un segmento llama a onModoChange con esa clave, sin tocar los montos", async () => {
    const user = userEvent.setup();
    const props = renderSegmented({ modo: "efectivo" });

    await user.click(screen.getByRole("button", { name: "Mixto" }));

    expect(props.onModoChange).toHaveBeenCalledWith("mixto");
    expect(props.onMontoEfectivoChange).not.toHaveBeenCalled();
    expect(props.onMontoTransferenciaChange).not.toHaveBeenCalled();
  });

  it("en mixto muestra los inputs con los valores controlados y dispara los handlers al tipear", async () => {
    const user = userEvent.setup();
    const props = renderSegmented({ modo: "mixto", montoEfectivo: "3000", montoTransferencia: "7000" });

    expect((screen.getByLabelText("Monto en efectivo") as HTMLInputElement).value).toBe("3000");
    expect((screen.getByLabelText("Monto en transferencia") as HTMLInputElement).value).toBe("7000");

    await user.type(screen.getByLabelText("Monto en efectivo"), "1");
    expect(props.onMontoEfectivoChange).toHaveBeenCalled();
  });

  it("muestra el aviso opcional solo en modo mixto", () => {
    const { rerender } = render(
      <PaymentSegmented
        modo="efectivo"
        onModoChange={vi.fn()}
        montoEfectivo="0"
        montoTransferencia="0"
        onMontoEfectivoChange={vi.fn()}
        onMontoTransferenciaChange={vi.fn()}
        avisoMixto={<p>Ojo con el desajuste</p>}
      />,
    );
    expect(screen.queryByText("Ojo con el desajuste")).toBeNull();

    rerender(
      <PaymentSegmented
        modo="mixto"
        onModoChange={vi.fn()}
        montoEfectivo="0"
        montoTransferencia="0"
        onMontoEfectivoChange={vi.fn()}
        onMontoTransferenciaChange={vi.fn()}
        avisoMixto={<p>Ojo con el desajuste</p>}
      />,
    );
    expect(screen.getByText("Ojo con el desajuste")).toBeTruthy();
  });

  it("disabled deshabilita los 3 segmentos y los inputs de mixto", () => {
    renderSegmented({ modo: "mixto", disabled: true });

    expect((screen.getByRole("button", { name: "Efectivo" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Transferencia" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Mixto" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Monto en efectivo") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Monto en transferencia") as HTMLInputElement).disabled).toBe(true);
  });
});
