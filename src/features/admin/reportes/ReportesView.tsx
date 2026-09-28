// ReportesView (R2) — "casa" propia de navegación para los reportes que ya
// existían sueltos en otras pantallas (E5/E6): Caja y Actividad (antes solo
// alcanzable desde el botón "Exportar" de Cierre de caja, ahora también
// desde acá) y Productos/Stock (antes solo desde "Exportar stock" en
// Catálogo, que se deja intacto). No es el centro de reportes final de R8:
// ningún dato/métrica nueva, solo reutiliza exactamente las mismas 2
// exportaciones ya existentes, con descripción + botón.
//
// R8 — pulido visual (primitivos R1 + Lucide, mismo lenguaje que
// Productos/Caja): ícono en placa por card y la descripción de Productos/
// Stock ahora nombra la valorización (valor stock a costo/venta) que el
// Excel ya arma en construirReporteStock.ts (armarHojaProductos) — no era
// una métrica inventada, solo faltaba nombrarla acá. Cero cambios en qué
// exporta cada botón.

import { useState, type ReactNode } from "react";
import { Banknote, Package } from "lucide-react";
import { configCancha } from "../../../config/canchaConfig";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { ExportarReporteModal } from "./ExportarReporteModal";
import { exportarStock } from "./exportarStock";

export interface ReportesViewProps {
  mostrarToast: (mensaje: string, tipo?: "ok" | "error") => void;
}

interface ReporteDef {
  titulo: string;
  descripcion: string;
  Icon: typeof Banknote;
}

const REPORTES: Record<"caja" | "stock", ReporteDef> = {
  caja: {
    titulo: "Caja y actividad",
    descripcion: "Movimientos, neto por día y por método de pago en el rango que elijas.",
    Icon: Banknote,
  },
  stock: {
    titulo: "Productos y stock",
    descripcion: "Stock actual, costos y lotes de reposición, con valorización a costo y a venta de todo el catálogo.",
    Icon: Package,
  },
};

export function ReportesView({ mostrarToast }: ReportesViewProps) {
  const [exportarCajaAbierto, setExportarCajaAbierto] = useState(false);
  const [exportandoStock, setExportandoStock] = useState(false);

  const ahora = Date.now();

  async function alExportarStock() {
    if (exportandoStock) return;
    setExportandoStock(true);
    try {
      const resultado = await exportarStock(Date.now());
      setExportandoStock(false);
      if (!resultado.ok) {
        mostrarToast(resultado.error ?? "No se pudo generar el reporte de stock. Probá de nuevo.", "error");
        return;
      }
      mostrarToast("Excel de stock generado.", "ok");
    } catch { mostrarToast("No se pudo generar o descargar el reporte de stock.", "error"); }
    finally { setExportandoStock(false); }
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      <ReporteCard def={REPORTES.caja}>
        <Button size="sm" className="self-start" onClick={() => setExportarCajaAbierto(true)}>
          Exportar
        </Button>
      </ReporteCard>

      <ReporteCard def={REPORTES.stock}>
        <Button size="sm" className="self-start" loading={exportandoStock} onClick={alExportarStock}>
          Exportar
        </Button>
      </ReporteCard>

      {exportarCajaAbierto && (
        <ExportarReporteModal
          rangoInicial="semana"
          ahora={ahora}
          nombreCancha={configCancha.nombreCancha}
          onClose={() => setExportarCajaAbierto(false)}
          onExito={() => mostrarToast("Excel generado.", "ok")}
        />
      )}
    </div>
  );
}

interface ReporteCardProps {
  def: ReporteDef;
  children: ReactNode;
}

function ReporteCard({ def, children }: ReporteCardProps) {
  const { titulo, descripcion, Icon } = def;
  return (
    <Card className="ui-transition flex flex-col gap-3 p-4 hover:border-border-strong">
      <div className="flex flex-1 items-start gap-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
          <Icon size={17} strokeWidth={2} />
        </span>
        <div>
          <h2 className="font-heading text-section-title font-bold text-text">{titulo}</h2>
          <p className="mt-1 text-body-sm text-muted">{descripcion}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}
