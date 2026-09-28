/** @vitest-environment jsdom */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfiguracionView } from "./ConfiguracionView";
import { configuracionFixture } from "./configuracion.test-fixtures";
import { CONFIG_SECTIONS } from "./configuracion.types";

afterEach(cleanup);
const tab = (name: string) =>
  within(
    screen.getByRole("group", { name: "Secciones de configuración" }),
  ).getByRole("button", { name });
describe("Configuración: presentación sin transporte", () => {
  it("sin adapter no muestra valores demo ni acciones de guardado", () => {
    render(<ConfiguracionView />);
    expect(screen.getByText("Configuración aún no conectada")).toBeTruthy();
    expect(screen.queryByText(/20.000/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
  });
  it("navega las secciones mediante el selector compartido", async () => {
    const user = userEvent.setup();
    render(<ConfiguracionView data={configuracionFixture()} />);
    for (const section of CONFIG_SECTIONS) {
      await user.click(tab(section.label));
      expect(tab(section.label).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("region", { name: section.label })).toBeTruthy();
    }
  });
  it("cancelar descarta el borrador y Escape devuelve el foco al disparador", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(
      <ConfiguracionView data={configuracionFixture()} onGuardar={save} />,
    );
    const trigger = screen.getByRole("button", { name: "Editar Precio base" });
    await user.click(trigger);
    await user.clear(screen.getByLabelText("Precio base por hora ($)"));
    await user.type(screen.getByLabelText("Precio base por hora ($)"), "25000");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    expect(
      (screen.getByLabelText("Precio base por hora ($)") as HTMLInputElement)
        .value,
    ).toBe("20000");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(save).not.toHaveBeenCalled();
  });
  it("confirma precio, bloquea durante saving y sólo entonces informa éxito", async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <ConfiguracionView data={configuracionFixture()} onGuardar={save} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Editar Precio base" }),
    );
    const input = screen.getByLabelText("Precio base por hora ($)");
    await user.clear(input);
    await user.type(input, "25000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(
      screen.getByText(/Vas a cambiar el precio base de/).textContent,
    ).toContain("25.000");
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          values: expect.objectContaining({ valor: "25000" }),
        }),
      }),
    );
    expect(
      (screen.getByRole("button", { name: "Guardando…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("dialog", { name: "Confirmar cambio de configuración" }),
    ).toBeTruthy();
    await act(async () => finish());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Cambios guardados.")).toBeTruthy();
  });
  it("muestra error conservando el borrador y permite reintentar", async () => {
    const user = userEvent.setup();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Revisá el precio indicado"))
      .mockResolvedValue(undefined);
    render(
      <ConfiguracionView data={configuracionFixture()} onGuardar={save} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Editar Precio base" }),
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Revisá el precio indicado",
    );
    expect(
      (screen.getByLabelText("Precio base por hora ($)") as HTMLInputElement)
        .value,
    ).toBe("20000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("oculta horarios al cerrar un día y muestra impacto sólo si lo recibe", async () => {
    const user = userEvent.setup();
    render(
      <ConfiguracionView
        data={configuracionFixture()}
        onGuardar={vi.fn()}
        impactos={{ "dia-0": ["Advertencia externa de prueba"] }}
      />,
    );
    await user.click(tab("Horarios"));
    await user.click(screen.getByRole("button", { name: "Editar Lunes" }));
    expect(
      screen.getByText("El cierre corresponde al día siguiente."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cerrado" }));
    expect(screen.queryByLabelText("Hora apertura")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("Advertencia externa de prueba")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Editar Lunes" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("crea franja con días accesibles y no predetermina duraciones", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfiguracionView data={configuracionFixture()} onGuardar={save} />,
    );
    await user.click(tab("Tarifas"));
    await user.click(screen.getByRole("button", { name: "Agregar franja" }));
    await user.click(screen.getByRole("button", { name: "Lunes" }));
    expect(
      screen
        .getByRole("button", { name: "Lunes" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: "Hora apertura" }));
    await user.type(screen.getByRole("textbox", { name: "Buscar horario" }), "22:00");
    await user.click(screen.getByRole("option", { name: "22:00" }));
    await user.click(screen.getByRole("button", { name: "Hora cierre" }));
    await user.type(screen.getByRole("textbox", { name: "Buscar horario" }), "02:00");
    await user.click(screen.getByRole("option", { name: "02:00" }));
    await user.type(screen.getByLabelText("Descuento (%)"), "15");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        nuevo: true,
        item: expect.objectContaining({
          values: expect.objectContaining({ dias: ["Lunes"] }),
        }),
      }),
    );
  });
  it("fecha especial alterna cerrado, descuento y precio fijo", async () => {
    const user = userEvent.setup();
    render(
      <ConfiguracionView data={configuracionFixture()} onGuardar={vi.fn()} />,
    );
    await user.click(tab("Fechas especiales"));
    await user.click(
      screen.getByRole("button", { name: "Agregar fecha especial" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Tarifa especial"),
      "precio",
    );
    expect(screen.getByLabelText("Precio por hora ($)")).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Tarifa especial"),
      "descuento",
    );
    expect(screen.queryByLabelText("Precio por hora ($)")).toBeNull();
    expect(screen.getByLabelText("Descuento (%)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cerrado" }));
    expect(screen.queryByLabelText("Tarifa especial")).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("confirma activación sin mutar la prop original", async () => {
    const user = userEvent.setup();
    const data = configuracionFixture();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ConfiguracionView data={data} onGuardar={save} />);
    await user.click(tab("Tarifas"));
    await user.click(
      screen.getByRole("button", { name: "Desactivar Descuento de 90 min" }),
    );
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          values: expect.objectContaining({ activo: false }),
        }),
      }),
    );
    expect(data.tarifas[0].values.activo).toBe(true);
  });
  it("atrapa Tab dentro del editor y conserva min/max sin lista de duraciones", async () => {
    const user = userEvent.setup();
    render(
      <ConfiguracionView data={configuracionFixture()} onGuardar={vi.fn()} />,
    );
    await user.click(tab("Duraciones"));
    await user.click(screen.getByRole("button", { name: "Editar Duraciones" }));
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Guardar" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cerrar formulario" }),
    );
    expect(
      (screen.getByLabelText("Duración mínima (minutos)") as HTMLInputElement)
        .value,
    ).toBe("60");
    expect(
      (screen.getByLabelText("Duración máxima (minutos)") as HTMLInputElement)
        .value,
    ).toBe("180");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
  it("edita datos públicos y conserva Instagram opcional al guardar", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfiguracionView data={configuracionFixture()} onGuardar={save} />,
    );
    await user.click(tab("Datos públicos"));
    expect(screen.getByText("5493775550100")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Editar Datos públicos" }),
    );
    const instagram = screen.getByLabelText("Instagram (URL)");
    await user.clear(instagram);
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          values: expect.objectContaining({ instagramUrl: "", nombreCancha: "Los amigos padel" }),
        }),
      }),
    );
  });
  it.each(CONFIG_SECTIONS)(
    "loading, error y empty en $label",
    async ({ value, label }) => {
      const user = userEvent.setup();
      const retry = vi.fn();
      const data = configuracionFixture();
      data[value] = [];
      const view = render(
        <ConfiguracionView
          data={data}
          estados={{ [value]: { fase: "loading" } }}
        />,
      );
      await user.click(tab(label));
      expect(screen.getByText("Cargando configuración…")).toBeTruthy();
      view.rerender(
        <ConfiguracionView
          data={data}
          estados={{ [value]: { fase: "error", mensaje: "Error controlado" } }}
          onReintentar={retry}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Reintentar" }));
      expect(retry).toHaveBeenCalledWith(value);
      view.rerender(<ConfiguracionView data={data} />);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("region", { name: label }).textContent).toMatch(
        /No hay|Todavía no hay/,
      );
    },
  );
});
