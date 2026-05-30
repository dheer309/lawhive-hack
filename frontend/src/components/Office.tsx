"use client";

import { motion } from "framer-motion";
import { AGENTS, AGENT_MAP } from "@/lib/agents";
import type { StageId } from "@/lib/types";
import type { FirmState } from "@/lib/useFirmRun";
import { FURNITURE, FurnitureProp } from "./officeFurniture";

// ---- isometric projection ---------------------------------------------------
const TILE_W = 128;
const TILE_H = 72;
const ORIGIN = { x: 300, y: 150 };
const WALL = 96;
const WAINSCOT = WALL * 0.42;
type Pt = { x: number; y: number };
const project = (col: number, row: number): Pt => ({
  x: ORIGIN.x + (col - row) * (TILE_W / 2),
  y: ORIGIN.y + (col + row) * (TILE_H / 2),
});
const pt = (p: Pt) => `${p.x},${p.y}`;
const rise = (p: Pt, h: number): Pt => ({ x: p.x, y: p.y - h });
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// Two staggered rows of three: the front row is offset ~0.8 col so each back desk
// sits in the GAP between two front desks — keeps nameplates visible + breaks the grid.
const DESKS: { id: StageId; col: number; row: number }[] = [
  { id: "intake", col: 0.0, row: 0.0 },
  { id: "entities", col: 1.7, row: 0.1 },
  { id: "gmail", col: 3.4, row: 0.0 },
  { id: "pack", col: 0.85, row: 1.85 },
  { id: "recommend", col: 2.55, row: 1.95 },
  { id: "synthesis", col: 4.25, row: 1.85 },
];
const P = Object.fromEntries(DESKS.map((d) => [d.id, project(d.col + 0.5, d.row + 0.5)])) as Record<StageId, Pt>;

const A = project(-1, -1);
const B = project(5.5, -1);
const C = project(5.5, 3.4);
const D = project(-1, 3.4);

function ComputerDesk({ accent, active }: { accent: string; active: boolean }) {
  return (
    <svg width="124" height="68" viewBox="0 0 150 82" className="drop-shadow-[0_8px_6px_rgba(50,30,10,0.35)]">
      <path d="M24 32 L75 12 L126 32 L75 52 Z" fill="#a35f30" stroke="#824b25" />
      <path d="M24 32 L75 52 L75 72 L24 52 Z" fill="#763f1f" />
      <path d="M126 32 L75 52 L75 72 L126 52 Z" fill="#874c25" />
      {/* keyboard */}
      <path d="M58 41 L74 35 L88 41 L72 47 Z" fill="#e6e0d0" />
      {/* beige CRT */}
      <path d="M80 16 L93 10 L105 16 L92 22 Z" fill="#e4ddca" />
      <path d="M80 16 L92 22 L92 38 L80 32 Z" fill="#d7cfb8" />
      <path d="M105 16 L92 22 L92 38 L105 32 Z" fill="#cabfa6" />
      <path d="M82 18 L90 15 L90 28 L82 31 Z" fill={active ? accent : "#7d8a72"} />
    </svg>
  );
}

function Plumbob() {
  return (
    <motion.svg width="26" height="40" viewBox="0 0 22 34" animate={{ y: [0, -5, 0], scaleX: [1, 0.62, 1] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }} className="drop-shadow-[0_0_10px_rgba(110,235,40,0.95)]">
      <polygon points="11,0 19,15 11,21 3,15" fill="#86e23a" />
      <polygon points="11,0 11,21 3,15" fill="#5fc41f" />
      <polygon points="3,15 11,21 11,34 3,21" fill="#4ea015" />
      <polygon points="19,15 11,21 11,34 19,21" fill="#62bd1f" />
    </motion.svg>
  );
}

function Bubble({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative mb-1 max-w-[160px] rounded-2xl bg-white px-3 py-1.5 text-center text-[11px] font-medium leading-tight text-ink shadow-lg">
      {text}
      <span className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-white" />
    </motion.div>
  );
}

function CaseFile() {
  return (
    <svg width="40" height="34" viewBox="0 0 34 30" aria-hidden className="drop-shadow-[0_4px_4px_rgba(0,0,0,0.4)]">
      <path d="M2 6a3 3 0 0 1 3-3h8l3 3h10a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3Z" fill="#c9f24d" />
      <rect x="9" y="1" width="16" height="14" rx="2" fill="#fffdf5" stroke="#a8d12f" />
      <path d="M12 6h10M12 9h10M12 12h6" stroke="#a8d12f" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function Blinds({ bl, br, tr, tl }: { bl: Pt; br: Pt; tr: Pt; tl: Pt }) {
  const slats = Array.from({ length: 7 }, (_, k) => {
    const t = (k + 1) / 8;
    const l = mix(tl, bl, t), r = mix(tr, br, t);
    return <line key={k} x1={l.x} y1={l.y} x2={r.x} y2={r.y} stroke="#b9b3a2" strokeWidth="1.6" />;
  });
  return (
    <g>
      <polygon points={[tl, tr, br, bl].map(pt).join(" ")} fill="#f3f1ea" stroke="#d8d2c2" strokeWidth="3" />
      {slats}
    </g>
  );
}

export function Office({ state }: { state: FirmState }) {
  const doneIds = AGENTS.filter((a) => state.statuses[a.id] === "done").map((a) => a.id);
  const focusId: StageId = state.active ?? doneIds[doneIds.length - 1] ?? "intake";
  const focus = P[focusId];

  // windows in the upper (sage) band of each wall
  const winL = { tl: rise(mix(D, A, 0.4), WALL - 14), tr: rise(mix(D, A, 0.64), WALL - 14), br: rise(mix(D, A, 0.64), WAINSCOT + 8), bl: rise(mix(D, A, 0.4), WAINSCOT + 8) };
  const winR = { tl: rise(mix(A, B, 0.5), WALL - 14), tr: rise(mix(A, B, 0.78), WALL - 14), br: rise(mix(A, B, 0.78), WAINSCOT + 8), bl: rise(mix(A, B, 0.5), WAINSCOT + 8) };
  // door on the back-left wall near the left corner
  const door = [rise(mix(D, A, 0.05), 1), rise(mix(D, A, 0.2), 1), rise(mix(D, A, 0.2), WALL - 4), rise(mix(D, A, 0.05), WALL - 4)];
  const puddle = project(2.1, 1.75);

  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-line bg-[#0a0b0d]">
      <div className="z-20 flex items-center justify-between px-4 pt-3">
        <div>
          <p className="label text-muted">The Lawfice · virtual office</p>
          <h2 className="mt-1 font-mono text-sm text-paper/90">
            {state.phase === "done" ? "Case worked — see the board →" : state.active ? AGENT_MAP[state.active].working : "Standing by…"}
          </h2>
        </div>
        <span className="label text-muted">{doneIds.length}/{AGENTS.length}</span>
      </div>

      <div className="relative flex-1">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 46%, rgba(120,130,120,0.16), rgba(10,11,13,0) 64%)" }} />
        <div className="absolute left-1/2 top-1/2" style={{ width: 720, height: 480, transform: "translate(-50%, -50%) scale(0.9)", transformOrigin: "center" }}>
          <svg width="720" height="480" viewBox="0 0 720 480" className="absolute inset-0">
            {/* walls: cream wainscot + sage upper */}
            <polygon points={`${pt(D)} ${pt(A)} ${pt(rise(A, WAINSCOT))} ${pt(rise(D, WAINSCOT))}`} fill="#d8d2c0" />
            <polygon points={`${pt(rise(D, WAINSCOT))} ${pt(rise(A, WAINSCOT))} ${pt(rise(A, WALL))} ${pt(rise(D, WALL))}`} fill="#9aa982" />
            <polygon points={`${pt(A)} ${pt(B)} ${pt(rise(B, WAINSCOT))} ${pt(rise(A, WAINSCOT))}`} fill="#cfc9b6" />
            <polygon points={`${pt(rise(A, WAINSCOT))} ${pt(rise(B, WAINSCOT))} ${pt(rise(B, WALL))} ${pt(rise(A, WALL))}`} fill="#8a9a72" />
            {/* chair rail */}
            <line x1={rise(D, WAINSCOT).x} y1={rise(D, WAINSCOT).y} x2={rise(A, WAINSCOT).x} y2={rise(A, WAINSCOT).y} stroke="#efe9da" strokeWidth="2" />
            <line x1={rise(A, WAINSCOT).x} y1={rise(A, WAINSCOT).y} x2={rise(B, WAINSCOT).x} y2={rise(B, WAINSCOT).y} stroke="#efe9da" strokeWidth="2" />

            {/* door + windows */}
            <polygon points={door.map(pt).join(" ")} fill="#7c4f27" stroke="#efe9da" strokeWidth="3" />
            <circle cx={rise(mix(D, A, 0.185), WALL * 0.5).x} cy={rise(mix(D, A, 0.185), WALL * 0.5).y} r="1.6" fill="#e9d9a0" />
            <Blinds {...winL} />
            <Blinds {...winR} />

            {/* grey office carpet */}
            {[-1, 0, 1, 2, 3, 4, 5].flatMap((i) =>
              [-1, 0, 1, 2, 3].map((j) => {
                const a = project(i, j), b = project(i + 1, j), c = project(i + 1, j + 1), d = project(i, j + 1);
                const dark = (i + j) % 2 === 0;
                return <polygon key={`${i}.${j}`} points={`${pt(a)} ${pt(b)} ${pt(c)} ${pt(d)}`} fill={dark ? "#a4abae" : "#9ba2a6"} stroke="#959ca0" strokeWidth="0.6" />;
              }),
            )}
            {/* the office puddle */}
            <ellipse cx={puddle.x} cy={puddle.y} rx="17" ry="8" fill="#8fc7e0" opacity="0.75" />
            <ellipse cx={puddle.x - 3} cy={puddle.y - 1} rx="7" ry="3" fill="#bfe1ef" opacity="0.7" />

            {state.active && <ellipse cx={focus.x} cy={focus.y + 4} rx="58" ry="27" fill={AGENT_MAP[focusId].accent} opacity="0.2" />}
          </svg>

          {/* furniture (depth-sorted with characters) */}
          {FURNITURE.map((f) => {
            const p = project(f.col + 0.5, f.row + 0.5);
            return (
              <div key={f.id} className="absolute" style={{ left: p.x, top: p.y, transform: "translate(-50%, -84%)", zIndex: Math.round(p.y) }}>
                <FurnitureProp kind={f.kind} />
              </div>
            );
          })}

          {/* workstations */}
          {DESKS.map(({ id }) => {
            const meta = AGENT_MAP[id];
            const p = P[id];
            const status = state.statuses[id];
            const active = status === "active";
            return (
              <div key={id} className="absolute flex w-[160px] flex-col items-center" style={{ left: p.x, top: p.y, transform: "translate(-50%, -76%)", zIndex: Math.round(p.y) + (active ? 1000 : 0) }}>
                {active && <Bubble text={meta.working} />}
                {active && <Plumbob />}
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/characters/${id}.png`} alt={meta.name} draggable={false} className={`pointer-events-none w-auto select-none ${status === "pending" ? "opacity-50 saturate-50" : ""}`} style={{ height: 108, filter: active ? `drop-shadow(0 0 10px ${meta.accent}) drop-shadow(0 3px 3px rgba(0,0,0,0.5))` : "drop-shadow(0 4px 4px rgba(0,0,0,0.45))" }} />
                  {status === "done" && (
                    <span className="absolute right-0 top-3 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-ink shadow" style={{ backgroundColor: meta.accent }}>✓</span>
                  )}
                </div>
                <div className="-mt-[60px]">
                  <ComputerDesk accent={meta.accent} active={active} />
                </div>
                <div className={`-mt-1 rounded px-2 py-0.5 text-center ${active ? "bg-ink" : "bg-black/40"}`} style={active ? { boxShadow: `inset 0 0 0 1px ${meta.accent}` } : undefined}>
                  <p className="text-[11px] font-semibold leading-none text-white">{meta.name}</p>
                  <p className="label mt-0.5 text-[9px] text-white/60">{meta.title}</p>
                </div>
              </div>
            );
          })}

          <motion.div className="pointer-events-none absolute z-[3000] -translate-x-1/2 -translate-y-1/2" initial={false} animate={{ left: focus.x, top: focus.y - 100 }} transition={{ type: "spring", stiffness: 180, damping: 22 }}>
            <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
              <CaseFile />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
