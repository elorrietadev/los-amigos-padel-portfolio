// PHONE-FIX — puerto 1:1 de public.normalize_phone() (Postgres). Mismo algoritmo,
// mismo orden de pasos, a propósito: esto es solo feedback INMEDIATO en el
// formulario (validación real y definitiva del lado del cliente) — el
// backend sigue siendo la autoridad (validar_telefono_normalizable /
// TELEFONO_INVALIDO). Si se toca acá, tocar también la función SQL para que
// no diverjan.
//
// Devuelve el teléfono normalizado a 10 dígitos (forma canónica argentina:
// área + abonado, sin "0"/"15"/"+54"/"9") o `null` si no se puede
// normalizar sin ambigüedad.
export function normalizarTelefonoArgentino(telefono: string): string | null {
  if (!telefono) return null;
  let digitos = telefono.replace(/\D/g, "");

  if (/^54/.test(digitos) && digitos.length > 10) {
    digitos = digitos.slice(2);
    if (/^9/.test(digitos) && digitos.length > 10) {
      digitos = digitos.slice(1);
    }
  }

  if (/^0/.test(digitos) && digitos.length > 10) {
    digitos = digitos.slice(1);
  }

  if (digitos.length === 12) {
    digitos = quitarPrefijo15SinAmbiguedad(digitos);
  }

  return digitos.length === 10 ? digitos : null;
}

// Prefijo móvil viejo "15" (área+15+abonado) sin "0" ni "54" por delante da
// 12 dígitos. Los códigos de área argentinos miden 2, 3 o 4 dígitos: se
// prueban esos 3 largos y solo se saca el "15" si UNA sola posición matchea
// ahí — si matchean 0 o más de 1, es ambiguo (o no es este caso) y se
// devuelve el string intacto, sin inventar un número.
function quitarPrefijo15SinAmbiguedad(digitos: string): string {
  let candidato: string | null = null;
  let coincidencias = 0;
  for (let largoArea = 2; largoArea <= 4; largoArea++) {
    if (digitos.slice(largoArea, largoArea + 2) === "15") {
      coincidencias++;
      candidato = digitos.slice(0, largoArea) + digitos.slice(largoArea + 2);
    }
  }
  return coincidencias === 1 ? candidato! : digitos;
}
