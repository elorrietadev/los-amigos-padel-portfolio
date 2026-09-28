/** @vitest-environment jsdom */
// Tests de "descargar último backup" (E7) — movidos tal cual desde
// BloqueosView.test.tsx en R2 (BackupView es ahora su propio destino de
// navegación, sin nada de horarios/teléfonos bloqueados alrededor).

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupView } from "./BackupView";
import { descargarUltimoBackupAdmin } from "./descargarUltimoBackupAdmin";

vi.mock("./descargarUltimoBackupAdmin", () => ({
  descargarUltimoBackupAdmin: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BackupView — descargar último backup (E7)", () => {
  it("éxito: llama a descargarUltimoBackupAdmin y muestra toast con la fecha", async () => {
    const user = userEvent.setup();
    const mostrarToast = vi.fn();
    vi.mocked(descargarUltimoBackupAdmin).mockResolvedValue({ ok: true, creado: "2026-01-04T17:09:06.000Z" });
    render(<BackupView mostrarToast={mostrarToast} />);

    await user.click(screen.getByRole("button", { name: "Descargar último backup" }));
    expect(descargarUltimoBackupAdmin).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mostrarToast).toHaveBeenCalledWith(expect.stringContaining("Backup descargado"), "ok"));
  });

  it("sin backups: muestra el error específico de descargarUltimoBackupAdmin", async () => {
    const user = userEvent.setup();
    const mostrarToast = vi.fn();
    vi.mocked(descargarUltimoBackupAdmin).mockResolvedValue({
      ok: false,
      error: "Todavía no hay ningún backup guardado.",
    });
    render(<BackupView mostrarToast={mostrarToast} />);

    await user.click(screen.getByRole("button", { name: "Descargar último backup" }));
    await waitFor(() =>
      expect(mostrarToast).toHaveBeenCalledWith("Todavía no hay ningún backup guardado.", "error"),
    );
  });

  it("evita doble click: mientras descarga, el botón queda deshabilitado y se llama una sola vez", async () => {
    const user = userEvent.setup();
    let resolver!: (v: { ok: true; creado: string }) => void;
    vi.mocked(descargarUltimoBackupAdmin).mockReturnValue(new Promise((res) => (resolver = res)));
    render(<BackupView mostrarToast={vi.fn()} />);

    const boton = screen.getByRole("button", { name: "Descargar último backup" });
    await user.click(boton);
    expect((screen.getByRole("button", { name: "Descargando..." }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Descargando..." }));
    expect(descargarUltimoBackupAdmin).toHaveBeenCalledTimes(1);

    resolver({ ok: true, creado: "2026-01-04T17:09:06.000Z" });
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Descargar último backup" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
  });
});


it("libera busy ante excepcion de descarga", async () => {
  vi.mocked(descargarUltimoBackupAdmin).mockRejectedValueOnce(new Error("download failed"));
  const toast = vi.fn(); render(<BackupView mostrarToast={toast} />);
  await userEvent.click(screen.getByRole("button", { name: /Descargar/ }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith("No se pudo descargar el backup.", "error"));
  expect((screen.getByRole("button", { name: /Descargar/ }) as HTMLButtonElement).disabled).toBe(false);
});
