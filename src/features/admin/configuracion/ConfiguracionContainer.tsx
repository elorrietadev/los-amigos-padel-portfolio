// ConfiguracionContainer (C10) — conecta ConfiguracionView (presentación pura,
// sin tocar) al backend real vía useConfiguracion. AdminShell monta
// esto en vez de <ConfiguracionView /> a secas cuando VITE_ADMIN_CONFIGURACION_UI
// está habilitado.

import { ConfiguracionView } from "./ConfiguracionView";
import { useConfiguracion } from "./useConfiguracion";

export function ConfiguracionContainer() {
  const { data, estados, guardar, reintentar } = useConfiguracion();
  return <ConfiguracionView data={data} estados={estados} onGuardar={guardar} onReintentar={reintentar} />;
}
