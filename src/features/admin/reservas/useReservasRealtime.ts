// Port de admin.html:799-820 (canal "reservas-nuevas", evento INSERT) — solo
// la suscripción; qué hacer con cada fila nueva (sonido, banner, señal hacia
// ReservasView) lo decide el llamador vía `onNuevaReserva`. Vive en
// AdminShell (B5), no en ReservasView: el legacy mantiene el canal mientras
// haya sesión, sin importar la pestaña activa, y hoy ReservasView se
// desmonta al salir de "reservas" (hasta que B8 la deje montada con hidden).

import { useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import type { ReservaRow } from "./reservas.types";

export function useReservasRealtime(onNuevaReserva: (reserva: ReservaRow) => void): void {
  // `onNuevaReserva` como dependencia (no `[]`): si el llamador no la
  // estabiliza con useCallback, cada re-render reabriría el canal. La
  // responsabilidad de la identidad estable es de quien llama a este hook.
  useEffect(() => {
    const canal = supabase
      .channel("reservas-nuevas")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reservas" }, (payload) => {
        const nueva = payload.new as ReservaRow;
        if (!nueva.bloqueado) onNuevaReserva(nueva);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [onNuevaReserva]);
}
