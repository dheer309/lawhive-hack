"use client";

import type { ReactNode } from "react";

// Isometric office furniture in a muted "Dunder Mifflin" palette.
// Each piece's reference point is bottom-centre (it stands on a floor tile).

const shadow = (cx: number, cy: number, rx: number) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.32} fill="rgba(0,0,0,0.2)" />
);
const lerp = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function Plant() {
  return (
    <svg width="58" height="80" viewBox="0 0 58 80">
      {shadow(29, 74, 16)}
      <path d="M19 54 L39 54 L36 73 L22 73 Z" fill="#9a6b3f" />
      <ellipse cx="29" cy="54" rx="10.5" ry="3.4" fill="#b3835088" />
      <g fill="#4e7d3a">
        <path d="M29 54 C13 50 11 24 25 17 C27 34 30 45 29 54Z" />
        <path d="M29 54 C45 50 47 24 33 17 C31 34 28 45 29 54Z" />
        <path d="M29 53 C21 46 19 18 29 7 C39 18 37 46 29 53Z" />
      </g>
      <g fill="#629a46">
        <path d="M29 51 C24 45 24 23 29 13 C34 23 34 45 29 51Z" />
      </g>
    </svg>
  );
}

// Wood dresser / cabinet (matches the reference's right-hand cabinet).
export function Cabinet() {
  return (
    <svg width="58" height="80" viewBox="0 0 58 80">
      {shadow(29, 74, 20)}
      <path d="M9 24 L29 14 L49 24 L29 34 Z" fill="#a06a37" stroke="#7c4f27" />
      <path d="M9 24 L29 34 L29 68 L9 58 Z" fill="#7c4f27" />
      <path d="M49 24 L29 34 L29 68 L49 58 Z" fill="#8c5b2d" />
      <g stroke="#5f3c1d" strokeWidth="1">
        <line x1="29" y1="45" x2="49" y2="35" />
        <line x1="29" y1="56" x2="49" y2="46" />
      </g>
      <g fill="#caa15f">
        <circle cx="39" cy="35" r="1.5" />
        <circle cx="39" cy="46" r="1.5" />
        <circle cx="39" cy="57" r="1.5" />
      </g>
    </svg>
  );
}

export function Cooler() {
  return (
    <svg width="40" height="82" viewBox="0 0 40 82">
      {shadow(20, 76, 12)}
      <path d="M9 42 L20 36 L31 42 L31 64 L20 70 L9 64 Z" fill="#e3e7ec" />
      <path d="M20 36 L31 42 L31 64 L20 70 Z" fill="#c9ced4" />
      <rect x="14" y="50" width="12" height="4" rx="1" fill="#9aa0a8" />
      <path d="M12 36 C12 24 28 24 28 36 Z" fill="#86c9e8" opacity="0.9" />
      <ellipse cx="20" cy="22" rx="8" ry="4" fill="#a4d9ef" />
    </svg>
  );
}

export function Bookshelf() {
  return (
    <svg width="66" height="106" viewBox="0 0 66 106">
      {shadow(33, 100, 22)}
      <path d="M8 26 L40 9 L58 18 L26 35 Z" fill="#8a5a30" />
      <path d="M8 26 L26 35 L26 96 L8 87 Z" fill="#5d3e23" />
      <path d="M58 18 L26 35 L26 96 L58 79 Z" fill="#6b4a2b" />
      <g stroke="#4a3019" strokeWidth="1.4">
        <line x1="26" y1="55" x2="58" y2="38" />
        <line x1="26" y1="76" x2="58" y2="59" />
      </g>
      <g>
        <path d="M30 50 L34 48 L34 62 L30 64Z" fill="#b0563f" />
        <path d="M35 47 L39 45 L39 59 L35 61Z" fill="#3f7fb0" />
        <path d="M40 45 L44 43 L44 57 L40 59Z" fill="#caa23a" />
        <path d="M45 42 L49 40 L49 54 L45 56Z" fill="#5a8a3a" />
        <path d="M30 71 L35 68 L35 82 L30 85Z" fill="#7a6cae" />
        <path d="M36 68 L40 66 L40 80 L36 82Z" fill="#b0563f" />
        <path d="M41 65 L46 63 L46 77 L41 79Z" fill="#3f7fb0" />
      </g>
    </svg>
  );
}

// Dome floor lamp (matches the reference's lamps).
export function Lamp() {
  return (
    <svg width="40" height="100" viewBox="0 0 40 100">
      {shadow(20, 94, 11)}
      <ellipse cx="20" cy="90" rx="9" ry="3" fill="#3a3a3a" />
      <rect x="19" y="30" width="2" height="60" fill="#4a4a4a" />
      <path d="M6 30 C6 18 34 18 34 30 Z" fill="#efe6cc" stroke="#d8caa0" />
      <ellipse cx="20" cy="30" rx="14" ry="4" fill="#f2ead2" />
    </svg>
  );
}

export function CoffeeTable() {
  return (
    <svg width="92" height="54" viewBox="0 0 92 54">
      {shadow(46, 48, 30)}
      <path d="M10 22 L46 6 L82 22 L46 38 Z" fill="#a06a37" stroke="#7c4f27" />
      <path d="M10 22 L46 38 L46 46 L10 30 Z" fill="#7c4f27" />
      <path d="M82 22 L46 38 L46 46 L82 30 Z" fill="#8c5b2d" />
    </svg>
  );
}

export function Chair() {
  return (
    <svg width="48" height="64" viewBox="0 0 48 64">
      {shadow(24, 60, 13)}
      <path d="M12 6 L28 2 L31 22 L15 26 Z" fill="#565b61" />
      <path d="M10 26 L28 21 L40 28 L22 33 Z" fill="#6a7077" />
      <rect x="22" y="31" width="3" height="12" fill="#34373c" />
      <g stroke="#34373c" strokeWidth="3" strokeLinecap="round">
        <line x1="23" y1="43" x2="13" y2="52" />
        <line x1="23" y1="43" x2="35" y2="52" />
        <line x1="23" y1="43" x2="23" y2="55" />
      </g>
      <circle cx="13" cy="53" r="2.3" fill="#222" />
      <circle cx="35" cy="53" r="2.3" fill="#222" />
      <circle cx="23" cy="56" r="2.3" fill="#222" />
    </svg>
  );
}

// White venetian-blind cubicle divider — runs down-right (along +col).
export function DividerR() {
  const TL = [6, 6], TR = [90, 48], BR = [90, 100], BL = [6, 58];
  const slats = Array.from({ length: 9 }, (_, k) => {
    const t = (k + 1) / 10;
    const l = lerp(TL, BL, t), r = lerp(TR, BR, t);
    return <line key={k} x1={l[0]} y1={l[1]} x2={r[0]} y2={r[1]} stroke="#c2c6c0" strokeWidth="2" />;
  });
  return (
    <svg width="96" height="112" viewBox="0 0 96 112">
      <polygon points={`${TL} ${TR} ${BR} ${BL}`} fill="#eef0ec" stroke="#b9beb7" strokeWidth="1" />
      {slats}
      <rect x="3" y="4" width="4" height="56" rx="2" fill="#9aa0a4" />
      <rect x="89" y="46" width="4" height="56" rx="2" fill="#9aa0a4" />
    </svg>
  );
}

// White venetian-blind cubicle divider — runs down-left (along +row).
export function DividerL() {
  const TR = [90, 6], TL = [6, 48], BL = [6, 100], BR = [90, 58];
  const slats = Array.from({ length: 9 }, (_, k) => {
    const t = (k + 1) / 10;
    const l = lerp(TL, BL, t), r = lerp(TR, BR, t);
    return <line key={k} x1={l[0]} y1={l[1]} x2={r[0]} y2={r[1]} stroke="#c2c6c0" strokeWidth="2" />;
  });
  return (
    <svg width="96" height="112" viewBox="0 0 96 112">
      <polygon points={`${TR} ${TL} ${BL} ${BR}`} fill="#eef0ec" stroke="#b9beb7" strokeWidth="1" />
      {slats}
      <rect x="3" y="46" width="4" height="56" rx="2" fill="#9aa0a4" />
      <rect x="89" y="4" width="4" height="56" rx="2" fill="#9aa0a4" />
    </svg>
  );
}

const PROPS: Record<string, () => ReactNode> = {
  plant: Plant,
  cabinet: Cabinet,
  cooler: Cooler,
  bookshelf: Bookshelf,
  lamp: Lamp,
  coffee: CoffeeTable,
  chair: Chair,
  dividerR: DividerR,
  dividerL: DividerL,
};

export function FurnitureProp({ kind }: { kind: string }) {
  const C = PROPS[kind];
  return C ? <C /> : null;
}

// placement by floor-tile index (col, row); rendered at the tile centre.
export const FURNITURE: { id: string; col: number; row: number; kind: string }[] = [
  // cubicle walls tucked behind the back desk row (matches the staggered back desks)
  { id: "divB0", col: 0.0, row: -0.4, kind: "dividerR" },
  { id: "divB1", col: 1.7, row: -0.4, kind: "dividerR" },
  { id: "divB2", col: 3.4, row: -0.4, kind: "dividerR" },
  // down the left side
  { id: "divL0", col: -0.5, row: 0.4, kind: "dividerL" },
  { id: "divL1", col: -0.5, row: 1.6, kind: "dividerL" },
  // back wall furniture
  { id: "bookshelf", col: 0.7, row: -1, kind: "bookshelf" },
  { id: "cooler", col: 2.6, row: -1, kind: "cooler" },
  { id: "cabinet", col: 4.9, row: -0.1, kind: "cabinet" },
  // greenery + lamps
  { id: "plantBL", col: -1, row: -1, kind: "plant" },
  { id: "plantR", col: 5.1, row: 1.1, kind: "lamp" },
  { id: "plantFL", col: -1, row: 2.6, kind: "plant" },
  { id: "lampF", col: 3.9, row: 3.0, kind: "lamp" },
  { id: "plantFR", col: 5.2, row: 2.9, kind: "plant" },
  // waiting area (front-left, clear of the desks)
  { id: "coffee", col: 0.1, row: 3.0, kind: "coffee" },
  { id: "chairW", col: 1.1, row: 3.1, kind: "chair" },
];
