// PadelBallLogo — isotipo de la marca pública: pelota lima con volumen,
// costuras, halo y dos órbitas de "energía". SVG puro (sin raster) con
// proporciones fijas en un viewBox 64×64: `size` solo escala el conjunto.
//
// Las órbitas pasan por DETRÁS y por DELANTE de la pelota: cada una se
// dibuja dos veces, la mitad trasera (y<0 en su sistema local inclinado)
// antes de la esfera y la delantera después, recortadas con dos clipPath
// complementarios — así cada tramo se pinta una sola vez (sin doble alpha).
//
// Toda la animación es CSS (padel-ball-logo.css), sin estado de React: el
// componente renderiza una vez y el navegador anima. Con
// prefers-reduced-motion queda estático en su pose de reposo.
import { useId, type CSSProperties } from "react";
import { cx } from "../ui/cx";
import "./padel-ball-logo.css";

export interface PadelBallLogoProps {
  /** Lado en px del isotipo completo (pelota + órbitas). */
  size?: number;
  className?: string;
}

const CENTRO = 32;
const RADIO = 21;

interface Trazo {
  /** Inicio del tramo sobre la elipse, en unidades de pathLength=100. */
  desde: number;
  largo: number;
  ancho: number;
  opacidad: number;
  clase: string;
}

interface Orbita {
  inclinacion: number;
  rx: number;
  ry: number;
  trazos: Trazo[];
}

// Posición 0 = extremo izquierdo; 0→50 recorre la mitad delantera (abajo)
// hacia la derecha, 50→100 vuelve por la trasera (arriba).
const ORBITAS: Orbita[] = [
  {
    // Órbita principal: cometa que pasa por delante con cola escalonada
    // (4 capas del mismo trayecto, cada una más corta, ancha y opaca, para
    // simular el afinado que un stroke SVG no puede hacer solo) y glow.
    inclinacion: -22,
    rx: 29,
    ry: 9.5,
    trazos: [
      { desde: 3, largo: 47, ancho: 1, opacidad: 0.28, clase: "pbl-cometa" },
      { desde: 16, largo: 34, ancho: 1.6, opacidad: 0.5, clase: "pbl-cometa" },
      { desde: 30, largo: 20, ancho: 2.3, opacidad: 0.8, clase: "pbl-cometa" },
      { desde: 38, largo: 10, ancho: 6, opacidad: 0.2, clase: "pbl-cometa pbl-cometa-glow" },
      { desde: 40, largo: 10, ancho: 3, opacidad: 1, clase: "pbl-cometa pbl-cometa-cabeza" },
    ],
  },
  {
    // Estela fina secundaria: aparece por la derecha y se pierde detrás de
    // la pelota (la esfera la tapa), lo que da la lectura de profundidad.
    inclinacion: -34,
    rx: 31,
    ry: 15,
    trazos: [{ desde: 51, largo: 26, ancho: 1.4, opacidad: 0.6, clase: "pbl-estela" }],
  },
  {
    // Línea de velocidad exterior, corta y tenue, abajo a la izquierda.
    inclinacion: -16,
    rx: 30.5,
    ry: 14,
    trazos: [{ desde: 8, largo: 14, ancho: 1.1, opacidad: 0.45, clase: "pbl-estela" }],
  },
];

const PARTICULAS = [
  { cx: 60, cy: 15.5, r: 1.4, retraso: "0s" },
  { cx: 5.5, cy: 39, r: 1.1, retraso: "-1.6s" },
  { cx: 13, cy: 9.5, r: 0.9, retraso: "-3.1s" },
];

function trayectoElipse(rx: number, ry: number) {
  return `M${-rx} 0A${rx} ${ry} 0 0 0 ${rx} 0A${rx} ${ry} 0 0 0 ${-rx} 0`;
}

export function PadelBallLogo({ size = 36, className }: PadelBallLogoProps) {
  // useId puede traer caracteres que rompen url(#...) — se normaliza.
  const uid = `pbl${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const id = (nombre: string) => `${uid}-${nombre}`;
  const url = (nombre: string) => `url(#${id(nombre)})`;

  const capaOrbitas = (mitad: "trasera" | "delantera") => (
    <g transform={`translate(${CENTRO} ${CENTRO})`}>
      <g className="pbl-orbitas">
        <g className="pbl-orbitas-hover">
          {ORBITAS.map((orbita, i) => (
            <g key={i} transform={`rotate(${orbita.inclinacion})`} clipPath={url(mitad)}>
              {orbita.trazos.map((trazo, j) => (
                <path
                  key={j}
                  d={trayectoElipse(orbita.rx, orbita.ry)}
                  pathLength={100}
                  className={trazo.clase}
                  fill="none"
                  strokeLinecap="round"
                  strokeWidth={trazo.ancho}
                  strokeOpacity={trazo.opacidad}
                  strokeDasharray={trazo.largo >= 100 ? undefined : `${trazo.largo} ${100 - trazo.largo}`}
                  strokeDashoffset={-trazo.desde}
                  style={{ "--pbl-desde": -trazo.desde } as CSSProperties}
                />
              ))}
            </g>
          ))}
        </g>
      </g>
    </g>
  );

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cx("pbl shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={id("cuerpo")} cx="0.37" cy="0.31" r="0.78">
          <stop offset="0" stopColor="#F7FFD6" />
          <stop offset="0.16" stopColor="#E6FF80" />
          <stop offset="0.44" stopColor="#CBF340" />
          <stop offset="0.76" stopColor="#8EBF1F" />
          <stop offset="1" stopColor="#4A7010" />
        </radialGradient>
        <radialGradient id={id("brillo")}>
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("halo")}>
          <stop offset="0.58" className="pbl-halo-stop" stopOpacity="0.5" />
          <stop offset="0.72" className="pbl-halo-stop" stopOpacity="0.2" />
          <stop offset="1" className="pbl-halo-stop" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("costura")} gradientUnits="userSpaceOnUse" x1="14" y1="12" x2="50" y2="54">
          <stop offset="0" stopColor="#FCFFEC" />
          <stop offset="0.55" stopColor="#F1FFCC" stopOpacity="0.9" />
          <stop offset="1" stopColor="#DBF59A" stopOpacity="0.45" />
        </linearGradient>
        <clipPath id={id("esfera")}>
          <circle cx={CENTRO} cy={CENTRO} r={RADIO} />
        </clipPath>
        {/* Semiplanos en coordenadas locales de cada órbita (ya rotadas):
            se solapan 0.25 para no dejar una línea de antialias en el corte. */}
        <clipPath id={id("trasera")} clipPathUnits="userSpaceOnUse">
          <rect x="-40" y="-40" width="80" height="40.25" />
        </clipPath>
        <clipPath id={id("delantera")} clipPathUnits="userSpaceOnUse">
          <rect x="-40" y="-0.25" width="80" height="40.25" />
        </clipPath>
      </defs>

      <circle className="pbl-halo" cx={CENTRO} cy={CENTRO} r="31" fill={url("halo")} />

      {capaOrbitas("trasera")}

      <g>
        <circle cx={CENTRO} cy={CENTRO} r={RADIO} fill={url("cuerpo")} />
        {/* Luz rebotada en el borde inferior derecho: separa la esfera del
            fondo oscuro sin necesidad de contorno. */}
        <path
          d="M50.6 38.8A19.8 19.8 0 0 1 28.6 51.5"
          fill="none"
          stroke="#E9FF9E"
          strokeOpacity="0.38"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <g clipPath={url("esfera")} fill="none" strokeLinecap="round">
          <g transform={`rotate(-32 ${CENTRO} ${CENTRO})`}>
            <g stroke="#2B4A05" strokeOpacity="0.4" strokeWidth="2.8" transform="translate(0.7 0.9)">
              <path d="M14 10.5C26 20.5 26 43.5 14 53.5" />
              <path d="M50 10.5C38 20.5 38 43.5 50 53.5" />
            </g>
            <g stroke={url("costura")} strokeWidth="2.3">
              <path d="M14 10.5C26 20.5 26 43.5 14 53.5" />
              <path d="M50 10.5C38 20.5 38 43.5 50 53.5" />
            </g>
          </g>
        </g>
        <ellipse
          cx="24"
          cy="21.5"
          rx="7"
          ry="4.4"
          transform="rotate(-38 24 21.5)"
          fill={url("brillo")}
          opacity="0.8"
        />
        <circle cx="22.4" cy="20.4" r="1.5" fill="#FFFFFF" opacity="0.9" />
      </g>

      {capaOrbitas("delantera")}

      {PARTICULAS.map((p, i) => (
        <circle
          key={i}
          className="pbl-particula"
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          style={{ animationDelay: p.retraso }}
        />
      ))}
    </svg>
  );
}
