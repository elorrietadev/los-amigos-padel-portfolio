// Set de íconos propio de esta feature — mismo wrapper outline que
// reservations-public/components/icons.tsx, pero sin importarlo desde ahí:
// el proyecto no comparte componentes entre features (cada una es una unidad
// aislada), así que se duplica el wrapper acá en vez de acoplar admin a otra
// feature por 4 íconos.

import type { ReactNode } from "react";

interface IconProps {
  size?: number;
  className?: string;
}

function Icon({ children, size = 18, className }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2"></rect>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
    </Icon>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </Icon>
  );
}

export function IconEye(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </Icon>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 11s3.5 7 10 7a9.606 9.606 0 0 0 5.39-1.61"></path>
      <path d="M9.53 9.53a3 3 0 0 0 4.24 4.24"></path>
      <path d="m2 2 20 20"></path>
    </Icon>
  );
}

// Set del nav de AdminShell — mismos trazos que admin.html:368-375 (IconGrid,
// IconList, IconRepeat, IconTrophy, IconPackage), solo reenvolcados en el
// wrapper de esta feature en vez del componente inline del legacy.
export function IconGrid(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1"></rect>
      <rect x="14" y="3" width="7" height="7" rx="1"></rect>
      <rect x="3" y="14" width="7" height="7" rx="1"></rect>
      <rect x="14" y="14" width="7" height="7" rx="1"></rect>
    </Icon>
  );
}

export function IconList(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </Icon>
  );
}

export function IconRepeat(props: IconProps) {
  return (
    <Icon {...props}>
      <polyline points="17 1 21 5 17 9"></polyline>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
      <polyline points="7 23 3 19 7 15"></polyline>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
    </Icon>
  );
}

export function IconTrophy(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 21h8"></path>
      <path d="M12 17v4"></path>
      <path d="M7 4h10"></path>
      <path d="M17 4v4a5 5 0 0 1-10 0V4"></path>
      <path d="M7 4H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4"></path>
      <path d="M17 4h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"></path>
    </Icon>
  );
}

export function IconPackage(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16.5 9.4 7.5 4.21"></path>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </Icon>
  );
}

// Botón "volver arriba" — admin.html:2869-2871 (SVG inline, no formaba parte
// del set IconX del legacy). Se suma acá para no repetir el <svg> a mano en
// AdminShell.
export function IconArrowUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V5"></path>
      <path d="m5 12 7-7 7 7"></path>
    </Icon>
  );
}

// admin.html:372 (IconWhatsapp) — mismo trazo exacto, usado en el botón
// WhatsApp de "Necesitan confirmación" y "Próximos" (B4.2).
export function IconWhatsapp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
    </Icon>
  );
}
