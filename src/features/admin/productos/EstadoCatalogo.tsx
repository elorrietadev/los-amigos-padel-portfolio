import { Button } from "../../../components/ui/Button";
import type { UseProductosResult } from "./useProductos";

export function EstadoCatalogo({ productos }: { productos: UseProductosResult }) {
  if (productos.loading) return <p role="status" className="text-sm text-muted">Cargando productos…</p>;
  if (!productos.error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-error">No se pudieron cargar los productos.</p>
      <Button variant="secondary" size="sm" onClick={() => productos.recargar()}>Reintentar</Button>
    </div>
  );
}
