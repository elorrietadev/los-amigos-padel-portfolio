// Agota todas las páginas de una query paginada (range/offset) acumulando en
// un solo array. PostgREST corta cada respuesta en `max-rows` (1000 en
// Supabase): una query financiera SIN paginar puede perder filas en silencio.
// Si CUALQUIER página falla, devuelve ese error y nunca un acumulado parcial.
// El llamador tiene que ordenar por una clave total (p. ej. fecha, creado, id)
// para que las páginas no se solapen ni salteen filas.

export interface ResultadoPaginado<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export const TAMANO_PAGINA_DEFAULT = 500;

export async function obtenerTodasLasPaginas<T>(
  obtenerPagina: (offset: number, limite: number) => PromiseLike<ResultadoPaginado<T>>,
  tamanoPagina: number = TAMANO_PAGINA_DEFAULT,
): Promise<ResultadoPaginado<T>> {
  const acumulado: T[] = [];
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await obtenerPagina(offset, tamanoPagina);
    if (error) return { data: null, error };
    const pagina = data ?? [];
    acumulado.push(...pagina);
    if (pagina.length < tamanoPagina) break;
    offset += tamanoPagina;
  }
  return { data: acumulado, error: null };
}
