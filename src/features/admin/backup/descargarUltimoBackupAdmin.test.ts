// Tests de orquestación (no de la descarga física del navegador — eso no
// aporta nada acá, ver instrucciones de la sesión). `generarArchivo`
// inyectado reemplaza el Blob/<a download> real, mismo patrón que
// exportarStock.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { obtenerUltimoBackupAdmin } from "./backup.api";
import { descargarUltimoBackupAdmin } from "./descargarUltimoBackupAdmin";

vi.mock("./backup.api", () => ({
  obtenerUltimoBackupAdmin: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const BACKUP_VALIDO = {
  creado: "2026-01-04T12:00:00.000Z",
  schema_version: 2,
  contenido: { reservas: [{ id: "r1" }], productos: [] },
};

describe("descargarUltimoBackupAdmin", () => {
  it("éxito: genera el archivo con el nombre y contenido correctos, devuelve ok:true y la fecha", async () => {
    vi.mocked(obtenerUltimoBackupAdmin).mockResolvedValue({ data: BACKUP_VALIDO, error: null } as never);
    const generarArchivo = vi.fn();

    const resultado = await descargarUltimoBackupAdmin(generarArchivo);

    expect(resultado).toEqual({ ok: true, creado: BACKUP_VALIDO.creado });
    expect(generarArchivo).toHaveBeenCalledTimes(1);
    const [contenido, nombreArchivo] = generarArchivo.mock.calls[0]!;
    expect(JSON.parse(contenido)).toEqual(BACKUP_VALIDO);
    expect(nombreArchivo).toMatch(/^Los_Amigos_Padel_Backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/);
  });

  it("la RPC falla: no genera archivo, devuelve ok:false con mensaje genérico", async () => {
    vi.mocked(obtenerUltimoBackupAdmin).mockResolvedValue({ data: null, error: { message: "boom" } } as never);
    const generarArchivo = vi.fn();

    const resultado = await descargarUltimoBackupAdmin(generarArchivo);

    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBeTruthy();
    expect(generarArchivo).not.toHaveBeenCalled();
  });

  it("no hay ningún backup todavía (data: null, sin error): mensaje específico, no genera archivo", async () => {
    vi.mocked(obtenerUltimoBackupAdmin).mockResolvedValue({ data: null, error: null } as never);
    const generarArchivo = vi.fn();

    const resultado = await descargarUltimoBackupAdmin(generarArchivo);

    expect(resultado).toEqual({ ok: false, error: "Todavía no hay ningún backup guardado." });
    expect(generarArchivo).not.toHaveBeenCalled();
  });

  it("respuesta con forma inesperada (ej. un array): no genera archivo, error genérico", async () => {
    vi.mocked(obtenerUltimoBackupAdmin).mockResolvedValue({ data: [BACKUP_VALIDO], error: null } as never);
    const generarArchivo = vi.fn();

    const resultado = await descargarUltimoBackupAdmin(generarArchivo);

    expect(resultado.ok).toBe(false);
    expect(generarArchivo).not.toHaveBeenCalled();
  });
});
