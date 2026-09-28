# Seguridad

Este repositorio es un snapshot de portfolio, separado del proyecto productivo. Aun así, si encontrás un problema de seguridad en el código publicado (una validación que falta, un patrón inseguro, algo que no debería estar acá), quiero saberlo.

## Cómo reportar

Usá [GitHub Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) en este repositorio (pestaña **Security** → **Report a vulnerability**) si está habilitado. Si no lo ves disponible, escribime directamente a **leansuper9@gmail.com** con el asunto `[SECURITY]`.

No abras un Issue público para esto.

## Qué incluir

- Una descripción breve del problema y su impacto.
- Los pasos para reproducirlo, si aplica.
- El archivo o la función involucrada.

## Qué evitar

- No incluyas datos reales, credenciales, ni capturas con información de terceros.
- No publiques el detalle como Issue ni como comentario antes de que se confirme y, si corresponde, se corrija.

## Alcance

El sitio productivo real (no este repositorio) corre en infraestructura separada con sus propias credenciales, y no comparte secretos con este snapshot. `.env.example` en este repo solo tiene valores de ejemplo — nunca claves reales.
