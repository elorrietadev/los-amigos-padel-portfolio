import {
  CalendarDays,
  Clock3,
  Plus,
  SlidersHorizontal,
  Tag,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import {
  cruzaMedianoche,
  dinero,
  horario,
  type ConfigItem,
  type ConfigFormKind,
} from "./configuracion.types";

export interface SectionProps {
  items: ConfigItem[];
  onEdit: (item: ConfigItem) => void;
  onAdd: (tipo: ConfigFormKind) => void;
  onToggle: (item: ConfigItem) => void;
  readOnly?: boolean;
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-body-sm text-muted">
      {children}
    </div>
  );
}
function Edit({
  item,
  onEdit,
  readOnly,
}: Pick<SectionProps, "onEdit" | "readOnly"> & { item: ConfigItem }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className="min-h-11 sm:min-h-9"
      onClick={() => onEdit(item)}
      disabled={readOnly}
      aria-label={`Editar ${item.titulo}`}
    >
      Editar
    </Button>
  );
}
function Active({ active }: { active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-label font-semibold ${active ? "bg-success-muted text-success" : "bg-surface-2 text-muted"}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-current"
      />
      {active ? "Activa" : "Inactiva"}
    </span>
  );
}
function Time({ item }: { item: ConfigItem }) {
  return (
    <div className="text-body-sm tabular-nums text-text-secondary">
      {horario(item.values)}
      {cruzaMedianoche(item.values) && (
        <span className="ml-2 text-caption text-info">+1 día</span>
      )}
    </div>
  );
}
export function GeneralConfigSection(props: SectionProps) {
  if (!props.items.length)
    return <Empty>No hay un precio base disponible.</Empty>;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      {props.items.map((item) => (
        <Card key={item.id} className="relative overflow-hidden p-6 sm:p-8">
          <div className="mb-8 flex items-center justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-accent-muted text-accent">
              <Wallet size={22} />
            </span>
            <span className="text-label font-semibold uppercase tracking-widest text-muted">
              Precio base
            </span>
          </div>
          <h3 className="text-body font-medium text-text-secondary">
            Precio base por hora
          </h3>
          <p className="my-3 break-words font-heading text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-tight tracking-tight text-text tabular-nums">
            {dinero(item.values.valor)}
            <span className="ml-2 font-body text-sm font-normal text-muted">
              / hora
            </span>
          </p>
          <p className="mb-7 text-body-sm text-muted">
            Este valor se utiliza como base para nuevas reservas.
          </p>
          <Edit {...props} item={item} />
        </Card>
      ))}
      <Card className="flex flex-col justify-center gap-4 p-6">
        <SlidersHorizontal size={24} className="text-muted" />
        <h3 className="font-heading text-section-title text-text">
          Una base, distintas posibilidades
        </h3>
        <p className="text-body-sm leading-relaxed text-muted">
          Los descuentos por duración, las franjas y las fechas especiales
          tienen su propio espacio en esta configuración.
        </p>
      </Card>
    </div>
  );
}
export function HorariosConfigSection(props: SectionProps) {
  if (!props.items.length) return <Empty>No hay horarios disponibles.</Empty>;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4 text-body-sm text-muted">
        <Clock3 size={17} /> Semana habitual{" "}
        <span className="ml-auto text-caption">
          Cierre +1 día = día siguiente
        </span>
      </div>
      <div className="divide-y divide-border">
        {props.items.map((item) => (
          <div
            key={item.id}
            className="config-week-row grid items-center gap-3 px-5 py-3.5"
          >
            <h3 className="text-body-sm font-semibold text-text">
              {item.titulo}
            </h3>
            <span
              className={`w-fit rounded-pill px-2.5 py-1 text-label font-medium ${item.values.cerrado ? "bg-surface-2 text-muted" : "bg-success-muted text-success"}`}
            >
              {item.values.cerrado ? "Cerrado" : "Abierto"}
            </span>
            <div>{!item.values.cerrado && <Time item={item} />}</div>
            <Edit {...props} item={item} />
          </div>
        ))}
      </div>
    </Card>
  );
}
export function DuracionesConfigSection(props: SectionProps) {
  return props.items.length ? (
    <>
      {props.items.map((item) => (
        <Card key={item.id} className="p-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h3 className="font-heading text-section-title text-text">
              Tiempo de juego
            </h3>
            <Edit {...props} item={item} />
          </div>
          <div className="grid grid-cols-2 gap-5">
            {[
              ["Duración mínima", item.values.minimo],
              ["Duración máxima", item.values.maximo],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-surface-2 p-4 sm:p-6">
                <p className="text-body-sm text-muted">{label}</p>
                <p className="mt-3 font-heading text-3xl text-text tabular-nums">
                  {value ?? "—"}
                  <span className="ml-2 font-body text-sm text-muted">min</span>
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-body-sm text-muted">
            El rango se expresa con un mínimo y un máximo.
          </p>
        </Card>
      ))}
    </>
  ) : (
    <Empty>No hay un rango de duración disponible.</Empty>
  );
}
function RuleActions(props: SectionProps & { item: ConfigItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Edit {...props} />
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11 sm:min-h-9"
        disabled={props.readOnly}
        onClick={() => props.onToggle(props.item)}
        aria-label={`${props.item.values.activo ? "Desactivar" : "Activar"} ${props.item.titulo}`}
      >
        {props.item.values.activo ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}
export function TarifasConfigSection(props: SectionProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      {(["duracion", "franja"] as const).map((tipo) => {
        const items = props.items.filter((item) => item.tipo === tipo);
        return (
          <Card key={tipo} className="min-w-0 p-4 sm:p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="rounded-md bg-accent-muted p-2.5 text-accent">
                {tipo === "duracion" ? <Clock3 size={20} /> : <Tag size={20} />}
              </span>
              <div>
                <h3 className="font-heading text-section-title text-text">
                  {tipo === "duracion" ? "Por duración" : "Por franja horaria"}
                </h3>
                <p className="text-caption text-muted">
                  {items.length} reglas configuradas
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {items.length ? (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-bg-subtle p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="break-words text-body-sm font-semibold text-text">
                          {tipo === "duracion"
                            ? `${item.values.duracion} min`
                            : item.values.dias
                                ?.map((d) => d.slice(0, 3))
                                .join(" · ") || "Sin días seleccionados"}
                        </h4>
                        {tipo === "franja" && <Time item={item} />}
                      </div>
                      <Active active={item.values.activo} />
                    </div>
                    <p className="mb-4 font-heading text-3xl text-accent">
                      {item.values.descuento}%{" "}
                      <span className="font-body text-body-sm text-muted">
                        de descuento
                      </span>
                    </p>
                    <RuleActions {...props} item={item} />
                  </div>
                ))
              ) : (
                <Empty>
                  Todavía no hay descuentos{" "}
                  {tipo === "duracion" ? "por duración" : "por franja horaria"}.
                </Empty>
              )}
            </div>
            <Button
              variant="secondary"
              className="config-add-button mt-4 w-full"
              disabled={props.readOnly}
              onClick={() => props.onAdd(tipo)}
            >
              <Plus size={17} className="shrink-0" />
              {tipo === "duracion"
                ? "Agregar descuento por duración"
                : "Agregar franja"}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
export function ReservasConfigSection(props: SectionProps) {
  return props.items.length ? (
    <div className="grid gap-4 sm:grid-cols-2">
      {props.items.map((item) => (
        <Card key={item.id} className="p-5">
          <h3 className="text-body-sm font-medium text-muted">{item.titulo}</h3>
          <p className="my-5 font-heading text-3xl text-text tabular-nums">
            {item.values.valor ?? "—"}{" "}
            <span className="font-body text-sm text-muted">{item.unidad}</span>
          </p>
          <Edit {...props} item={item} />
        </Card>
      ))}
    </div>
  ) : (
    <Empty>No hay condiciones de reserva disponibles.</Empty>
  );
}
export function DatosPublicosConfigSection(props: SectionProps) {
  if (!props.items.length) return <Empty>No hay datos públicos configurados.</Empty>;
  const item = props.items[0];
  const v = item.values;
  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h3 className="font-heading text-section-title text-text">
          Contacto y ubicación
        </h3>
        <Edit {...props} item={item} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-body-sm text-muted">Nombre de la cancha</p>
          <p className="mt-1 break-words text-body font-medium text-text">
            {v.nombreCancha || "—"}
          </p>
        </div>
        <div>
          <p className="text-body-sm text-muted">WhatsApp</p>
          <p className="mt-1 text-body font-medium tabular-nums text-text">
            {v.whatsappNumero || "—"}
          </p>
        </div>
        <div>
          <p className="text-body-sm text-muted">Instagram</p>
          <p className="mt-1 break-words text-body font-medium text-text">
            {v.instagramUrl || "—"}
          </p>
        </div>
        <div>
          <p className="text-body-sm text-muted">Dirección</p>
          <p className="mt-1 break-words text-body font-medium text-text">
            {v.direccion || "—"}
          </p>
        </div>
        <div>
          <p className="text-body-sm text-muted">Ubicación (mapa)</p>
          <p className="mt-1 text-body font-medium tabular-nums text-text">
            {v.mapaLat || "—"}, {v.mapaLng || "—"}
          </p>
        </div>
      </div>
    </Card>
  );
}
export function FechasEspecialesConfigSection(props: SectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          className="config-add-button max-w-full"
          disabled={props.readOnly}
          onClick={() => props.onAdd("fecha")}
        >
          <Plus size={17} /> Agregar fecha especial
        </Button>
      </div>
      {props.items.length ? (
        <div className="grid gap-3">
          {props.items.map((item) => {
            const [, month, day] = (item.values.fecha ?? "").split("-");
            const monthName = [
              "ENE",
              "FEB",
              "MAR",
              "ABR",
              "MAY",
              "JUN",
              "JUL",
              "AGO",
              "SEP",
              "OCT",
              "NOV",
              "DIC",
            ][Number(month) - 1];
            return (
              <Card
                key={item.id}
                className="flex flex-wrap items-center gap-4 p-4 sm:p-5"
              >
                <div
                  aria-label={item.values.fecha}
                  className="flex w-16 shrink-0 flex-col items-center rounded-md bg-surface-2 py-3"
                >
                  <span className="font-heading text-2xl text-text">
                    {day || "—"}
                  </span>
                  <span className="text-label font-semibold text-muted">
                    {monthName}
                  </span>
                  <span className="text-caption text-muted">
                    {item.values.fecha?.slice(0, 4)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-body-sm font-semibold text-text">
                      {item.values.cerrado
                        ? "Cerrado todo el día"
                        : item.values.tarifa === "descuento"
                          ? `${item.values.descuento}% de descuento`
                          : item.values.tarifa === "precio"
                            ? `${dinero(item.values.valor)} / hora`
                            : "Horario especial"}
                    </h3>
                    <Active active={item.values.activo} />
                  </div>
                  {!item.values.cerrado && <Time item={item} />}
                </div>
                <RuleActions {...props} item={item} />
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty>
          <CalendarDays className="mx-auto mb-3" size={28} />
          No hay fechas especiales. Agregá una excepción cuando la necesites.
        </Empty>
      )}
    </div>
  );
}
