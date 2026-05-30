"use client";

import type { StageId } from "@/lib/types";
import type { AgentStatus } from "@/lib/useFirmRun";

type Face = {
  skin: string;
  hair: string;
  style: "long" | "short" | "bob" | "bun" | "bald" | "cap" | "curly";
  glasses?: boolean;
  beard?: boolean;
};

// A distinct look per member of the firm — cheap variety, no pixel art.
const FACES: Record<StageId, Face> = {
  intake: { skin: "#f0d6bd", hair: "#3a2a22", style: "long" },
  entities: { skin: "#e7c4a0", hair: "#23211f", style: "short", glasses: true },
  gmail: { skin: "#f1dcc6", hair: "#6b3f2a", style: "bob" },
  synthesis: { skin: "#d9b189", hair: "#2b2b2b", style: "short", beard: true },
  recommend: { skin: "#e9cbb0", hair: "#c9c5bd", style: "bald" },
  pack: { skin: "#dcb892", hair: "#241c14", style: "cap" },
};

function Hair({ style, color, accent }: { style: Face["style"]; color: string; accent: string }) {
  switch (style) {
    case "long":
      return (
        <>
          <rect x="29" y="40" width="8" height="30" rx="4" fill={color} />
          <rect x="63" y="40" width="8" height="30" rx="4" fill={color} />
          <path d="M30 46a20 20 0 0 1 40 0c0-16-9-24-20-24S30 30 30 46Z" fill={color} />
        </>
      );
    case "short":
      return <path d="M31 45a19 19 0 0 1 38 0c0-15-8-23-19-23S31 30 31 45Z" fill={color} />;
    case "bob":
      return (
        <path d="M30 58c-2-6-1-12 0-14a20 20 0 0 1 40 0c1 2 2 8 0 14l-6-2c2-8 0-18-14-18S34 48 36 56Z" fill={color} />
      );
    case "bun":
      return (
        <>
          <circle cx="50" cy="20" r="6" fill={color} />
          <path d="M31 45a19 19 0 0 1 38 0c0-15-8-23-19-23S31 30 31 45Z" fill={color} />
        </>
      );
    case "bald":
      return <path d="M33 40c1-12 8-18 17-18s16 6 17 18c-3-6-9-9-17-9s-14 3-17 9Z" fill={color} opacity="0.6" />;
    case "cap":
      return (
        <>
          <path d="M30 41a20 20 0 0 1 40 0l-1 3H31Z" fill={accent} />
          <rect x="46" y="40" width="30" height="6" rx="3" fill={accent} />
        </>
      );
    case "curly":
      return (
        <g fill={color}>
          <circle cx="36" cy="34" r="7" />
          <circle cx="46" cy="28" r="8" />
          <circle cx="56" cy="28" r="8" />
          <circle cx="64" cy="35" r="7" />
        </g>
      );
  }
}

export function CharacterAvatar({
  agent,
  accent,
  status,
  size = 96,
  bare = false,
}: {
  agent: StageId;
  accent: string;
  status: AgentStatus;
  size?: number;
  bare?: boolean; // drop the backdrop disc (for the office scene)
}) {
  const f = FACES[agent];
  const active = status === "active";
  const done = status === "done";
  const dim = status === "pending";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={dim ? "opacity-55 transition-opacity" : "transition-opacity"}
      style={active ? { filter: `drop-shadow(0 0 10px ${accent}66)` } : undefined}
    >
      {!bare && (
        <>
          <circle cx="50" cy="50" r="47" fill="#141518" />
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke={active ? accent : "#2b2d33"}
            strokeWidth={active ? 2.5 : 1.5}
          />
        </>
      )}
      <path d="M22 88a28 28 0 0 1 56 0Z" fill="#3b3e46" />
      <path d="M41 74c3 5 6 8 9 8s6-3 9-8l4 2-13 12-13-12Z" fill={accent} opacity="0.9" />
      <circle cx="50" cy="48" r="18" fill={f.skin} />
      <circle cx="32.5" cy="49" r="3" fill={f.skin} />
      <circle cx="67.5" cy="49" r="3" fill={f.skin} />
      {f.beard && (
        <path d="M35 50c0 12 7 18 15 18s15-6 15-18c-4 6-9 8-15 8s-11-2-15-8Z" fill={f.hair} opacity="0.85" />
      )}
      <Hair style={f.style} color={f.hair} accent={accent} />
      <circle cx="43" cy="49" r="2" fill="#1b1c1f" />
      <circle cx="57" cy="49" r="2" fill="#1b1c1f" />
      {f.glasses && (
        <g fill="none" stroke="#1b1c1f" strokeWidth="1.4">
          <circle cx="43" cy="49" r="5" />
          <circle cx="57" cy="49" r="5" />
          <path d="M48 49h4" />
        </g>
      )}
      <path
        d={active ? "M45 58q5 4 10 0" : "M45 58h10"}
        stroke="#1b1c1f"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {done && (
        <g>
          <circle cx="78" cy="22" r="11" fill={accent} />
          <path d="M73 22l4 4 7-8" stroke="#0b0b0c" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {active && (
        <g>
          <circle className="working-dot" cx="72" cy="20" r="2.4" fill={accent} />
          <circle className="working-dot" cx="80" cy="20" r="2.4" fill={accent} style={{ animationDelay: "0.2s" }} />
          <circle className="working-dot" cx="88" cy="20" r="2.4" fill={accent} style={{ animationDelay: "0.4s" }} />
        </g>
      )}
    </svg>
  );
}
