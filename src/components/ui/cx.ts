// Merge de clases mínimo — evita sumar clsx como dependencia para esto.
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
