import { describe, expect, it } from "vitest";
import { esBackupValido, nombreArchivoBackup, serializarBackup } from "./backup.logic";
import type { UltimoBackupAdmin } from "./backup.types";

describe("nombreArchivoBackup", () => {
  it("usa fecha y hora locales de 'creado', con guiones y padding a 2 dígitos", () => {
    // 2026-01-04T17:09:06Z — la hora local depende del entorno de test, pero
    // fecha/mes/día/padding deben respetar el formato exacto pedido.
    const nombre = nombreArchivoBackup("2026-01-04T03:09:00.000Z");
    expect(nombre).toMatch(/^Los_Amigos_Padel_Backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/);
  });

  it("dos backups de fechas distintas producen nombres distintos", () => {
    const a = nombreArchivoBackup("2026-01-04T12:00:00.000Z");
    const b = nombreArchivoBackup("2026-06-15T08:30:00.000Z");
    expect(a).not.toBe(b);
  });
});

describe("esBackupValido", () => {
  const valido: UltimoBackupAdmin = {
    creado: "2026-01-04T12:00:00.000Z",
    schema_version: 2,
    contenido: { reservas: [] },
  };

  it("acepta el shape correcto", () => {
    expect(esBackupValido(valido)).toBe(true);
  });

  it("rechaza null", () => {
    expect(esBackupValido(null)).toBe(false);
  });

  it("rechaza un array (nunca debe interpretarse como lista)", () => {
    expect(esBackupValido([valido])).toBe(false);
  });

  it("rechaza si falta 'creado'", () => {
    const { creado, ...resto } = valido;
    expect(esBackupValido(resto)).toBe(false);
  });

  it("rechaza si 'schema_version' no es number", () => {
    expect(esBackupValido({ ...valido, schema_version: "2" })).toBe(false);
  });

  it("rechaza si 'contenido' es null", () => {
    expect(esBackupValido({ ...valido, contenido: null })).toBe(false);
  });
});

describe("serializarBackup", () => {
  it("serializa el objeto completo (creado + schema_version + contenido), no solo el contenido", () => {
    const backup: UltimoBackupAdmin = {
      creado: "2026-01-04T12:00:00.000Z",
      schema_version: 2,
      contenido: { reservas: [{ id: "r1" }] },
    };
    const json = serializarBackup(backup);
    expect(JSON.parse(json)).toEqual(backup);
  });

  it("produce JSON legible (indentado), no una sola línea", () => {
    const json = serializarBackup({ creado: "x", schema_version: 2, contenido: {} });
    expect(json).toContain("\n");
  });
});
