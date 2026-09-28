/** @vitest-environment jsdom */
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ remove: vi.fn(), upload: vi.fn() }));
vi.mock("../../../lib/supabase", () => ({ supabase: {
  storage: { from: () => mocks },
  from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
} }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); });
it("un error de upload limpia el path único incluso si el servidor llegó a escribir", async () => {
  mocks.upload.mockResolvedValue({ error: { message: "timeout" } });
  mocks.remove.mockResolvedValue({ error: null });
  const { subirImagenProducto } = await import("./productos.api");
  const result = await subirImagenProducto(new File(["image"], "foto.webp", { type: "image/webp" }));
  expect(result.path).toBeNull();
  expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
  expect(localStorage.getItem("admin:imagenes-productos:limpieza")).toBe("[]");
});
it("no pierde un borrado fallido: persiste y reintenta al volver al catálogo", async () => {
  mocks.remove.mockResolvedValueOnce({ error: { message: "offline" } }).mockResolvedValue({ error: null });
  const { borrarImagenProducto, obtenerProductos } = await import("./productos.api");
  await borrarImagenProducto("temporal.webp");
  expect(localStorage.getItem("admin:imagenes-productos:limpieza")).toContain("temporal.webp");
  await obtenerProductos();
  await Promise.resolve();
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem("admin:imagenes-productos:limpieza")).toBe("[]");
});
